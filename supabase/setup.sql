-- Smokies Live: social tables, rules and photo storage.
-- Paste all of this into Supabase > SQL Editor > New query, then press Run. Safe to run again.

-- profiles: one per account, created automatically at sign-up
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  handle text unique not null check (handle ~ '^[a-z0-9._]{2,24}$'),
  name text check (char_length(name) <= 40),
  bio text check (char_length(bio) <= 160),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  caption text check (char_length(caption) <= 800),
  tag text check (char_length(tag) <= 20),
  image_url text,
  place_name text check (char_length(place_name) <= 120),
  lng double precision check (lng between -180 and 180),
  lat double precision check (lat between -90 and 90),
  hidden boolean not null default false,       -- set true in the dashboard to take a post down
  created_at timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);

create table if not exists public.likes (
  post_id uuid references public.posts on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 400),
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  reason text check (char_length(reason) <= 300),
  created_at timestamptz not null default now()
);

-- new accounts get a profile with a placeholder username they can change
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, handle, name)
  values (new.id, 'user' || substr(replace(new.id::text, '-', ''), 1, 8), split_part(coalesce(new.email, 'friend'), '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- row level security: everyone can read, people can only change their own things
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.reports enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "posts readable" on public.posts;
create policy "posts readable" on public.posts for select using (not hidden or auth.uid() = user_id);
drop policy if exists "post as yourself" on public.posts;
create policy "post as yourself" on public.posts for insert with check (auth.uid() = user_id and hidden = false);
drop policy if exists "edit own posts" on public.posts;
create policy "edit own posts" on public.posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id and hidden = false);
drop policy if exists "delete own posts" on public.posts;
create policy "delete own posts" on public.posts for delete using (auth.uid() = user_id);

drop policy if exists "likes readable" on public.likes;
create policy "likes readable" on public.likes for select using (true);
drop policy if exists "like as yourself" on public.likes;
create policy "like as yourself" on public.likes for insert with check (auth.uid() = user_id);
drop policy if exists "unlike own" on public.likes;
create policy "unlike own" on public.likes for delete using (auth.uid() = user_id);

drop policy if exists "comments readable" on public.comments;
create policy "comments readable" on public.comments for select using (true);
drop policy if exists "comment as yourself" on public.comments;
create policy "comment as yourself" on public.comments for insert with check (auth.uid() = user_id);
drop policy if exists "delete own comments" on public.comments;
create policy "delete own comments" on public.comments for delete using (auth.uid() = user_id);

drop policy if exists "report as yourself" on public.reports;
create policy "report as yourself" on public.reports for insert with check (auth.uid() = user_id);

-- the feed, with author and counts
create or replace view public.post_feed with (security_invoker = on) as
  select p.*, pr.handle, pr.name, pr.avatar_url,
    (select count(*) from public.likes l where l.post_id = p.id)::int as like_count,
    (select count(*) from public.comments c where c.post_id = p.id)::int as comment_count
  from public.posts p join public.profiles pr on pr.id = p.user_id;

-- live updates when someone posts
do $$ begin
  alter publication supabase_realtime add table public.posts;
exception when duplicate_object then null; end $$;

-- photos: public to view, each person uploads only into their own folder, 8 MB max
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "photos readable" on storage.objects;
create policy "photos readable" on storage.objects for select using (bucket_id = 'photos');
drop policy if exists "upload own photos" on storage.objects;
create policy "upload own photos" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "delete own photos" on storage.objects;
create policy "delete own photos" on storage.objects for delete to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
