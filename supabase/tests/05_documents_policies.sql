-- Documents: who can upload what, who can see it, fit notes never to AbsorbHR support.
-- Policies: audience, drafts, AbsorbHR templates, acknowledgement and re-acknowledgement.
select plan(35);

-- ---------------------------------------------------------------- documents
create temp table doc (k text primary key, id uuid not null);
grant select on doc to authenticated;
insert into doc values
  ('cert', gen_random_uuid()), ('contract_bad', gen_random_uuid()), ('other_emp', gen_random_uuid()),
  ('hr_only_bad', gen_random_uuid()), ('notes', gen_random_uuid()), ('indirect', gen_random_uuid()),
  ('contract', gen_random_uuid()), ('everyone', gen_random_uuid()), ('fitnote', gen_random_uuid()), ('badpath', gen_random_uuid());

create function pg_temp.ins(p_key text, p_emp uuid, p_cat text, p_vis text, p_path_emp uuid default null) returns text
language sql as $$
  select format('insert into documents (id, tenant_id, employee_id, category, title, file_name, mime_type, visibility, storage_path) values (%L, %L, %L, %L, %L, %L, %L, %L, %L)',
    (select id from doc where k = p_key), (select tenant_id from employees where id = p_emp), p_emp, p_cat, 'Doc', 'doc.pdf', 'application/pdf', p_vis,
    (select tenant_id from employees where id = p_emp)::text || '/' || coalesce(p_path_emp, p_emp)::text || '/' || (select id from doc where k = p_key)::text)
$$;

insert into tests.results (line) select unnest(array[
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', pg_temp.ins('cert', tests.id('a_emp1'), 'certificate', 'hr_and_employee')), 'rows:1',
     'Employee can upload their own certificate'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', pg_temp.ins('contract_bad', tests.id('a_emp1'), 'contract', 'hr_and_employee')), 'error:42501',
     'Employee cannot upload a contract (HR documents)'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', pg_temp.ins('other_emp', tests.id('a_emp2'), 'certificate', 'hr_and_employee')), 'error:42501',
     'Employee cannot upload to a colleague''s file'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', pg_temp.ins('hr_only_bad', tests.id('a_emp1'), 'certificate', 'hr_only')), 'error:42501',
     'Employee cannot hide their own upload from themself'),
  is(tests.exec_as(tests.id('a_mgr'), 'aal1', pg_temp.ins('notes', tests.id('a_emp1'), 'meeting_notes', 'hr_and_manager')), 'rows:1',
     'Direct line manager can upload meeting notes'),
  is(tests.exec_as(tests.id('a_mgr'), 'aal1', pg_temp.ins('indirect', tests.id('a_emp4'), 'meeting_notes', 'hr_and_manager')), 'error:42501',
     'A manager cannot upload for someone who is not their direct report'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', pg_temp.ins('contract', tests.id('a_emp1'), 'contract', 'hr_only')), 'rows:1',
     'HR can upload a contract'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', pg_temp.ins('everyone', tests.id('a_emp1'), 'letter', 'everyone')), 'rows:1',
     'HR can upload a letter visible to everyone involved'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', pg_temp.ins('fitnote', tests.id('a_emp1'), 'fit_note', 'hr_and_employee')), 'rows:1',
     'Employee can upload their own fit note'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', pg_temp.ins('badpath', tests.id('a_emp1'), 'letter', 'hr_only', tests.id('a_emp2'))), 'error:23514',
     'A document cannot point at a file in someone else''s folder')
]);
update documents set status = 'available';   -- as the server does after checking each file

insert into tests.results (line) select unnest(array[
  is(tests.count_as(tests.id('a_emp1'), 'aal1', 'select 1 from documents'), 3::bigint,
     'Employee sees their certificate, fit note and the shared letter — not the HR-only contract or manager notes'),
  is(tests.count_as(tests.id('a_mgr'), 'aal1', format('select 1 from documents where employee_id = %L', tests.id('a_emp1'))), 2::bigint,
     'Line manager sees their own notes and the shared letter only'),
  is(tests.count_as(tests.id('a_emp2'), 'aal1', format('select 1 from documents where employee_id = %L', tests.id('a_emp1'))), 0::bigint,
     'A colleague sees none of someone''s documents'),
  is(tests.count_as(tests.id('b_admin'), 'aal2', 'select 1 from documents'), 0::bigint,
     'Another company sees no documents'),
  is(tests.count_as(tests.id('a_hr'), 'aal1', 'select 1 from documents'), 0::bigint,
     'HR without MFA sees no documents'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', 'update documents set status = ''uploading'''), 'error:42501',
     'Nobody but the server can change a document''s upload status'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', 'update documents set visibility = ''everyone'''), 'rows:0',
     'Employee cannot change who can see a document')
]);

select tests.value_as(tests.id('p_admin'), 'aal2', format('select start_support_session(%L, %L)::text', tests.id('tenant_a'), 'Testing document privacy'));
insert into tests.results (line) select is(tests.count_as(tests.id('p_admin'), 'aal2', 'select 1 from documents where category = ''fit_note'''), 0::bigint,
  'AbsorbHR support sessions never see fit notes (health data)');
select tests.value_as(tests.id('p_admin'), 'aal2', 'select end_support_session()::text');

-- ---------------------------------------------------------------- policies
update employees set department_id = 'da000000-0000-4000-8000-000000000001' where id = tests.id('a_emp1');
create temp table pol (k text primary key, id uuid not null);
grant select on pol to authenticated;
insert into pol values ('tpl', gen_random_uuid()), ('p1', gen_random_uuid()), ('p2', gen_random_uuid()), ('draft', gen_random_uuid());
insert into policies (id, tenant_id, title, status) values ((select id from pol where k='tpl'), null, 'Template: Sickness absence', 'published');
insert into policies (id, tenant_id, title, status) values ((select id from pol where k='p1'), tests.id('tenant_a'), 'Code of conduct', 'published');
insert into policies (id, tenant_id, title, status, audience, department_ids) values ((select id from pol where k='p2'), tests.id('tenant_a'), 'Forklift safety', 'published', 'departments', '{da000000-0000-4000-8000-000000000001}');
insert into policies (id, tenant_id, title, status) values ((select id from pol where k='draft'), tests.id('tenant_a'), 'Unfinished', 'draft');
insert into policy_versions (tenant_id, policy_id, version, body, published_at) values
  (null, (select id from pol where k='tpl'), 1, 'Template text', now()),
  (tests.id('tenant_a'), (select id from pol where k='p1'), 1, 'Be nice', now()),
  (tests.id('tenant_a'), (select id from pol where k='p2'), 1, 'Wear a hat', now()),
  (tests.id('tenant_a'), (select id from pol where k='draft'), 1, 'Draft text', null);
create temp table pv as select v.id, p.k, v.version from policy_versions v join pol p on p.id = v.policy_id;
grant select on pv to authenticated;

insert into tests.results (line) select unnest(array[
  is(tests.count_as(tests.id('a_emp2'), 'aal1', 'select 1 from policies'), 1::bigint,
     'Employee sees only published policies meant for them (not another department''s, not drafts, not templates)'),
  is(tests.count_as(tests.id('a_emp1'), 'aal1', 'select 1 from policies'), 2::bigint,
     'Employee in the Operations department also sees the Operations policy'),
  is(tests.count_as(tests.id('a_hr'), 'aal2', 'select 1 from policies where tenant_id is null'), 1::bigint,
     'HR can browse AbsorbHR''s template library'),
  is(tests.count_as(tests.id('b_admin'), 'aal2', format('select 1 from policies where tenant_id = %L', tests.id('tenant_a'))), 0::bigint,
     'Another company cannot see this company''s policies'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', format('insert into policies (tenant_id, title) values (%L, %L)', tests.id('tenant_a'), 'Mine')), 'error:42501',
     'Employees cannot create policies')
]);

insert into tests.results (line) select is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select acknowledge_policy(%L)::text', (select id from pv where k='p1'))), '',
  'Employee acknowledges the code of conduct');
insert into tests.results (line) select is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select acknowledged::text from my_policies() where policy_id = %L', (select id from pol where k='p1'))), 'true',
  'It now shows as acknowledged');
insert into tests.results (line) select is(tests.value_as(tests.id('a_emp2'), 'aal1', format('select acknowledge_policy(%L)::text', (select id from pv where k='p2'))), 'error:42501',
  'Someone outside the audience cannot acknowledge a policy');
insert into tests.results (line) select is(tests.exec_as(tests.id('a_emp1'), 'aal1', format('insert into policy_acknowledgements (tenant_id, policy_id, policy_version_id, employee_id) values (%L, %L, %L, %L)',
  tests.id('tenant_a'), (select id from pol where k='p2'), (select id from pv where k='p2'), tests.id('a_emp1'))), 'error:42501',
  'Acknowledgements can only be made through the acknowledge button (function)');
insert into tests.results (line) select is(tests.exec_as(tests.id('a_hr'), 'aal2', format('update policy_versions set body = %L where id = %L', 'Changed', (select id from pv where k='p1'))), 'rows:0',
  'A published version cannot be edited, even by HR');

-- Minor update (no re-acknowledgement), then a major one.
insert into policy_versions (tenant_id, policy_id, version, body) values (tests.id('tenant_a'), (select id from pol where k='p1'), 2, 'Be nice (typo fixed)');
select tests.value_as(tests.id('a_hr'), 'aal2', format('select publish_policy_version(%L, false)::text', (select id from policy_versions where policy_id = (select id from pol where k='p1') and version = 2)));
insert into tests.results (line) select is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select acknowledged::text from my_policies() where policy_id = %L', (select id from pol where k='p1'))), 'true',
  'A minor update that HR marks "no re-read needed" keeps the acknowledgement');
insert into policy_versions (tenant_id, policy_id, version, body) values (tests.id('tenant_a'), (select id from pol where k='p1'), 3, 'Be nice. New rules.');
select tests.value_as(tests.id('a_hr'), 'aal2', format('select publish_policy_version(%L, true)::text', (select id from policy_versions where policy_id = (select id from pol where k='p1') and version = 3)));
insert into tests.results (line) select is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select acknowledged::text from my_policies() where policy_id = %L', (select id from pol where k='p1'))), 'false',
  'A major update that HR marks "everyone must re-read" asks for acknowledgement again');
insert into tests.results (line) select is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select acknowledge_policy(%L)::text', (select id from pv where k='p1'))), 'error:22023',
  'Acknowledging an old version is refused');
insert into tests.results (line) select is(tests.value_as(tests.id('a_hr'), 'aal2', format('select count(*) filter (where not acknowledged)::text || %L || count(*)::text from policy_acknowledgement_status(%L)', '/', (select id from pol where k='p1'))), '7/7',
  'HR tracker: all 7 people in the company still need to read version 3');
insert into tests.results (line) select is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select count(*)::text from policy_acknowledgement_status(%L)', (select id from pol where k='p1'))), 'error:42501',
  'Employees cannot see who else has acknowledged');
insert into tests.results (line) select ok(tests.value_as(tests.id('a_hr'), 'aal2', format('select copy_policy_template(%L)::text', (select id from pol where k='tpl'))) ~ '^[0-9a-f-]{36}$',
  'HR can copy an AbsorbHR template into their own library');
insert into tests.results (line) select is((select status || '/' || (copied_from is not null)::text from policies where title = 'Template: Sickness absence' and tenant_id = tests.id('tenant_a')), 'draft/true',
  'The copy starts as a draft linked to the template');

insert into tests.results (line) select * from finish();
select line from tests.results order by n;
rollback;
