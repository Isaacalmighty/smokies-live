\set ON_ERROR_STOP off
insert into auth.users values ('11111111-1111-1111-1111-111111111111','isaac@x'),('22222222-2222-2222-2222-222222222222','mom@x'),('33333333-3333-3333-3333-333333333333','stranger@x');
-- as Isaac: create a group, post publicly and privately
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select name, emoji, length(invite_code) as codelen from public.create_group('Harker Family', '🏡', '#3f8f4f');
select invite_code as code from public.groups \gset
insert into public.posts (caption) values ('public hello');
insert into public.posts (caption, group_id) select 'family only', id from public.groups;
insert into storage.objects (bucket_id, name) select 'group-photos', id || '/a.jpg' from public.groups;
select 'isaac sees', count(*) from public.post_feed;
-- stranger
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select 'stranger sees posts', count(*), string_agg(caption, ',') from public.post_feed;
select 'stranger sees groups', count(*) from public.groups;
select 'stranger sees photos', count(*) from storage.objects where bucket_id = 'group-photos';
insert into public.posts (caption, group_id) select 'sneak', id from public.groups;  -- sees no groups, so inserts 0
insert into public.posts (caption, group_id) values ('sneak2', (select id from public.groups limit 1));
\echo stranger tries to comment on the private post via known id:
reset role; select id as pid from public.posts where caption = 'family only' \gset
set role authenticated; set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
insert into public.comments (post_id, body) values (:'pid', 'hi');
insert into public.likes (post_id) values (:'pid');
insert into public.group_members (group_id, user_id) select id, '33333333-3333-3333-3333-333333333333' from public.groups;
reset role; select id as gid from public.groups \gset
set role authenticated; set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
insert into public.group_members (group_id, user_id) values (:'gid', '33333333-3333-3333-3333-333333333333');
select public.new_invite_code(:'gid');
insert into storage.objects (bucket_id, name) values ('group-photos', :'gid' || '/evil.jpg');
-- anon
reset role; set role anon; set request.jwt.claim.sub = '';
select 'anon sees posts', count(*) from public.post_feed;
select public.join_group(:'code');
-- mom joins with the code
reset role; set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'mom joins', name from public.join_group(lower(:'code'));
select 'mom sees posts', count(*), string_agg(caption, ',' order by caption) from public.post_feed;
select 'mom sees members', count(*) from public.group_members;
select 'mom sees photos', count(*) from storage.objects where bucket_id = 'group-photos';
insert into public.comments (post_id, body) values (:'pid', 'love it');
select 'mom comments visible', count(*) from public.comments;
delete from public.group_members where user_id = '11111111-1111-1111-1111-111111111111';  -- mom can't remove the owner
select 'members after mom tries remove owner', count(*) from public.group_members;
-- owner rotates code; stranger with old code fails
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'rotated', length(public.new_invite_code(:'gid'));
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.join_group(:'code');
select 'stranger sees comments', count(*) from public.comments;
-- mom leaves, then can't see
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
delete from public.group_members where user_id = auth.uid();
select 'mom after leaving', count(*), string_agg(caption, ',') from public.post_feed;
