-- Checklists, performance reviews, 1-to-1 notes, disciplinary/grievance cases (HR only),
-- case documents and correction requests.
select plan(50);

create temp table x (k text primary key, id uuid);
grant select on x to authenticated;
create function pg_temp.v(p_k text) returns uuid language sql as $$ select id from x where k = p_k $$;

-- ---------------------------------------------------------------- checklists
insert into x select 'onb_tpl', id from checklist_templates where tenant_id = tests.id('tenant_a') and kind = 'onboarding';
insert into x select 'cl', tests.value_as(tests.id('a_hr'), 'aal2',
  format('select start_checklist(%L, %L, %L)', tests.id('a_emp1'), pg_temp.v('onb_tpl'), current_date))::uuid;
insert into x select 'item_emp', id from checklist_items where checklist_id = pg_temp.v('cl') and assignee = 'employee' order by position limit 1;
insert into x select 'item_hr', id from checklist_items where checklist_id = pg_temp.v('cl') and assignee = 'hr' order by position limit 1;
insert into x select 'item_mgr', id from checklist_items where checklist_id = pg_temp.v('cl') and assignee = 'manager' order by position limit 1;

insert into tests.results (line) select unnest(array[
  ok(pg_temp.v('cl') is not null, 'HR can start an onboarding checklist from the default template'),
  is(tests.count_as(tests.id('a_emp1'), 'aal1', 'select 1 from checklist_items'), 8::bigint, 'The employee sees their 8 onboarding tasks'),
  is(tests.count_as(tests.id('a_emp2'), 'aal1', 'select 1 from checklist_items'), 0::bigint, 'A colleague sees none of them'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select set_checklist_item(%L, true)::text', pg_temp.v('item_emp'))), '', 'The employee ticks off their own task'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select set_checklist_item(%L, true)::text', pg_temp.v('item_hr'))), 'error:42501', 'The employee cannot tick off an HR task'),
  is(tests.value_as(tests.id('a_mgr'), 'aal1', format('select set_checklist_item(%L, true)::text', pg_temp.v('item_mgr'))), '', 'The direct manager ticks off a manager task'),
  is(tests.value_as(tests.id('a_lead'), 'aal1', format('select set_checklist_item(%L, true)::text', pg_temp.v('item_mgr'))), 'error:42501', 'A different manager cannot'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select start_checklist(%L, %L, %L)::text', tests.id('a_emp1'), pg_temp.v('onb_tpl'), current_date)), 'error:42501', 'Employees cannot start checklists')
]);

-- ---------------------------------------------------------------- reviews
insert into x select 'rev', tests.value_as(tests.id('a_mgr'), 'aal1', format('select start_review(%L, %L)', tests.id('a_emp1'), 'Annual review'))::uuid;
insert into tests.results (line) select unnest(array[
  ok(pg_temp.v('rev') is not null, 'Direct line manager can start a review'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select start_review(%L, %L)::text', tests.id('a_emp1'), 'Self')), 'error:42501', 'Nobody can start a review of themself'),
  is(tests.count_as(tests.id('a_emp1'), 'aal1', 'select 1 from performance_reviews'), 0::bigint, 'The employee cannot read the review table directly (only the safe view)'),
  is(tests.value_as(tests.id('a_emp2'), 'aal1', format('select my_review(%L)::text', pg_temp.v('rev'))), 'error:42501', 'A colleague cannot read someone''s review'),
  is(tests.count_as(tests.id('b_admin'), 'aal2', 'select 1 from performance_reviews'), 0::bigint, 'Another company cannot see reviews'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select save_self_assessment(%L, %L, true)::text', pg_temp.v('rev'), 'I did well')), '', 'Employee submits their self-assessment'),
  is(tests.value_as(tests.id('a_mgr'), 'aal1', format('select save_manager_review(%L, %L, 4::smallint, null, false)::text', pg_temp.v('rev'), 'Draft')), 'error:22023', 'A rating is refused when the company uses written feedback only')
]);
select tests.value_as(tests.id('a_mgr'), 'aal1', format('select save_manager_review(%L, %L, null, %L, false)::text', pg_temp.v('rev'), 'Draft thoughts', 'Learn sourdough'));
insert into tests.results (line) select is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select coalesce(my_review(%L) ->> %L, %L)', pg_temp.v('rev'), 'manager_assessment', 'hidden')), 'hidden',
  'The manager''s draft is hidden from the employee');
update tenant_settings set review_rating_scale = true where tenant_id = tests.id('tenant_a');
select tests.value_as(tests.id('a_mgr'), 'aal1', format('select save_manager_review(%L, %L, 4::smallint, %L, true)::text', pg_temp.v('rev'), 'Great year', 'Learn sourdough'));
insert into tests.results (line) select is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select (my_review(%L) ->> %L) || %L || (my_review(%L) ->> %L)', pg_temp.v('rev'), 'manager_assessment', '/', pg_temp.v('rev'), 'rating')), 'Great year/4',
  'Once the manager shares it, the employee sees the assessment and rating');
select tests.value_as(tests.id('a_emp1'), 'aal1', format('select sign_review(%L, %L)::text', pg_temp.v('rev'), 'Thanks'));
select tests.value_as(tests.id('a_mgr'), 'aal1', format('select sign_review(%L)::text', pg_temp.v('rev')));
insert into tests.results (line) select is((select status from performance_reviews where id = pg_temp.v('rev')), 'completed', 'The review completes when both have signed');
insert into tests.results (line) select is(tests.value_as(tests.id('a_mgr'), 'aal1', format('select save_manager_review(%L, %L, null, null, true)::text', pg_temp.v('rev'), 'Change it')), 'error:22023',
  'A submitted review cannot be rewritten');

-- ---------------------------------------------------------------- 1-to-1 notes
create function pg_temp.note(p_private boolean) returns text language sql as $$
  select format('insert into one_to_one_notes (tenant_id, employee_id, meeting_date, notes, is_private) values (%L, %L, current_date, %L, %L)',
    tests.id('tenant_a'), tests.id('a_emp1'), case when p_private then 'Private thought' else 'Shared note' end, p_private) $$;
insert into tests.results (line) select unnest(array[
  is(tests.exec_as(tests.id('a_mgr'), 'aal1', pg_temp.note(false)), 'rows:1', 'Manager records a shared 1-to-1 note'),
  is(tests.exec_as(tests.id('a_mgr'), 'aal1', pg_temp.note(true)), 'rows:1', 'Manager records a private note'),
  is(tests.count_as(tests.id('a_emp1'), 'aal1', 'select 1 from one_to_one_notes'), 1::bigint, 'The employee sees the shared note only'),
  is(tests.count_as(tests.id('a_hr'), 'aal2', 'select 1 from one_to_one_notes'), 2::bigint, 'HR sees both'),
  is(tests.count_as(tests.id('a_lead'), 'aal1', 'select 1 from one_to_one_notes'), 0::bigint, 'Another manager sees none'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', pg_temp.note(false)), 'error:42501', 'Employees cannot write 1-to-1 notes about themselves'),
  is(tests.exec_as(tests.id('a_mgr'), 'aal1', format('update one_to_one_notes set employee_id = %L', tests.id('a_emp2'))), 'error:42501', 'A note cannot be moved to another person')
]);

-- ---------------------------------------------------------------- cases (HR only)
insert into x select 'case', tests.value_as(tests.id('a_hr'), 'aal2',
  format('select open_case(%L, %L, %L)', tests.id('a_emp1'), 'disciplinary', 'Alleged breach of food safety rules'))::uuid;
insert into tests.results (line) select unnest(array[
  ok(pg_temp.v('case') is not null, 'HR opens a disciplinary case'),
  is((select reference from cases where id = pg_temp.v('case')), 'DIS-' || to_char(current_date, 'YYYY') || '-001', 'Cases get a reference like DIS-2026-001'),
  is(tests.count_as(tests.id('a_mgr'), 'aal1', 'select 1 from cases'), 0::bigint, 'The employee''s line manager cannot see the case'),
  is(tests.value_as(tests.id('a_mgr'), 'aal1', format('select get_case(%L)::text', pg_temp.v('case'))), 'error:42501', 'The line manager cannot open the case'),
  is(tests.count_as(tests.id('a_emp1'), 'aal1', 'select 1 from cases'), 0::bigint, 'The employee cannot see the case file in the portal'),
  is(tests.count_as(tests.id('a_hr'), 'aal1', 'select 1 from cases'), 0::bigint, 'HR without MFA cannot see cases'),
  is(tests.count_as(tests.id('b_admin'), 'aal2', 'select 1 from cases'), 0::bigint, 'Another company cannot see cases'),
  is(tests.value_as(tests.id('a_admin'), 'aal2', format('select get_case(%L) ->> %L', pg_temp.v('case'), 'summary')), 'Alleged breach of food safety rules', 'Client Admin with MFA can open the case'),
  ok((select payload::text not like '%food safety%' from cases where id = pg_temp.v('case')), 'Case summaries are stored encrypted'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', format('insert into cases (tenant_id, employee_id, reference, case_type, payload) values (%L, %L, %L, %L, %L)', tests.id('tenant_a'), tests.id('a_emp1'), 'DIS-2026-999', 'disciplinary', '\x00')), 'error:42501', 'Cases can only be created through the case functions'),
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select add_case_event(%L, current_date, %L, %L)::text is not null', pg_temp.v('case'), 'investigation_meeting', 'Met with witness')), 'true', 'HR adds a timeline event')
]);
insert into tests.results (line) select ok((select count(*) > 0 from audit_log where entity = 'cases' and action = 'view' and entity_id = pg_temp.v('case')), 'Opening a case is written to the audit log');
insert into x select 'case_hr', tests.value_as(tests.id('a_admin'), 'aal2',
  format('select open_case(%L, %L, %L)', tests.id('a_hr'), 'grievance', 'Grievance raised about the HR manager'))::uuid;
insert into tests.results (line) select is(tests.count_as(tests.id('a_hr'), 'aal2', format('select 1 from cases where id = %L', pg_temp.v('case_hr'))), 0::bigint,
  'An HR manager cannot see a case about themself');

-- Case documents: HR-only, never managers/employee/support.
insert into x values ('cdoc', gen_random_uuid());
insert into tests.results (line) select is(tests.exec_as(tests.id('a_hr'), 'aal2', format(
  'insert into documents (id, tenant_id, employee_id, category, case_id, title, file_name, mime_type, visibility, storage_path) values (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L)',
  pg_temp.v('cdoc'), tests.id('tenant_a'), tests.id('a_emp1'), 'case_document', pg_temp.v('case'), 'Witness statement', 'w.pdf', 'application/pdf', 'hr_only',
  tests.id('tenant_a')::text || '/' || tests.id('a_emp1')::text || '/' || pg_temp.v('cdoc')::text)), 'rows:1', 'HR attaches a document to the case');
update documents set status = 'available' where id = pg_temp.v('cdoc');
insert into tests.results (line) select unnest(array[
  is(tests.count_as(tests.id('a_mgr'), 'aal1', 'select 1 from documents where category = ''case_document'''), 0::bigint, 'The line manager cannot see case documents'),
  is(tests.count_as(tests.id('a_emp1'), 'aal1', 'select 1 from documents where category = ''case_document'''), 0::bigint, 'The employee cannot see case documents in the portal'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', format('update documents set visibility = %L where id = %L', 'everyone', pg_temp.v('cdoc'))), 'error:42501', 'Case documents can never be shared beyond HR')
]);
select tests.value_as(tests.id('p_admin'), 'aal2', format('select start_support_session(%L, %L)::text', tests.id('tenant_a'), 'Testing case privacy'));
insert into tests.results (line) select unnest(array[
  is(tests.count_as(tests.id('p_admin'), 'aal2', 'select 1 from cases'), 0::bigint, 'AbsorbHR support sessions cannot see cases'),
  is(tests.count_as(tests.id('p_admin'), 'aal2', 'select 1 from documents where category = ''case_document'''), 0::bigint, 'AbsorbHR support sessions cannot see case documents')
]);
select tests.value_as(tests.id('p_admin'), 'aal2', 'select end_support_session()::text');

-- ---------------------------------------------------------------- correction requests
insert into tests.results (line) select unnest(array[
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', format('insert into rectification_requests (tenant_id, employee_id, area, details) values (%L, %L, %L, %L)', tests.id('tenant_a'), tests.id('a_emp1'), 'employment', 'My start date is wrong')), 'rows:1', 'Employee asks HR to correct their record'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', format('insert into rectification_requests (tenant_id, employee_id, area, details) values (%L, %L, %L, %L)', tests.id('tenant_a'), tests.id('a_emp2'), 'employment', 'Not mine')), 'error:42501', 'An employee cannot raise a request about a colleague'),
  is(tests.count_as(tests.id('a_emp2'), 'aal1', 'select 1 from rectification_requests'), 0::bigint, 'A colleague cannot see the request'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', 'update rectification_requests set status = ''resolved'', resolution_note = ''done'''), 'rows:0', 'The employee cannot mark their own request resolved'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', 'update rectification_requests set status = ''resolved'', resolution_note = ''Start date corrected'''), 'rows:1', 'HR resolves the request')
]);

insert into tests.results (line) select * from finish();
select line from tests.results order by n;
rollback;
