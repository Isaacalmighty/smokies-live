# SQL tests
Run against a throwaway local Postgres 16 (not your Supabase project):

    createdb t && psql -d t -f supabase_stub.sql && psql -d t -f ../setup.sql && psql -d t -f groups_privacy_test.sql

The stub stands in for Supabase auth, storage and roles. The test checks that people outside a group cannot read, comment on, like or join it without the code.

Messages, notifications and videos (update 5), with stand-ins for pg_cron and pg_net:

    psql -d t -f supabase_stub.sql -f cron_net_stub.sql -f ../setup.sql -f ../ALL_UPDATES.sql -f messages_test.sql

(delete the `create extension` lines from ALL_UPDATES.sql first; local Postgres doesn't have them). Expected: only the two people in a conversation see it, notifications can only be marked read, a block stops new conversations, and video links must be https or a private group path.
