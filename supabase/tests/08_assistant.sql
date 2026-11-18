-- AI assistant: chats are private to the person, suggestions run only when that person
-- confirms (once, within 24 hours), company notes stay inside the company, chats are
-- deleted after the retention period, and GDPR exports and erasure include assistant data.
select plan(45);

update public.tenant_settings set assistant_enabled = true where tenant_id = tests.id('tenant_a');

create function pg_temp.conv(p_id text, p_tenant text, p_user text) returns text language sql as $$
  select format('insert into assistant_conversations (id, tenant_id, user_id, title) values (%L, %L, %L, %L)',
    p_id, tests.id(p_tenant), tests.id(p_user), 'Holiday question') $$;
create function pg_temp.msg(p_conv text, p_tenant text) returns text language sql as $$
  select format('insert into assistant_messages (tenant_id, conversation_id, role, content, display_text) values (%L, %L, %L, %L, %L)',
    tests.id(p_tenant), p_conv, 'user', '[{"type":"text","text":"Book me off Friday"}]', 'Book me off Friday') $$;
create function pg_temp.act(p_id text, p_conv text, p_user text) returns text language sql as $$
  select format('insert into assistant_actions (id, tenant_id, conversation_id, user_id, tool_use_id, kind, payload, summary, subject_employee_id) values (%L, %L, %L, %L, %L, %L, %L, %L, %L)',
    p_id, tests.id('tenant_a'), p_conv, tests.id(p_user), 'toolu_' || left(p_id, 8), 'request_leave', '{"days":1}',
    'Book holiday for Eve One on Fri 5 Dec', tests.id('a_emp1')) $$;

-- ---------------------------------------------------------------- conversations and messages
insert into tests.results (line) select unnest(array[
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', pg_temp.conv('e1000000-0000-4000-8000-000000000001', 'tenant_a', 'a_emp1')), 'rows:1',
    'An employee can start a chat when their company has the assistant on'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', pg_temp.conv('e1000000-0000-4000-8000-000000000002', 'tenant_a', 'a_emp2')), 'error:42501',
    'Nobody can start a chat in someone else''s name'),
  is(tests.exec_as(tests.id('b_emp'), 'aal1', pg_temp.conv('e1000000-0000-4000-8000-000000000003', 'tenant_b', 'b_emp')), 'error:42501',
    'No chats while a company has the assistant switched off'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', pg_temp.conv('e1000000-0000-4000-8000-000000000004', 'tenant_b', 'a_emp1')), 'error:42501',
    'Nobody can start a chat in another company'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', pg_temp.msg('e1000000-0000-4000-8000-000000000001', 'tenant_a')), 'rows:1',
    'The person can add messages to their own chat'),
  is(tests.exec_as(tests.id('a_emp2'), 'aal1', pg_temp.msg('e1000000-0000-4000-8000-000000000001', 'tenant_a')), 'error:42501',
    'A colleague cannot add messages to someone else''s chat'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', 'update assistant_messages set display_text = ''changed'''), 'error:42501',
    'Messages cannot be edited afterwards'),
  is(tests.count_as(tests.id('a_emp1'), 'aal1', 'select 1 from assistant_messages'), 1::bigint,
    'The person can read their own chat'),
  is(tests.count_as(tests.id('a_emp2'), 'aal1', 'select 1 from assistant_conversations'), 0::bigint,
    'Colleagues cannot see someone else''s chats'),
  is(tests.count_as(tests.id('a_admin'), 'aal2', 'select 1 from assistant_messages'), 0::bigint,
    'Chats are private even from the company''s Client Admin'),
  is(tests.count_as(tests.id('a_hr'), 'aal2', 'select 1 from assistant_conversations'), 0::bigint,
    '…and from HR'),
  is(tests.count_as(tests.id('b_admin'), 'aal2', 'select 1 from assistant_messages'), 0::bigint,
    'Another company cannot see them'),
  is(tests.count_as(tests.id('p_admin'), 'aal2', 'select 1 from assistant_messages'), 0::bigint,
    'AbsorbHR admins cannot see them')
]);

-- ---------------------------------------------------------------- suggested actions
insert into tests.results (line) select unnest(array[
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', pg_temp.act('ac000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'a_emp1')), 'rows:1',
    'A suggestion is saved as pending'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', format('insert into assistant_actions (tenant_id, conversation_id, user_id, tool_use_id, kind, payload, summary, status) values (%L, %L, %L, %L, %L, %L, %L, %L)',
      tests.id('tenant_a'), 'e1000000-0000-4000-8000-000000000001', tests.id('a_emp1'), 'toolu_x', 'remember', '{}', 'x', 'done')), 'error:42501',
    'A suggestion cannot be saved as already done'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', 'update assistant_actions set status = ''done'''), 'error:42501',
    'A suggestion''s status cannot be changed directly'),
  is(tests.exec_as(tests.id('a_emp2'), 'aal1', pg_temp.act('ac000000-0000-4000-8000-000000000009', 'e1000000-0000-4000-8000-000000000001', 'a_emp2')), 'error:42501',
    'Nobody can add a suggestion to someone else''s chat'),
  is(tests.value_as(tests.id('a_emp2'), 'aal1', 'select status from assistant_claim_action(''ac000000-0000-4000-8000-000000000001'')'), 'error:22023',
    'Only the person who asked can confirm a suggestion'),
  is(tests.value_as(tests.id('a_admin'), 'aal2', 'select status from assistant_claim_action(''ac000000-0000-4000-8000-000000000001'')'), 'error:22023',
    '…not even the Client Admin'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', 'select status from assistant_claim_action(''ac000000-0000-4000-8000-000000000001'')'), 'running',
    'The person who asked can confirm it'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', 'select status from assistant_claim_action(''ac000000-0000-4000-8000-000000000001'')'), 'error:22023',
    'A suggestion can only be confirmed once'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', 'select assistant_finish_action(''ac000000-0000-4000-8000-000000000001'', true, ''Holiday booked'')'), 'rows:1',
    'The outcome is recorded'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', 'select status from assistant_actions where id = ''ac000000-0000-4000-8000-000000000001'''), 'done',
    'The suggestion shows as done'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', pg_temp.act('ac000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'a_emp1')), 'rows:1',
    'A second suggestion is saved'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', 'select assistant_cancel_action(''ac000000-0000-4000-8000-000000000002'')'), 'rows:1',
    'The person can say no to a suggestion'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', 'select status from assistant_claim_action(''ac000000-0000-4000-8000-000000000002'')'), 'error:22023',
    'A cancelled suggestion cannot be confirmed afterwards')
]);

-- A suggestion older than 24 hours can no longer be confirmed.
insert into public.assistant_actions (id, tenant_id, conversation_id, user_id, tool_use_id, kind, payload, summary, created_at)
values ('ac000000-0000-4000-8000-000000000003', tests.id('tenant_a'), 'e1000000-0000-4000-8000-000000000001',
        tests.id('a_emp1'), 'toolu_old', 'request_leave', '{}', 'Old suggestion', now() - interval '25 hours');
insert into tests.results (line) select unnest(array[
  is(tests.value_as(tests.id('a_emp1'), 'aal1', 'select status from assistant_claim_action(''ac000000-0000-4000-8000-000000000003'')'), 'error:22023',
    'Suggestions expire after 24 hours'),
  ok((select count(*) from public.audit_log where entity = 'assistant_actions'
        and entity_id = 'ac000000-0000-4000-8000-000000000001') >= 3,
    'The audit log keeps the suggestion, the confirmation and the outcome')
]);

-- ---------------------------------------------------------------- company notes
insert into tests.results (line) select unnest(array[
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', format('insert into assistant_memories (id, tenant_id, note, created_by) values (%L, %L, %L, %L)',
      'ee000000-0000-4000-8000-000000000001', tests.id('tenant_a'), 'Holiday requests need two weeks notice', tests.id('a_emp1'))), 'rows:1',
    'A confirmed company note is saved'),
  is(tests.count_as(tests.id('a_emp2'), 'aal1', 'select 1 from assistant_memories'), 1::bigint,
    'Everyone in the company benefits from it'),
  is(tests.count_as(tests.id('b_admin'), 'aal2', 'select 1 from assistant_memories'), 0::bigint,
    'Another company cannot see it'),
  is(tests.exec_as(tests.id('a_emp2'), 'aal1', 'delete from assistant_memories'), 'rows:0',
    'A colleague cannot delete someone else''s note'),
  is(tests.exec_as(tests.id('a_admin'), 'aal2', 'delete from assistant_memories'), 'rows:1',
    'The Client Admin can delete any note')
]);

-- ---------------------------------------------------------------- GDPR
insert into tests.results (line) select unnest(array[
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select jsonb_array_length(assistant_sar_data(%L) -> %L)', tests.id('a_emp1'), 'assistant_chats')), '1',
    'A subject access export includes the person''s own chats'),
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select jsonb_array_length(assistant_sar_data(%L) -> %L)', tests.id('a_emp1'), 'assistant_suggestions_about_this_person')), '2',
    '…and the suggestions made about them'),
  is(tests.value_as(tests.id('a_emp2'), 'aal1', format('select assistant_sar_data(%L)::text', tests.id('a_emp1'))), 'error:42501',
    'Only HR can run that export')
]);

-- Anonymising an employee removes what suggestions said about them.
update public.employees set anonymised_at = now() where id = tests.id('a_emp1');
insert into tests.results (line) select unnest(array[
  is((select count(*) from public.assistant_actions where subject_employee_id = tests.id('a_emp1') and payload <> '{}'::jsonb), 0::bigint,
    'Anonymising an employee clears the details of suggestions about them')
]);

-- Back to running as the database owner (no signed-in user) for the set-up steps below.
select set_config('request.jwt.claims', '', true);

-- Switched off: people can still read and delete their old chats, but not add to them.
update public.tenant_settings set assistant_enabled = false where tenant_id = tests.id('tenant_a');
insert into tests.results (line) select unnest(array[
  is(tests.count_as(tests.id('a_emp1'), 'aal1', 'select 1 from assistant_conversations'), 1::bigint,
    'After switching off, people can still read their old chats'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', pg_temp.msg('e1000000-0000-4000-8000-000000000001', 'tenant_a')), 'error:42501',
    '…but cannot add to them')
]);

select set_config('request.jwt.claims', '', true);

-- Retention: chats past the company's period are deleted by the nightly job, messages with them.
update public.tenant_settings set assistant_chat_retention_months = 12 where tenant_id = tests.id('tenant_a');
update public.assistant_conversations set updated_at = now() - interval '13 months'
 where id = 'e1000000-0000-4000-8000-000000000001';
select app.assistant_housekeeping();
insert into tests.results (line) select unnest(array[
  is((select count(*) from public.assistant_conversations where id = 'e1000000-0000-4000-8000-000000000001'), 0::bigint,
    'Chats older than the retention period are deleted'),
  is((select count(*) from public.assistant_messages where conversation_id = 'e1000000-0000-4000-8000-000000000001'), 0::bigint,
    '…with their messages'),
  ok((select count(*) from public.audit_log where entity = 'assistant_actions'
        and entity_id = 'ac000000-0000-4000-8000-000000000001') >= 3,
    'The audit record of what was confirmed outlives the chat'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', 'update tenant_settings set assistant_chat_retention_months = 24'), 'rows:0',
    'Employees cannot change the retention period'),
  is(tests.exec_as(tests.id('a_admin'), 'aal2', 'update tenant_settings set assistant_chat_retention_months = 24'), 'rows:1',
    'The Client Admin can change it'),
  is(tests.exec_as(tests.id('a_admin'), 'aal2', 'update tenant_settings set assistant_chat_retention_months = 100'), 'error:23514',
    'It can be shortened, never set beyond 6 years')
]);

insert into tests.results (line) select * from finish();
select line from tests.results order by n;
rollback;
