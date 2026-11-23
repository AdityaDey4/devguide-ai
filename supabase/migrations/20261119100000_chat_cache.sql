-- The chat's answer cache (semantic cache), step 1: where answers are kept and how one is found.
--
-- A good answer to a question about the SHARED guide is saved with the question's embedding. A
-- later question that means almost the same, on the same guide version, can be answered from here
-- instead of running the whole chat graph.
--
--   chat_cache row = { technology, guide version, question + its embedding, answer, citations }
--   match_chat_cache(embedding, technology, guide version, min similarity) -> the nearest live row
--
-- A person's edited copy is never cached (its text differs from the shared guide). A row belongs to
-- one guide VERSION, so a new version simply finds nothing: the old rows are never served again and
-- can be deleted at any time. Rows also expire (expires_at).
--
-- Writes come from server code only (service role, which bypasses RLS). RLS is on with no policy
-- on purpose: signed-in users cannot read or write the cache directly.

create table chat_cache (
  id                uuid primary key default gen_random_uuid(),
  technology_id     uuid not null references technologies(id) on delete cascade,
  guide_id          uuid not null references guides(id) on delete cascade,
  guide_version_id  uuid not null references guide_versions(id) on delete cascade,
  question          text not null,
  question_embedding vector(1536) not null,
  answer            text not null,
  citations         jsonb not null default '[]'::jsonb,
  origin            text not null check (origin in ('guide', 'stored_docs', 'fetched_now')),
  hit_count         int  not null default 0,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null
);

create index chat_cache_embedding_hnsw on chat_cache using hnsw (question_embedding vector_cosine_ops);
create index chat_cache_scope on chat_cache (technology_id, guide_version_id);
create index chat_cache_expires on chat_cache (expires_at);

alter table chat_cache enable row level security;

-- Nearest live cached answer for a question, or no row. `similarity` is 1 for identical meaning
-- (cosine similarity); only rows at or above `min_similarity` are returned.
create function match_chat_cache(
  query_embedding  vector(1536),
  p_technology_id  uuid,
  p_guide_version_id uuid,
  min_similarity   float default 0.95
)
returns table (
  id         uuid,
  question   text,
  answer     text,
  citations  jsonb,
  origin     text,
  similarity float
)
language plpgsql
stable
as $$
begin
  perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  return query
    select c.id, c.question, c.answer, c.citations, c.origin,
           (1 - (c.question_embedding <=> query_embedding))::float as similarity
    from chat_cache c
    where c.technology_id = p_technology_id
      and c.guide_version_id = p_guide_version_id
      and c.expires_at > now()
      and 1 - (c.question_embedding <=> query_embedding) >= min_similarity
    order by c.question_embedding <=> query_embedding
    limit 1;
end;
$$;

-- Only server code with the service role may call it.
revoke all on function match_chat_cache(vector, uuid, uuid, float) from public, anon, authenticated;
grant execute on function match_chat_cache(vector, uuid, uuid, float) to service_role;
