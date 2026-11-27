\set ON_ERROR_STOP off
-- people: 1 isaac, 2 mom, 3 stranger
insert into auth.users values ('11111111-1111-1111-1111-111111111111','isaac@x'),('22222222-2222-2222-2222-222222222222','mom@x'),('33333333-3333-3333-3333-333333333333','stranger@x');
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.start_dm('22222222-2222-2222-2222-222222222222') as tid \gset
select 'same thread again', public.start_dm('22222222-2222-2222-2222-222222222222') = :'tid';
select public.start_dm('11111111-1111-1111-1111-111111111111');  -- error: yourself
insert into public.dm_messages (thread_id, body) values (:'tid', 'hey mom');
insert into public.dm_messages (thread_id, body) values (:'tid', 'dinner sunday?');
insert into public.dm_messages (thread_id, sender, body) values (:'tid', '22222222-2222-2222-2222-222222222222', 'forged');  -- error
insert into public.posts (caption, video_url, video_meta) values ('a clip', 'https://x/photos/a.mp4', '{"dur":12,"w":720,"h":1280}');
insert into public.posts (caption, video_url) values ('bad clip', 'javascript:alert(1)');  -- error
select 'video in feed', caption, video_meta->>'h' from public.post_feed where video_url is not null;
-- mom
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'mom sees messages', count(*) from public.dm_messages;
select 'mom notifications', kind, n, text from public.notifications;
update public.notifications set text = 'hacked';           -- error: only read_at can change
update public.notifications set read_at = now() where kind = 'dm';
select public.read_dm(:'tid');
select 'mom unread', count(*) from public.notifications where read_at is null;
reset role; select id as pid from public.posts where caption = 'a clip' \gset
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into public.likes (post_id) values (:'pid');
insert into public.comments (post_id, body) values (:'pid', 'great video');
-- stranger
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select 'stranger sees messages', count(*) from public.dm_messages;
select 'stranger sees threads', count(*) from public.dm_threads;
select 'stranger sees notifications', count(*) from public.notifications;
insert into public.dm_messages (thread_id, body) values (:'tid', 'sneak');   -- error
select public.read_dm(:'tid');
insert into public.likes (post_id) values (:'pid');
-- isaac: likes fold into one line, comment is its own
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'isaac notifications', kind, n, text from public.notifications order by id;
-- isaac blocks the stranger; stranger cannot open a conversation
insert into public.blocks (blocked) values ('33333333-3333-3333-3333-333333333333');
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.start_dm('11111111-1111-1111-1111-111111111111');  -- error
-- anon
reset role; set role anon; set request.jwt.claim.sub = '';
select 'anon messages', count(*) from public.dm_messages;
reset role;
select 'push calls queued', count(*) from net.calls;
