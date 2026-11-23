-- The chat's answer cache, step 5: cached answers go away when the guide they were written for
-- changes.
--
-- A cached row already belongs to one guide VERSION, so a new version can never be served an old
-- answer. This trigger also DELETES the old rows the moment the guide's current version changes
-- (a regenerated guide, a version removed), so they do not pile up. A trigger covers every code
-- path that changes a guide, now and later.
--
-- Rows that expire are removed by the app when it saves a new answer (lib/chat/cache).

create function clear_chat_cache_for_guide() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from chat_cache where guide_id = new.id;
  return new;
end;
$$;

-- Only the trigger runs it.
revoke all on function clear_chat_cache_for_guide() from public, anon, authenticated;

create trigger guides_clear_chat_cache
  after update of current_version_id on guides
  for each row
  when (old.current_version_id is distinct from new.current_version_id)
  execute function clear_chat_cache_for_guide();
