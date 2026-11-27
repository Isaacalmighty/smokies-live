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
