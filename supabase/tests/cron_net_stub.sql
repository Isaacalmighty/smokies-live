-- local stand-ins for pg_cron and pg_net (Supabase has the real ones)
create schema if not exists cron; create schema if not exists net;
create or replace function cron.schedule(n text, s text, cmd text) returns bigint language sql as $$ select 1::bigint $$;
create or replace function cron.unschedule(n text) returns boolean language sql as $$ select true $$;
create table if not exists net.calls (id serial, url text, body jsonb);
create or replace function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}', timeout_milliseconds int default 1000) returns bigint language sql as $$ insert into net.calls (url, body) values (url, body) returning id::bigint $$;
grant usage on schema net to anon, authenticated; grant all on net.calls to anon, authenticated; grant usage, select on all sequences in schema net to anon, authenticated;
