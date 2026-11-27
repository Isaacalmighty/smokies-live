-- Smokies Live: ALL database updates in one paste (2, 3, push, 4 news, 5 videos/messages/notifications, 6 tags).
-- Supabase > SQL Editor > New query > paste everything > Run. Safe to run again, even if you ran some before.
-- Needs the base setup.sql to have been run once (you did that when sign-in started working).

-- ================================================================ 02_report_votes.sql
-- Smokies Live update 2: "Still there" / "Cleared" answers on community reports.
-- Paste all of this into Supabase > SQL Editor > New query, then press Run. Safe to run again.
create table if not exists public.report_votes (
  post_id uuid not null references public.posts on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  vote text not null check (vote in ('still', 'cleared')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists report_votes_post_idx on public.report_votes (post_id);
alter table public.report_votes enable row level security;
drop policy if exists "votes readable" on public.report_votes;
create policy "votes readable" on public.report_votes for select using (true);
drop policy if exists "vote as yourself" on public.report_votes;
create policy "vote as yourself" on public.report_votes for insert with check (auth.uid() = user_id);
drop policy if exists "change own vote" on public.report_votes;
create policy "change own vote" on public.report_votes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "remove own vote" on public.report_votes;
create policy "remove own vote" on public.report_votes for delete using (auth.uid() = user_id);
grant select on public.report_votes to anon, authenticated;
grant insert, update, delete on public.report_votes to authenticated;
do $$ begin alter publication supabase_realtime add table public.report_votes; exception when duplicate_object then null; end $$;

-- ================================================================ 03_groups.sql
-- Smokies Live update 3: private groups (families, friends, neighborhoods).
-- Paste all of this into Supabase > SQL Editor > New query, then press Run. Safe to run again.
--
-- How privacy works: a post with a group_id can only be read by members of that group.
-- The database enforces it (row level security), so it holds no matter what app or tool asks.
-- Comments, likes and report answers on a group post are just as private, and group photos
-- live in a private storage bucket that only members can open.

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  emoji text not null default '🏕️' check (char_length(emoji) <= 8),
  color text not null default '#3f8f4f' check (color ~ '^#[0-9a-fA-F]{6}$'),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_by uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);

alter table public.posts add column if not exists group_id uuid references public.groups on delete cascade;
create index if not exists posts_group_idx on public.posts (group_id, created_at desc);

-- membership checks run with owner rights so policies can use them without looping back into themselves
create or replace function public.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid());
$$;
create or replace function public.is_owner(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid() and role = 'owner');
$$;

-- whoever creates a group becomes its owner
create or replace function public.handle_new_group() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.group_members (group_id, user_id, role) values (new.id, new.created_by, 'owner') on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_group_created on public.groups;
create trigger on_group_created after insert on public.groups for each row execute function public.handle_new_group();

-- create a group and become its owner in one step
create or replace function public.create_group(gname text, gemoji text default '🏕️', gcolor text default '#3f8f4f') returns public.groups
language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if (select count(*) from public.groups where created_by = auth.uid()) >= 20 then raise exception 'You have made the most groups allowed'; end if;
  insert into public.groups (name, emoji, color, created_by) values (trim(gname), coalesce(gemoji, '🏕️'), coalesce(gcolor, '#3f8f4f'), auth.uid()) returning * into g;
  return g;
end $$;

-- join with an invite code (people outside a group can't look groups up any other way)
create or replace function public.join_group(code text) returns public.groups
language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into g from public.groups where invite_code = upper(trim(code));
  if g.id is null then raise exception 'No group has that code'; end if;
  if (select count(*) from public.group_members where group_id = g.id) >= 200 then raise exception 'That group is full'; end if;
  insert into public.group_members (group_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  return g;
end $$;

-- owners can retire an invite code (old links stop working)
create or replace function public.new_invite_code(gid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
begin
  if not public.is_owner(gid) then raise exception 'Only the group owner can do that'; end if;
  update public.groups set invite_code = c where id = gid;
  return c;
end $$;

revoke all on function public.create_group(text, text, text) from public, anon;
grant execute on function public.create_group(text, text, text) to authenticated;
revoke all on function public.join_group(text) from public, anon;
revoke all on function public.new_invite_code(uuid) from public, anon;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.new_invite_code(uuid) to authenticated;
grant execute on function public.is_member(uuid) to anon, authenticated;
grant execute on function public.is_owner(uuid) to anon, authenticated;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

drop policy if exists "members see their groups" on public.groups;
create policy "members see their groups" on public.groups for select using (public.is_member(id));
drop policy if exists "create a group" on public.groups;
create policy "create a group" on public.groups for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "owners edit groups" on public.groups;
create policy "owners edit groups" on public.groups for update using (public.is_owner(id)) with check (public.is_owner(id));
drop policy if exists "owners delete groups" on public.groups;
create policy "owners delete groups" on public.groups for delete using (public.is_owner(id));

drop policy if exists "members see members" on public.group_members;
create policy "members see members" on public.group_members for select using (public.is_member(group_id));
drop policy if exists "leave or remove" on public.group_members;
create policy "leave or remove" on public.group_members for delete using (user_id = auth.uid() or (public.is_owner(group_id) and role <> 'owner'));
-- no insert policy on purpose: people join only through join_group() or by creating a group

-- posts: public posts as before; group posts only for members
drop policy if exists "posts readable" on public.posts;
create policy "posts readable" on public.posts for select using (
  case when group_id is null then (not hidden or auth.uid() = user_id) else public.is_member(group_id) end);
drop policy if exists "post as yourself" on public.posts;
create policy "post as yourself" on public.posts for insert with check (
  auth.uid() = user_id and hidden = false and (group_id is null or public.is_member(group_id)));
drop policy if exists "edit own posts" on public.posts;
create policy "edit own posts" on public.posts for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and hidden = false and (group_id is null or public.is_member(group_id)));
drop policy if exists "group owners remove posts" on public.posts;
create policy "group owners remove posts" on public.posts for delete using (group_id is not null and public.is_owner(group_id));

-- likes, comments and report answers follow the post: if you can't see the post, you can't see or add them
drop policy if exists "likes readable" on public.likes;
create policy "likes readable" on public.likes for select using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "like as yourself" on public.likes;
create policy "like as yourself" on public.likes for insert with check (auth.uid() = user_id and exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "comments readable" on public.comments;
create policy "comments readable" on public.comments for select using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "comment as yourself" on public.comments;
create policy "comment as yourself" on public.comments for insert with check (auth.uid() = user_id and exists (select 1 from public.posts p where p.id = post_id));
do $$ begin
  if to_regclass('public.report_votes') is not null then
    execute 'drop policy if exists "votes readable" on public.report_votes';
    execute 'create policy "votes readable" on public.report_votes for select using (exists (select 1 from public.posts p where p.id = post_id))';
    execute 'drop policy if exists "vote as yourself" on public.report_votes';
    execute 'create policy "vote as yourself" on public.report_votes for insert with check (auth.uid() = user_id and exists (select 1 from public.posts p where p.id = post_id))';
  end if;
end $$;

-- the feed view gains group_id (it reads through the policies above, so group posts stay private)
drop view if exists public.post_feed;
create view public.post_feed with (security_invoker = on) as
  select p.*, pr.handle, pr.name, pr.avatar_url,
    (select count(*) from public.likes l where l.post_id = p.id)::int as like_count,
    (select count(*) from public.comments c where c.post_id = p.id)::int as comment_count
  from public.posts p join public.profiles pr on pr.id = p.user_id;
grant select on public.post_feed to anon, authenticated;

grant select, insert, update, delete on public.groups to authenticated;
grant select, delete on public.group_members to authenticated;
revoke insert, update on public.group_members from anon, authenticated;

do $$ begin alter publication supabase_realtime add table public.group_members; exception when duplicate_object then null; end $$;

-- private photo bucket: files live at {group_id}/{name}.jpg and only members can open or add them
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('group-photos', 'group-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
drop policy if exists "group photos for members" on storage.objects;
create policy "group photos for members" on storage.objects for select to authenticated
  using (bucket_id = 'group-photos' and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "members add group photos" on storage.objects;
create policy "members add group photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'group-photos' and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "remove own group photos" on storage.objects;
create policy "remove own group photos" on storage.objects for delete to authenticated
  using (bucket_id = 'group-photos' and (owner = auth.uid() or public.is_owner(((storage.foldername(name))[1])::uuid)));

-- ================================================================ 03_push.sql
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

-- ================================================================ 04_news.sql
-- Smokies Live update 4: local news straight into the feed, refreshed every 5 minutes.
-- First deploy the "news" Edge Function (see supabase/functions/news/index.ts), then paste all of
-- this into Supabase > SQL Editor > New query and press Run. Safe to run again.

create table if not exists public.news_items (
  id text primary key,                       -- normalized headline, so the same story from two feeds is one post
  source text not null,
  title text not null,
  summary text,
  link text,
  img text,
  published timestamptz not null default now(),
  place jsonb,                               -- {name, lng, lat, kind} where the story happens, when we can tell
  seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists news_items_published_idx on public.news_items (published desc);

alter table public.news_items enable row level security;
drop policy if exists "news readable" on public.news_items;
create policy "news readable" on public.news_items for select using (true);
-- no insert/update policies: only the news function (server key) writes here
grant select on public.news_items to anon, authenticated;

do $$ begin alter publication supabase_realtime add table public.news_items; exception when duplicate_object then null; end $$;

-- run the collector every 5 minutes
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin perform cron.unschedule('smokies-news'); exception when others then null; end $$;
select cron.schedule('smokies-news', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://uamuqhkpbszogmdusfqr.supabase.co/functions/v1/news',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);

-- and once right now, so the feed fills without waiting
select net.http_post(url := 'https://uamuqhkpbszogmdusfqr.supabase.co/functions/v1/news', headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 60000);

-- ================================================================ 05_videos_messages.sql
-- Smokies Live update 5: video posts, direct messages, notifications, and storage clean-up.
-- Paste all of this into Supabase > SQL Editor > New query, then press Run. Safe to run again.
-- (Or run ALL_UPDATES.sql, which includes this file and every earlier update in order.)

------------------------------------------------------------------------------------------------
-- 1. VIDEOS
-- A video post is a normal post with a cover photo in image_url and the clip in video_url.
-- Clips are shrunk on the phone to 720p and at most 60 seconds (about 15 MB), so the free
-- 1 GB of storage holds hundreds of them. video_meta keeps {dur, w, h} so a full-screen
-- swipeable "reels" feed can pick vertical clips later. Group videos live in the private
-- group-photos bucket, so only members can play them.
------------------------------------------------------------------------------------------------
alter table public.posts add column if not exists video_url text;
alter table public.posts add column if not exists video_meta jsonb;
alter table public.posts drop constraint if exists posts_video_url_check;
alter table public.posts add constraint posts_video_url_check
  check (video_url is null or video_url like 'gp:%' or video_url like 'https://%');
create index if not exists posts_video_idx on public.posts (created_at desc) where video_url is not null;

-- the feed view picks up the new columns (it still reads through the privacy rules)
drop view if exists public.post_feed;
create view public.post_feed with (security_invoker = on) as
  select p.*, pr.handle, pr.name, pr.avatar_url,
    (select count(*) from public.likes l where l.post_id = p.id)::int as like_count,
    (select count(*) from public.comments c where c.post_id = p.id)::int as comment_count
  from public.posts p join public.profiles pr on pr.id = p.user_id;
grant select on public.post_feed to anon, authenticated;

-- both photo buckets take short videos now, 25 MB per file at most
update storage.buckets
  set file_size_limit = 26214400,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
  where id in ('photos', 'group-photos');

------------------------------------------------------------------------------------------------
-- 2. DIRECT MESSAGES (one-to-one)
-- Only the two people in a conversation can read it; the database enforces that.
-- Anyone can be blocked, and a block stops new messages both ways.
------------------------------------------------------------------------------------------------
create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references public.profiles on delete cascade,   -- the smaller id of the two
  b uuid not null references public.profiles on delete cascade,
  last_at timestamptz not null default now(),
  last_text text,
  last_from uuid,
  a_read timestamptz not null default now(),
  b_read timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (a < b), unique (a, b)
);
create index if not exists dm_threads_a_idx on public.dm_threads (a, last_at desc);
create index if not exists dm_threads_b_idx on public.dm_threads (b, last_at desc);

create table if not exists public.dm_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.dm_threads on delete cascade,
  sender uuid not null default auth.uid() references public.profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists dm_messages_thread_idx on public.dm_messages (thread_id, created_at desc);

create table if not exists public.blocks (
  blocker uuid not null default auth.uid() references public.profiles on delete cascade,
  blocked uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

create or replace function public.in_dm(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.dm_threads where id = tid and auth.uid() in (a, b));
$$;
create or replace function public.blocked_between(x uuid, y uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where (blocker = x and blocked = y) or (blocker = y and blocked = x));
$$;

-- open (or find) the conversation with someone
create or replace function public.start_dm(other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t uuid;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if other is null or other = me then raise exception 'Pick someone else to message'; end if;
  if not exists (select 1 from public.profiles where id = other) then raise exception 'That person is not here'; end if;
  if public.blocked_between(me, other) then raise exception 'You can''t message this person'; end if;
  insert into public.dm_threads (a, b) values (least(me, other), greatest(me, other)) on conflict (a, b) do nothing;
  select id into t from public.dm_threads where a = least(me, other) and b = greatest(me, other);
  return t;
end $$;

-- mark a conversation read up to now
create or replace function public.read_dm(tid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.dm_threads set a_read = now() where id = tid and a = auth.uid();
  update public.dm_threads set b_read = now() where id = tid and b = auth.uid();
  update public.notifications set read_at = now() where user_id = auth.uid() and thread_id = tid and read_at is null;
end $$;

alter table public.dm_threads enable row level security;
alter table public.dm_messages enable row level security;
alter table public.blocks enable row level security;

drop policy if exists "see your conversations" on public.dm_threads;
create policy "see your conversations" on public.dm_threads for select using (auth.uid() in (a, b));
drop policy if exists "see your messages" on public.dm_messages;
create policy "see your messages" on public.dm_messages for select using (public.in_dm(thread_id));
drop policy if exists "send as yourself" on public.dm_messages;
create policy "send as yourself" on public.dm_messages for insert to authenticated with check (
  sender = auth.uid() and public.in_dm(thread_id)
  and not exists (select 1 from public.dm_threads t where t.id = thread_id and public.blocked_between(t.a, t.b)));
drop policy if exists "unsend your own" on public.dm_messages;
create policy "unsend your own" on public.dm_messages for delete using (sender = auth.uid());
drop policy if exists "your blocks" on public.blocks;
create policy "your blocks" on public.blocks for select using (blocker = auth.uid());
drop policy if exists "block someone" on public.blocks;
create policy "block someone" on public.blocks for insert to authenticated with check (blocker = auth.uid() and blocked <> auth.uid());
drop policy if exists "unblock" on public.blocks;
create policy "unblock" on public.blocks for delete using (blocker = auth.uid());

revoke all on public.dm_threads, public.dm_messages, public.blocks from anon;
grant select on public.dm_threads to authenticated;
grant select, insert, delete on public.dm_messages to authenticated;
grant select, insert, delete on public.blocks to authenticated;
revoke all on function public.start_dm(uuid) from public, anon;
revoke all on function public.read_dm(uuid) from public, anon;
grant execute on function public.start_dm(uuid) to authenticated;
grant execute on function public.read_dm(uuid) to authenticated;
grant execute on function public.in_dm(uuid) to authenticated;
grant execute on function public.blocked_between(uuid, uuid) to authenticated;

------------------------------------------------------------------------------------------------
-- 3. NOTIFICATIONS
-- Written only by the database itself (triggers below), read only by the person they're for.
-- Likes on the same post fold into one line ("Sam and 4 others liked your post").
------------------------------------------------------------------------------------------------
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,  -- who it's for
  actor uuid references public.profiles on delete cascade,             -- who did it
  kind text not null check (kind in ('like', 'comment', 'dm', 'group_post', 'group_join')),
  post_id uuid references public.posts on delete cascade,
  thread_id uuid references public.dm_threads on delete cascade,
  group_id uuid,
  n int not null default 1,
  text text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  pushed_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "your notifications" on public.notifications;
create policy "your notifications" on public.notifications for select using (user_id = auth.uid());
drop policy if exists "mark yours read" on public.notifications;
create policy "mark yours read" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "clear yours" on public.notifications;
create policy "clear yours" on public.notifications for delete using (user_id = auth.uid());
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- hand a fresh notification to the phone push function (does nothing until push is set up)
create or replace function public.push_notification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform net.http_post(
      url := 'https://uamuqhkpbszogmdusfqr.supabase.co/functions/v1/send-push',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('notification_id', new.id),
      timeout_milliseconds := 8000);
  exception when others then null; -- push is a bonus: never block the like, comment or message
  end;
  return new;
end $$;
drop trigger if exists on_notification_push on public.notifications;
create trigger on_notification_push after insert on public.notifications for each row execute function public.push_notification();

create or replace function public.notify_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; nid bigint;
begin
  select user_id into owner from public.posts where id = new.post_id;
  if owner is null or owner = new.user_id then return new; end if;
  select id into nid from public.notifications where user_id = owner and kind = 'like' and post_id = new.post_id and read_at is null limit 1;
  if nid is not null then
    update public.notifications set n = n + 1, actor = new.user_id, created_at = now() where id = nid;
  else
    insert into public.notifications (user_id, actor, kind, post_id) values (owner, new.user_id, 'like', new.post_id);
  end if;
  return new;
end $$;
drop trigger if exists on_like_notify on public.likes;
create trigger on_like_notify after insert on public.likes for each row execute function public.notify_like();

create or replace function public.notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.posts where id = new.post_id;
  if owner is not null and owner <> new.user_id then
    insert into public.notifications (user_id, actor, kind, post_id, text) values (owner, new.user_id, 'comment', new.post_id, left(new.body, 140));
  end if;
  return new;
end $$;
drop trigger if exists on_comment_notify on public.comments;
create trigger on_comment_notify after insert on public.comments for each row execute function public.notify_comment();

create or replace function public.on_dm_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare t public.dm_threads; other uuid; nid bigint; recent int;
begin
  select count(*) into recent from public.dm_messages where sender = new.sender and created_at > now() - interval '1 minute';
  if recent > 30 then raise exception 'Slow down a little'; end if;
  update public.dm_threads set last_at = new.created_at, last_text = left(new.body, 120), last_from = new.sender,
    a_read = case when a = new.sender then new.created_at else a_read end,
    b_read = case when b = new.sender then new.created_at else b_read end
    where id = new.thread_id returning * into t;
  other := case when t.a = new.sender then t.b else t.a end;
  -- one unread line per conversation, so a burst of messages doesn't buzz the phone ten times
  select id into nid from public.notifications where user_id = other and kind = 'dm' and thread_id = new.thread_id and read_at is null limit 1;
  if nid is not null then
    update public.notifications set n = n + 1, text = left(new.body, 140), created_at = now() where id = nid;
  else
    insert into public.notifications (user_id, actor, kind, thread_id, text) values (other, new.sender, 'dm', new.thread_id, left(new.body, 140));
  end if;
  return new;
end $$;
drop trigger if exists on_dm_message on public.dm_messages;
create trigger on_dm_message after insert on public.dm_messages for each row execute function public.on_dm_message();

do $$ begin
  if to_regclass('public.group_members') is not null then
    execute $f$
      create or replace function public.notify_group_post() returns trigger
      language plpgsql security definer set search_path = public as $b$
      begin
        if new.group_id is not null then
          insert into public.notifications (user_id, actor, kind, post_id, group_id, text)
            select m.user_id, new.user_id, 'group_post', new.id, new.group_id, left(coalesce(new.caption, ''), 140)
            from public.group_members m where m.group_id = new.group_id and m.user_id <> new.user_id;
        end if;
        return new;
      end $b$;
      create or replace function public.notify_group_join() returns trigger
      language plpgsql security definer set search_path = public as $b$
      begin
        if new.role <> 'owner' then
          insert into public.notifications (user_id, actor, kind, group_id)
            select m.user_id, new.user_id, 'group_join', new.group_id
            from public.group_members m where m.group_id = new.group_id and m.role = 'owner' and m.user_id <> new.user_id;
        end if;
        return new;
      end $b$;
    $f$;
    execute 'drop trigger if exists on_group_post_notify on public.posts';
    execute 'create trigger on_group_post_notify after insert on public.posts for each row execute function public.notify_group_post()';
    execute 'drop trigger if exists on_group_join_notify on public.group_members';
    execute 'create trigger on_group_join_notify after insert on public.group_members for each row execute function public.notify_group_join()';
  end if;
end $$;

-- live updates for messages and notifications (each person only receives their own rows)
do $$ begin alter publication supabase_realtime add table public.dm_messages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.dm_threads; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end $$;

------------------------------------------------------------------------------------------------
-- 4. KEEPING IT LIGHT
-- Old notifications go after 60 days (read ones after 30). The news function also clears
-- news older than 7 days and expired reports, sightings, outages, trail reports and pet posts
-- (with their photos). People's own posts, group posts and memories are never auto-deleted.
------------------------------------------------------------------------------------------------
create extension if not exists pg_cron;
do $$ begin perform cron.unschedule('smokies-tidy'); exception when others then null; end $$;
select cron.schedule('smokies-tidy', '17 4 * * *', $job$
  delete from public.notifications where created_at < now() - interval '60 days' or (read_at is not null and read_at < now() - interval '30 days');
$job$);

-- ================================================================ 06_tags.sql
-- Smokies Live update 6: tag people in group posts (the Polaroid wall).
-- Paste all of this into Supabase > SQL Editor > New query, then press Run. Safe to run again.
-- Needs update 3 (groups) and update 5 (notifications) first; ALL_UPDATES.sql runs them in order.
--
-- How it works: a group post can name up to 20 people in `tagged`. The database keeps only
-- people who are really in that group (so a tag can never reach or reveal anything to an outsider),
-- and each tagged person gets one "tagged you" notification instead of the usual "posted in" one.

alter table public.posts add column if not exists tagged uuid[] not null default '{}';
alter table public.posts drop constraint if exists posts_tagged_check;
alter table public.posts add constraint posts_tagged_check check (cardinality(tagged) <= 20);

-- the feed view picks up the new column (it still reads through the privacy rules)
drop view if exists public.post_feed;
create view public.post_feed with (security_invoker = on) as
  select p.*, pr.handle, pr.name, pr.avatar_url,
    (select count(*) from public.likes l where l.post_id = p.id)::int as like_count,
    (select count(*) from public.comments c where c.post_id = p.id)::int as comment_count
  from public.posts p join public.profiles pr on pr.id = p.user_id;
grant select on public.post_feed to anon, authenticated;

-- keep only real fellow members: no strangers, no yourself, no repeats; public posts carry no tags
create or replace function public.clean_tags() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.group_id is null or new.tagged is null then
    new.tagged := '{}';
  else
    new.tagged := coalesce((select array_agg(distinct t) from unnest(new.tagged) t
      where t <> new.user_id and exists (select 1 from public.group_members m where m.group_id = new.group_id and m.user_id = t)), '{}');
  end if;
  return new;
end $$;
drop trigger if exists on_post_clean_tags on public.posts;
create trigger on_post_clean_tags before insert or update of tagged, group_id on public.posts for each row execute function public.clean_tags();

-- notifications learn a new kind: 'tag'
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('like', 'comment', 'dm', 'group_post', 'group_join', 'tag'));

-- a new group post: tagged people hear "tagged you", everyone else in the group hears "posted in"
create or replace function public.notify_group_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.group_id is not null then
    insert into public.notifications (user_id, actor, kind, post_id, group_id, text)
      select m.user_id, new.user_id, case when m.user_id = any(new.tagged) then 'tag' else 'group_post' end,
        new.id, new.group_id, left(coalesce(new.caption, ''), 140)
      from public.group_members m where m.group_id = new.group_id and m.user_id <> new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists on_group_post_notify on public.posts;
create trigger on_group_post_notify after insert on public.posts for each row execute function public.notify_group_post();

-- tags added later (editing a post) reach only the newly tagged people
create or replace function public.notify_new_tags() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.group_id is not null then
    insert into public.notifications (user_id, actor, kind, post_id, group_id, text)
      select t, new.user_id, 'tag', new.id, new.group_id, left(coalesce(new.caption, ''), 140)
      from unnest(new.tagged) t where not (t = any(coalesce(old.tagged, '{}')));
  end if;
  return new;
end $$;
drop trigger if exists on_post_tags_notify on public.posts;
create trigger on_post_tags_notify after update of tagged on public.posts for each row
  when (old.tagged is distinct from new.tagged) execute function public.notify_new_tags();
