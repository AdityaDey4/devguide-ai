-- Guide generation (M3): guides, their versions, generation runs and the run's progress events
-- (docs/03-Architecture.md section 4). Writes come only from server code (service role, which
-- bypasses RLS), so there are no insert/update/delete policies on purpose.

-- ---------------------------------------------------------------------------
-- guides: one canonical guide per technology (owner_id null) plus personal forks
-- ---------------------------------------------------------------------------
create table guides (
  id                 uuid primary key default gen_random_uuid(),
  technology_id      uuid not null references technologies(id) on delete cascade,
  owner_id           uuid references auth.users(id) on delete cascade, -- null = canonical guide
  forked_from        uuid references guides(id) on delete set null,
  current_version_id uuid, -- foreign key added below, after guide_versions exists
  status             text not null default 'generating'
                       check (status in ('generating', 'ready', 'failed', 'partial')),
  last_refreshed_at  timestamptz,
  created_at         timestamptz not null default now(),
  unique (technology_id, owner_id)
);

-- A unique constraint treats nulls as different, so on its own it would allow any number of
-- canonical guides for one technology. This index allows exactly one.
create unique index one_canonical_guide_per_technology
  on guides (technology_id) where owner_id is null;

create index guides_owner on guides (owner_id) where owner_id is not null;

-- ---------------------------------------------------------------------------
-- guide_versions: every saved state of a guide's sections (history, restore, edits)
-- ---------------------------------------------------------------------------
create table guide_versions (
  id          uuid primary key default gen_random_uuid(),
  guide_id    uuid not null references guides(id) on delete cascade,
  version_no  int  not null check (version_no > 0),
  -- [{ key, title, markdown, citations: [{ n, url, title }], needs_review }]
  sections    jsonb not null check (jsonb_typeof(sections) = 'array'),
  author_type text not null check (author_type in ('agent', 'user')),
  author_id   uuid,
  change_note text,
  created_at  timestamptz not null default now(),
  unique (guide_id, version_no)
);

-- The circular link (a guide points at its current version, a version belongs to a guide).
-- If the version is ever deleted the guide just has no current version.
alter table guides
  add constraint guides_current_version_fk
  foreign key (current_version_id) references guide_versions(id) on delete set null;

-- chunks.guide_id was left without a foreign key in the knowledge-tables migration, waiting for
-- this table. Deleting a guide now deletes the chunks made from it.
alter table chunks
  add constraint chunks_guide_fk
  foreign key (guide_id) references guides(id) on delete cascade;
create index chunks_guide_id on chunks (guide_id) where guide_id is not null;

-- ---------------------------------------------------------------------------
-- runs: one execution of an agent graph
-- ---------------------------------------------------------------------------
create table runs (
  id            uuid primary key default gen_random_uuid(),
  type          text not null check (type in ('generate', 'edit', 'refresh', 'chat_research')),
  technology_id uuid references technologies(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  status        text not null default 'queued'
                  check (status in ('queued', 'running', 'waiting_user', 'completed', 'failed')),
  budget        jsonb not null default '{}', -- { steps, fetches, started_at }
  error         text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz -- set when the run completes or fails (average duration, FR-ADMIN)
);

-- BR-1: at most one active generation per technology. A second person searching the same
-- technology joins the running one instead of starting another.
create unique index one_active_generate_per_tech
  on runs (technology_id)
  where type = 'generate' and status in ('queued', 'running', 'waiting_user');

create index runs_user on runs (user_id, created_at desc);
create index runs_technology on runs (technology_id, created_at desc);

-- ---------------------------------------------------------------------------
-- run_events: the progress feed the UI listens to
-- ---------------------------------------------------------------------------
create table run_events (
  id         bigserial primary key,
  run_id     uuid not null references runs(id) on delete cascade,
  -- identified, docs_found, outline, section_started, section_delta, section_done, checking,
  -- completed, failed
  type       text not null,
  payload    jsonb,
  created_at timestamptz not null default now()
);

-- "Give me this run's events after id N" (reconnect) is the one query that matters.
create index run_events_run_id_id on run_events (run_id, id);

-- Live updates: the browser subscribes to inserts on this table with Supabase Realtime.
alter publication supabase_realtime add table run_events;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table guides         enable row level security;
alter table guide_versions enable row level security;
alter table runs           enable row level security;
alter table run_events     enable row level security;

-- Canonical guides are for everyone signed in; a fork only for its owner.
create policy "read canonical guides and your own"
  on guides for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));

create policy "read versions of guides you can read"
  on guide_versions for select to authenticated
  using (exists (
    select 1 from guides g
    where g.id = guide_versions.guide_id
      and (g.owner_id is null or g.owner_id = (select auth.uid()))
  ));

-- Generation is shared (everyone waiting for the same technology watches the same run), so any
-- signed-in user may read those. Other kinds of run (edits, refreshes, chat research) belong to
-- the person who started them.
create policy "read shared generation runs and your own"
  on runs for select to authenticated
  using (type = 'generate' or user_id = (select auth.uid()));

create policy "read events of runs you can read"
  on run_events for select to authenticated
  using (exists (
    select 1 from runs r
    where r.id = run_events.run_id
      and (r.type = 'generate' or r.user_id = (select auth.uid()))
  ));
