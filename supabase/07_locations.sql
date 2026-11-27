-- Smokies Live update 7: family locations on the map.
-- Paste into Supabase > SQL Editor > New query, then Run. Safe to run again.
-- (ALL_UPDATES.sql includes this file and every earlier update in order.)
--
-- How privacy works:
-- * Nobody shares anything until they switch sharing on for one group. Off is the default.
-- * Sharing is per group: sharing with "Family" shows you to Family only, never to another group.
-- * Only members of that group can read your spot. The database enforces it (row level security),
--   so it holds no matter what app or tool asks.
-- * Turning sharing off deletes your row. Leaving a group, or being removed, deletes it too.
-- * Every share has an end time (1 hour, until tonight, or up to 7 days) and is hidden the moment it passes.
-- * Only your newest spot is kept: there is no history of where you have been.

create table if not exists public.member_locations (
  group_id uuid not null,
  user_id uuid not null default auth.uid(),
  lng double precision not null check (lng between -180 and 180),
  lat double precision not null check (lat between -90 and 90),
  accuracy real check (accuracy is null or accuracy >= 0),
  heading real check (heading is null or (heading >= 0 and heading < 360)),
  speed real check (speed is null or speed >= 0),
  until timestamptz not null default now() + interval '1 hour'
    check (until <= now() + interval '7 days 1 minute'),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id),
  -- tied to the membership itself: leave or get removed and your spot goes with it
  foreign key (group_id, user_id) references public.group_members (group_id, user_id) on delete cascade
);
alter table public.member_locations enable row level security;

-- read: fellow members of that group, and only while the share is still running
drop policy if exists "members see shared spots" on public.member_locations;
create policy "members see shared spots" on public.member_locations for select to authenticated
  using (public.is_member(group_id) and until > now());

-- write: only your own row, only in a group you belong to
drop policy if exists "share my spot" on public.member_locations;
create policy "share my spot" on public.member_locations for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(group_id));
drop policy if exists "move my spot" on public.member_locations;
create policy "move my spot" on public.member_locations for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(group_id));
drop policy if exists "stop sharing" on public.member_locations;
create policy "stop sharing" on public.member_locations for delete to authenticated
  using (user_id = auth.uid());

-- the server stamps the time, so nobody can fake "just now"
create or replace function public.stamp_location() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists on_location_stamp on public.member_locations;
create trigger on_location_stamp before insert or update on public.member_locations
  for each row execute function public.stamp_location();

grant select, insert, update, delete on public.member_locations to authenticated;
revoke all on public.member_locations from anon;

-- "Stop sharing everywhere" in one tap
create or replace function public.stop_sharing_all() returns void
language sql security invoker set search_path = public as $$
  delete from public.member_locations where user_id = auth.uid();
$$;

-- expired shares are already invisible; this clears them out of the table every 15 minutes
select cron.schedule('smokies-locations', '*/15 * * * *', $job$ delete from public.member_locations where until < now() $job$);
