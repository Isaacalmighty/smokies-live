\set ON_ERROR_STOP off
-- tags: only fellow group members can be tagged, each gets one 'tag' notification
insert into auth.users values ('11111111-1111-1111-1111-111111111111','isaac@x'),('22222222-2222-2222-2222-222222222222','mom@x'),('33333333-3333-3333-3333-333333333333','stranger@x'),('44444444-4444-4444-4444-444444444444','dad@x') on conflict do nothing;
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select id as gid, invite_code as code from public.create_group('Harker Family', '🏡', '#3f8f4f') \gset
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; select 'mom joins', name from public.join_group(:'code');
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444'; select 'dad joins', name from public.join_group(:'code');
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.posts (caption, group_id, tagged) values ('at the falls', :'gid', array['22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222']::uuid[]);
insert into public.posts (caption, tagged) values ('public', array['22222222-2222-2222-2222-222222222222']::uuid[]);
select 'tags kept (expect mom only)', caption, tagged from public.post_feed order by caption;
reset role;
select 'notes (expect mom=tag, dad=group_post, stranger none)', u.email, n.kind from public.notifications n join auth.users u on u.id = n.user_id where n.kind in ('tag','group_post') order by u.email;
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.posts set tagged = tagged || '44444444-4444-4444-4444-444444444444'::uuid where caption = 'at the falls';
reset role;
select 'after edit (expect dad tag added, mom not twice)', u.email, n.kind, count(*) from public.notifications n join auth.users u on u.id = n.user_id where n.kind = 'tag' group by 1,2,3 order by 2;
