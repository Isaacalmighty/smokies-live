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
