# SQL tests
Run against a throwaway local Postgres 16 (not your Supabase project):

    createdb t && psql -d t -f supabase_stub.sql && psql -d t -f ../setup.sql && psql -d t -f groups_privacy_test.sql

The stub stands in for Supabase auth, storage and roles. The test checks that people outside a group cannot read, comment on, like or join it without the code.
