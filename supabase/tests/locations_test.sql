\set ON_ERROR_STOP off
-- family locations: only members of the same group, only while sharing, gone when you stop or leave
insert into auth.users values ('11111111-1111-1111-1111-111111111111','isaac@x'),('22222222-2222-2222-2222-222222222222','mom@x'),('33333333-3333-3333-3333-333333333333','stranger@x'),('44444444-4444-4444-4444-444444444444','dad@x') on conflict do nothing;
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select id as gid, invite_code as code from public.create_group('Loc Family', '🏡', '#3f8f4f') \gset
select id as gid2, invite_code as code2 from public.create_group('Loc Work', '💼', '#3f6f8f') \gset
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; select 'mom joins family', name from public.join_group(:'code');
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444'; select 'dad joins work only', name from public.join_group(:'code2');
-- isaac shares with Family only
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.member_locations (group_id, lng, lat, until) values (:'gid', -83.58, 35.88, now() + interval '1 hour');
select 'isaac sees own (expect 1)', count(*) from public.member_locations;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'mom sees isaac (expect 1)', count(*) from public.member_locations;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select 'dad (work only) sees (expect 0)', count(*) from public.member_locations;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select 'stranger sees (expect 0)', count(*) from public.member_locations;
\echo stranger tries to plant a spot in the family group (expect error):
insert into public.member_locations (group_id, lng, lat) values (:'gid', -83.5, 35.7);
\echo stranger tries to post as isaac (expect error):
insert into public.member_locations (group_id, user_id, lng, lat) values (:'gid', '11111111-1111-1111-1111-111111111111', -83.5, 35.7);
update public.member_locations set lat = 0;
delete from public.member_locations;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
\echo mom tries to move or delete isaac (expect 0 rows changed):
update public.member_locations set lat = 1 where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.member_locations where user_id = '11111111-1111-1111-1111-111111111111';
\echo mom tries a 30-day share (expect error):
insert into public.member_locations (group_id, lng, lat, until) values (:'gid', -83.5, 35.7, now() + interval '30 days');
\echo mom fakes an old timestamp; server stamps now:
insert into public.member_locations (group_id, lng, lat, updated_at) values (:'gid', -83.5, 35.7, '2020-01-01');
select 'mom updated_at is fresh (expect t)', updated_at > now() - interval '1 minute' from public.member_locations where user_id = auth.uid();
-- expired shares disappear
reset role; update public.member_locations set until = now() - interval '1 second' where user_id = '22222222-2222-2222-2222-222222222222';
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'isaac sees mom after expiry (expect 0)', count(*) from public.member_locations where user_id = '22222222-2222-2222-2222-222222222222';
-- mom leaves: her row goes with her (cascade)
reset role; update public.member_locations set until = now() + interval '1 hour';
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
delete from public.group_members where group_id = :'gid' and user_id = auth.uid();
select 'mom sees after leaving (expect 0)', count(*) from public.member_locations;
reset role; select 'mom rows left after leaving (expect 0)', count(*) from public.member_locations where user_id = '22222222-2222-2222-2222-222222222222';
-- isaac stops sharing everywhere
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.stop_sharing_all();
reset role; select 'isaac rows after stop (expect 0)', count(*) from public.member_locations where user_id = '11111111-1111-1111-1111-111111111111';
set role anon; set request.jwt.claim.sub = '';
\echo anon reads (expect permission error):
select count(*) from public.member_locations;
