-- The chat's answer cache, step 6: count how often each saved answer is served, so the hit rate and
-- the useful answers can be seen (select question, hit_count from chat_cache order by hit_count desc).
-- One atomic increment, so two people hitting the same answer at once are both counted.

create function record_chat_cache_hit(p_id uuid) returns void
language sql
as $$
  update chat_cache set hit_count = hit_count + 1 where id = p_id;
$$;

-- Only server code with the service role may call it.
revoke all on function record_chat_cache_hit(uuid) from public, anon, authenticated;
grant execute on function record_chat_cache_hit(uuid) to service_role;
