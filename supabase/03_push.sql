-- Smokies Live: phone app neighbor alerts (push notifications).
-- Paste into Supabase > SQL Editor > New query, then Run. Safe to run again.

create table if not exists public.devices (
  token text primary key,                                   -- APNs (iOS) or FCM (Android) device token
  platform text not null check (platform in ('ios', 'android')),
  user_id uuid references auth.users on delete cascade,     -- null until the person signs in
  lng double precision check (lng between -180 and 180),    -- rough area (3 decimals, about 100 m) for local alerts
  lat double precision check (lat between -90 and 90),
  topics text[] not null default '{alerts}',
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
create index if not exists devices_user_idx on public.devices (user_id);

-- Nobody reads or writes the table directly from the app; only the function below and the server.
alter table public.devices enable row level security;
revoke all on public.devices from anon, authenticated;

create or replace function public.register_device(p_token text, p_platform text, p_lng double precision default null,
  p_lat double precision default null, p_topics text[] default '{alerts}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or length(p_token) < 20 or length(p_token) > 400 then raise exception 'bad token'; end if;
  insert into public.devices (token, platform, user_id, lng, lat, topics)
  values (p_token, p_platform, auth.uid(), round(p_lng::numeric, 3), round(p_lat::numeric, 3), coalesce(p_topics, '{alerts}'))
  on conflict (token) do update set
    platform = excluded.platform,
    user_id = coalesce(auth.uid(), public.devices.user_id),
    lng = coalesce(excluded.lng, public.devices.lng),
    lat = coalesce(excluded.lat, public.devices.lat),
    topics = excluded.topics,
    seen_at = now();
end $$;
revoke all on function public.register_device(text, text, double precision, double precision, text[]) from public;
grant execute on function public.register_device(text, text, double precision, double precision, text[]) to anon, authenticated;
