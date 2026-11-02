-- Shared knowledge store: technologies, sources, chunks (docs/03-Architecture.md section 4).
-- Shared tables: every signed-in user may read, only server code (service role) may write.

-- ---------------------------------------------------------------------------
-- technologies
-- ---------------------------------------------------------------------------
create table technologies (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text unique not null,
  aliases        text[] not null default '{}',
  official_url   text,
  docs_url       text,
  latest_version text,
  created_at     timestamptz not null default now()
);

-- Fuzzy name search for suggestions (FR-SRCH) and alias lookup.
create index technologies_name_trgm on technologies using gin (name gin_trgm_ops);
create index technologies_aliases on technologies using gin (aliases);

-- ---------------------------------------------------------------------------
-- sources: one row per fetched page
-- ---------------------------------------------------------------------------
create table sources (
  id            uuid primary key default gen_random_uuid(),
  technology_id uuid not null references technologies(id) on delete cascade,
  url           text not null,
  title         text,
  source_type   text not null check (source_type in ('official', 'context7', 'guide')),
  content_hash  text,
  fetched_at    timestamptz not null default now(),
  unique (technology_id, url)
);

-- ---------------------------------------------------------------------------
-- chunks: searchable pieces of pages (and, later, of guides)
-- ---------------------------------------------------------------------------
create table chunks (
  id            uuid primary key default gen_random_uuid(),
  technology_id uuid not null references technologies(id) on delete cascade,
  source_id     uuid references sources(id) on delete cascade,
  -- Only set when source_type = 'guide'. The foreign key to guides(id) is added in M3,
  -- when that table exists.
  guide_id      uuid,
  source_type   text not null check (source_type in ('official', 'context7', 'guide')),
  content       text not null check (char_length(content) > 0),
  heading_path  text,
  tech_version  text,
  content_hash  text not null,
  -- text-embedding-3-small is 1536 dimensions; changing the model means a new migration.
  embedding     vector(1536),
  fts           tsvector generated always as (
                  to_tsvector('english', coalesce(heading_path, '') || ' ' || content)
                ) stored,
  fetched_at    timestamptz not null default now(),
  expires_at    timestamptz,
  -- Deduplication (FR-KB-4): the same text is stored once per technology.
  unique (technology_id, content_hash)
);

create index chunks_embedding_hnsw on chunks using hnsw (embedding vector_cosine_ops);
create index chunks_fts on chunks using gin (fts);
create index chunks_technology_source_type on chunks (technology_id, source_type);
create index chunks_source_id on chunks (source_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: read-only for signed-in users; writes need the service role,
-- which bypasses RLS. No insert/update/delete policies exist on purpose.
-- ---------------------------------------------------------------------------
alter table technologies enable row level security;
alter table sources      enable row level security;
alter table chunks       enable row level security;

create policy "signed-in users can read technologies"
  on technologies for select to authenticated using (true);
create policy "signed-in users can read sources"
  on sources for select to authenticated using (true);
create policy "signed-in users can read chunks"
  on chunks for select to authenticated using (true);
