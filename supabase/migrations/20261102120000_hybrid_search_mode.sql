-- hybrid_search gets a `search_mode` so the evals can measure each half on its own:
--   'hybrid'  vector + keyword merged with RRF (the default, what the app uses)
--   'vector'  only the closest chunks by meaning
--   'keyword' only the best chunks by words
-- The app never passes it. Adding an argument changes the signature, so the old function is
-- dropped first (otherwise both would exist and a call without the new argument is ambiguous).

drop function if exists hybrid_search(text, vector, uuid, uuid, int, int);

create function hybrid_search(
  query_text      text,
  query_embedding vector(1536),
  tech_id         uuid,
  p_guide_id      uuid default null,
  match_count     int  default 20,
  rrf_k           int  default 60,
  search_mode     text default 'hybrid'
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
  if search_mode not in ('hybrid', 'vector', 'keyword') then
    raise exception 'search_mode must be hybrid, vector or keyword (got %)', search_mode;
  end if;

  perform set_config('hnsw.iterative_scan', 'relaxed_order', true);

  return query
  with
  q as (
    select replace(plainto_tsquery('english', query_text)::text, '&', '|')::tsquery as ts
  ),
  semantic as (
    select t.id, row_number() over (order by t.distance) as rank
    from (
      select c.id, c.embedding <=> query_embedding as distance
      from chunks c
      where search_mode <> 'keyword'
        and c.technology_id = tech_id
        and c.embedding is not null
        and (c.expires_at is null or c.expires_at > now())
        and (c.source_type <> 'guide' or c.guide_id = p_guide_id)
      order by c.embedding <=> query_embedding
      limit match_count
    ) t
  ),
  keyword as (
    select t.id, row_number() over (order by t.rank desc) as rank
    from (
      select c.id, ts_rank_cd(c.fts, q.ts) as rank
      from chunks c, q
      where search_mode <> 'vector'
        and c.technology_id = tech_id
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
