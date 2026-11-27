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
