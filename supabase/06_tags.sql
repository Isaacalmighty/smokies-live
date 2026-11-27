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
