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
