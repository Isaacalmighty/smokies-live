-- Smokies Live update 8: "Wrong name?" on map places.
-- Paste into Supabase > SQL Editor > New query, then Run. Safe to run again.
-- (ALL_UPDATES.sql includes this file and every earlier update in order.)
--
-- How it works:
-- * A signed-in person taps a place on the map, then "Wrong name?", and types what it's called
--   now (or says it's closed). One report per person per place; sending again replaces it.
-- * People can read only their own reports.
-- * When 2 different people agree on the same fix for the same place, everyone sees the fix
--   on the map. Nobody can read who reported what; the app only gets the agreed fixes.

create table if not exists public.name_reports (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  old_name text not null check (length(old_name) between 1 and 160),
  new_name text check (new_name is null or length(btrim(new_name)) between 2 and 120),
  closed boolean not null default false,
  lng double precision not null check (lng between -85 and -82),
  lat double precision not null check (lat between 35 and 37),
  kind text not null default 'poi' check (kind in ('poi', 'building', 'peak', 'place')),
  -- places within about 50 m of each other with the same old name count as one place
  spot text generated always as (lower(old_name) || '@' || round(lng::numeric, 3)::text || ',' || round(lat::numeric, 3)::text) stored,
  created_at timestamptz not null default now(),
  check (closed or new_name is not null),
  primary key (user_id, spot)
);
create index if not exists name_reports_spot_idx on public.name_reports (spot);
alter table public.name_reports enable row level security;

drop policy if exists "see my name reports" on public.name_reports;
create policy "see my name reports" on public.name_reports for select to authenticated using (user_id = auth.uid());
drop policy if exists "send a name report" on public.name_reports;
create policy "send a name report" on public.name_reports for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "change my name report" on public.name_reports;
create policy "change my name report" on public.name_reports for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "take back my name report" on public.name_reports;
create policy "take back my name report" on public.name_reports for delete to authenticated using (user_id = auth.uid());

-- The fixes at least 2 people agree on. Runs with the owner's rights so it can count reports,
-- but returns only the place and the fix, never who sent them.
create or replace function public.name_fixes()
returns table (old_name text, new_name text, closed boolean, lng double precision, lat double precision, kind text, votes bigint)
language sql stable security definer set search_path = public as $$
  select min(r.old_name), case when bool_or(r.closed) then null else min(btrim(r.new_name)) end, bool_or(r.closed),
         avg(r.lng), avg(r.lat), min(r.kind), count(distinct r.user_id)
  from public.name_reports r
  group by r.spot, r.closed, lower(btrim(coalesce(r.new_name, '')))
  having count(distinct r.user_id) >= 2
$$;
revoke all on function public.name_fixes() from public;
grant execute on function public.name_fixes() to anon, authenticated;
