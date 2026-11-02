-- Hybrid search (FR-CHAT-3): meaning (vector) + words (keyword), merged with
-- Reciprocal Rank Fusion. See docs/03-Architecture.md section 4.
--
--   select * from hybrid_search('how do I validate an email', <embedding>, <technology id>);
--
-- A chunk's score is 1/(k+rank in vector list) + 1/(k+rank in keyword list), so a chunk that
-- both lists like beats a chunk only one of them likes.

create or replace function hybrid_search(
  query_text      text,
  query_embedding vector(1536),
  tech_id         uuid,
  p_guide_id      uuid default null,
  match_count     int  default 20,
  rrf_k           int  default 60
)
returns table (
  id           uuid,
  content      text,
  heading_path text,
  source_type  text,
  source_id    uuid,
  source_url   text,
  source_title text,
  score        float
)
language plpgsql
stable
as $$
begin
  -- The technology filter can leave the HNSW index with too few matches; this makes it keep
  -- scanning until `match_count` rows are found (pgvector 0.8). Applies to this query only.
  -- (A `set` clause on the function is refused for pgvector settings, so it is set here.)
  perform set_config('hnsw.iterative_scan', 'relaxed_order', true);

  return query
  with
  -- Words, as an OR query: "how do I validate an email" must not require every word to match.
  -- plainto_tsquery drops stop words and stems ("validate" -> "validat"); '&' becomes '|'.
  q as (
    select replace(plainto_tsquery('english', query_text)::text, '&', '|')::tsquery as ts
  ),
  -- The 20 closest chunks by meaning. The filter sits directly on `chunks` (not in a shared
  -- CTE) so Postgres can use the HNSW index.
  semantic as (
    select t.id, row_number() over (order by t.distance) as rank
    from (
      select c.id, c.embedding <=> query_embedding as distance
      from chunks c
      where c.technology_id = tech_id
        and c.embedding is not null
        and (c.expires_at is null or c.expires_at > now())
        and (c.source_type <> 'guide' or c.guide_id = p_guide_id)
      order by c.embedding <=> query_embedding
      limit match_count
    ) t
  ),
  -- The 20 best chunks by words (uses the GIN index on `fts`).
  keyword as (
    select t.id, row_number() over (order by t.rank desc) as rank
    from (
      select c.id, ts_rank_cd(c.fts, q.ts) as rank
      from chunks c, q
      where c.technology_id = tech_id
        and c.fts @@ q.ts
        and (c.expires_at is null or c.expires_at > now())
        and (c.source_type <> 'guide' or c.guide_id = p_guide_id)
      order by ts_rank_cd(c.fts, q.ts) desc
      limit match_count
    ) t
  )
  select c.id, c.content, c.heading_path, c.source_type, c.source_id,
         s.url, s.title,
         (coalesce(1.0 / (rrf_k + sem.rank), 0)
          + coalesce(1.0 / (rrf_k + kw.rank), 0))::float as score
  from semantic sem
  full outer join keyword kw on kw.id = sem.id
  join chunks c on c.id = coalesce(sem.id, kw.id)
  left join sources s on s.id = c.source_id
  order by score desc
  limit match_count;
end;
$$;
