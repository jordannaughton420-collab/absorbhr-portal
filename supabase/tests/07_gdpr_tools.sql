-- Subject Access Request data, SAR export records, breach log, email outbox,
-- retention/anonymisation and daily housekeeping.
select plan(47);

-- A private note, so we can check SARs include it.
insert into one_to_one_notes (tenant_id, employee_id, author_id, meeting_date, notes, is_private)
values (tests.id('tenant_a'), tests.id('a_emp1'), tests.id('a_mgr'), current_date, 'Private thought about Eve', true);

-- ---------------------------------------------------------------- SAR
insert into tests.results (line) select unnest(array[
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select sar_data(%L) -> %L ->> %L', tests.id('a_emp1'), 'employment_record', 'first_name')), 'Eve',
    'HR with MFA can produce a subject access export'),
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select (sar_data(%L) -> %L -> 0 ->> %L)', tests.id('a_emp1'), 'one_to_one_notes', 'private')), 'true',
    'The export includes private 1-to-1 notes (they are disclosable)'),
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select sar_data(%L) -> %L ->> %L', tests.id('a_emp1'), 'personal_details', 'postcode')), 'ZZ1 1ZZ',
    'The export includes personal details'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select sar_data(%L)::text', tests.id('a_emp1'))), 'error:42501', 'Employees cannot run the export themselves'),
  is(tests.value_as(tests.id('a_mgr'), 'aal1', format('select sar_data(%L)::text', tests.id('a_emp1'))), 'error:42501', 'Line managers cannot run it'),
  is(tests.value_as(tests.id('a_hr'), 'aal1', format('select sar_data(%L)::text', tests.id('a_emp1'))), 'error:42501', 'HR without MFA cannot run it'),
  is(tests.value_as(tests.id('b_admin'), 'aal2', format('select sar_data(%L)::text', tests.id('a_emp1'))), 'error:42501', 'Another company cannot run it'),
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select sar_data(%L)::text', tests.id('a_hr'))), 'error:42501', 'HR cannot export their own file (another HR person must)')
]);
insert into tests.results (line) select ok(exists (select 1 from audit_log where action = 'export' and entity = 'sar' and subject_employee_id = tests.id('a_emp1')),
  'Each export is written to the audit log');

-- Support sessions never get SAR data.
select tests.value_as(tests.id('p_admin'), 'aal2', format('select start_support_session(%L, %L)::text', tests.id('tenant_a'), 'Checking SAR tool'));
insert into tests.results (line) select is(tests.value_as(tests.id('p_admin'), 'aal2', format('select sar_data(%L)::text', tests.id('a_emp1'))), 'error:42501',
  'AbsorbHR support sessions cannot produce exports');
update support_sessions set ended_at = now() where admin_user_id = tests.id('p_admin') and ended_at is null;

-- ---------------------------------------------------------------- SAR export records
insert into tests.results (line) select unnest(array[
  is(tests.exec_as(tests.id('a_hr'), 'aal2', format('insert into sar_exports (tenant_id, employee_id, request_received_on, requested_by) values (%L, %L, current_date, %L)',
    tests.id('tenant_a'), tests.id('a_emp1'), tests.id('a_hr'))), 'rows:1', 'HR records an export'),
  is(tests.count_as(tests.id('a_emp1'), 'aal1', 'select 1 from sar_exports'), 0::bigint, 'The employee cannot see export records'),
  is(tests.count_as(tests.id('a_mgr'), 'aal1', 'select 1 from sar_exports'), 0::bigint, 'Managers cannot see export records'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', 'update sar_exports set status = ''released'', released_at = now()'), 'rows:1', 'HR marks the export as released after review'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', format('update sar_exports set employee_id = %L', tests.id('a_emp2'))), 'error:42501', 'An export cannot be moved to another person')
]);

-- ---------------------------------------------------------------- breach log
create function pg_temp.breach(p_user text) returns text language sql as $$
  select format('insert into data_breaches (tenant_id, title, discovered_at, description, created_by) values (%L, %L, now(), %L, %L)',
    tests.id('tenant_a'), 'Email sent to wrong person', 'A payslip query was emailed to the wrong address.', tests.id(p_user)) $$;
insert into tests.results (line) select unnest(array[
  is(tests.exec_as(tests.id('a_admin'), 'aal2', pg_temp.breach('a_admin')), 'rows:1', 'Client Admin logs a breach'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', pg_temp.breach('a_hr')), 'error:42501', 'HR managers cannot log breaches (Client Admin only)'),
  is(tests.count_as(tests.id('a_hr'), 'aal2', 'select 1 from data_breaches'), 0::bigint, 'HR managers cannot read the breach log'),
  is(tests.count_as(tests.id('a_emp1'), 'aal1', 'select 1 from data_breaches'), 0::bigint, 'Employees cannot read the breach log'),
  is(tests.count_as(tests.id('b_admin'), 'aal2', 'select 1 from data_breaches'), 0::bigint, 'Another company cannot read it'),
  is(tests.count_as(tests.id('p_admin'), 'aal2', 'select 1 from data_breaches'), 1::bigint, 'AbsorbHR admins can read every company''s breach log'),
  is(tests.count_as(tests.id('p_admin'), 'aal1', 'select 1 from data_breaches'), 0::bigint, '…but only with MFA'),
  is(tests.exec_as(tests.id('a_admin'), 'aal2', 'update data_breaches set ico_reportable = false, decision_reason = ''Low risk, contained same day'''), 'rows:1', 'Client Admin records the ICO decision'),
  is(tests.exec_as(tests.id('a_admin'), 'aal2', 'delete from data_breaches'), 'error:42501', 'Breach records cannot be deleted')
]);

-- ---------------------------------------------------------------- email outbox
select set_config('request.jwt.claims', '', true);
insert into rectification_requests (tenant_id, employee_id, area, details) values (tests.id('tenant_a'), tests.id('a_emp1'), 'other', 'Please fix my name');
insert into tests.results (line) select is((select count(*) from email_outbox where template = 'correction_requested' and tenant_id = tests.id('tenant_a')), 2::bigint,
  'A new correction request emails both HR users');
update rectification_requests set status = 'resolved', resolution_note = 'Fixed' where employee_id = tests.id('a_emp1');
insert into tests.results (line) select unnest(array[
  is((select count(*) from email_outbox where template = 'correction_answered' and user_id = tests.id('a_emp1')), 1::bigint, 'The employee is emailed when HR answers'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', 'select * from email_outbox'), 'error:42501', 'Nobody can read the email queue through the app'),
  is(tests.exec_as(tests.id('a_admin'), 'aal2', 'select * from cleanup_queue'), 'error:42501', 'Nobody can read the clean-up queue through the app')
]);

-- ---------------------------------------------------------------- retention and anonymisation
update employees set status = 'leaver', start_date = '2010-01-01', end_date = current_date - interval '7 years' where id = tests.id('a_emp4');
insert into tests.results (line) select unnest(array[
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select is_due::text from retention_due() where employee_id = %L', tests.id('a_emp4'))), 'true',
    'A leaver from 7 years ago is listed as due for anonymisation'),
  is(tests.count_as(tests.id('a_emp1'), 'aal1', 'select 1 from retention_due()'), 0::bigint, 'Employees see nothing in the retention list'),
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select anonymise_employee(%L)::text', tests.id('a_emp2'))), 'error:22023', 'Current employees cannot be anonymised'),
  is(tests.value_as(tests.id('a_mgr'), 'aal1', format('select anonymise_employee(%L)::text', tests.id('a_emp4'))), 'error:42501', 'Line managers cannot anonymise anyone')
]);
select tests.value_as(tests.id('a_hr'), 'aal2', format('select set_retention_hold(%L, %L)::text', tests.id('a_emp4'), 'Tribunal claim pending'));
insert into tests.results (line) select is(tests.value_as(tests.id('a_hr'), 'aal2', format('select anonymise_employee(%L)::text', tests.id('a_emp4'))), 'error:22023',
  'A record on hold (e.g. live claim) cannot be anonymised');
select tests.value_as(tests.id('a_hr'), 'aal2', format('select set_retention_hold(%L, null)::text', tests.id('a_emp4')));
insert into tests.results (line) select is(tests.value_as(tests.id('a_hr'), 'aal2', format('select anonymise_employee(%L)::text', tests.id('a_emp4'))), '',
  'HR confirms anonymisation once the hold is lifted');
insert into tests.results (line) select unnest(array[
  is((select first_name || ' ' || last_name || ' ' || (anonymised_at is not null)::text from employees where id = tests.id('a_emp4')), 'Former employee true',
    'Name replaced; record marked anonymised'),
  is((select (select count(*) from employee_personal where employee_id = tests.id('a_emp4'))
            + (select count(*) from emergency_contacts where employee_id = tests.id('a_emp4'))
            + (select count(*) from salary_history where employee_id = tests.id('a_emp4'))
            + (select count(*) from right_to_work_checks where employee_id = tests.id('a_emp4'))), 0::bigint,
    'Personal details, contacts, salary and right-to-work records are deleted'),
  is((select count(*) from memberships where user_id = tests.id('a_emp4')), 0::bigint, 'Portal access is removed'),
  is((select count(*) from cleanup_queue where kind = 'auth_user' and user_id = tests.id('a_emp4')), 1::bigint, 'The login account is queued for deletion'),
  ok(exists (select 1 from erasure_log where employee_id = tests.id('a_emp4') and not early), 'The erasure is recorded in the erasure log'),
  ok(exists (select 1 from audit_log where action = 'anonymise' and entity_id = tests.id('a_emp4')), 'and in the audit log'),
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select anonymise_employee(%L)::text', tests.id('a_emp4'))), 'error:22023', 'A record cannot be anonymised twice')
]);

-- Early erasure (before the retention period ends): Client Admin only, with a reason.
update employees set status = 'leaver', end_date = current_date - 10 where id = tests.id('a_emp2');
insert into tests.results (line) select unnest(array[
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select anonymise_employee(%L)::text', tests.id('a_emp2'))), 'error:22023', 'A recent leaver is not yet due'),
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select anonymise_employee(%L, %L, true)::text', tests.id('a_emp2'), 'Erasure request upheld by our DPO')), 'error:42501',
    'HR managers cannot erase early'),
  is(tests.value_as(tests.id('a_admin'), 'aal2', format('select anonymise_employee(%L, %L, true)::text', tests.id('a_emp2'), 'Too short')), 'error:22023',
    'Early erasure needs a proper reason'),
  is(tests.value_as(tests.id('a_admin'), 'aal2', format('select anonymise_employee(%L, %L, true)::text', tests.id('a_emp2'), 'Erasure request upheld by our DPO')), '',
    'Client Admin can erase early with a recorded reason')
]);

-- Companies cannot set retention below the 6-year floor.
insert into tests.results (line) select is(tests.exec_as(tests.id('a_admin'), 'aal2', format('update tenant_settings set retention_years = 5 where tenant_id = %L', tests.id('tenant_a'))),
  'error:23514', 'Retention cannot be set below 6 years');

-- ---------------------------------------------------------------- housekeeping
insert into documents (id, tenant_id, employee_id, category, title, file_name, mime_type, visibility, status, storage_path, uploaded_by, created_at)
values ('dd000000-0000-4000-8000-000000000001', tests.id('tenant_a'), tests.id('a_emp1'), 'other', 'Abandoned', 'x.pdf', 'application/pdf', 'hr_only', 'uploading',
  tests.id('tenant_a') || '/' || tests.id('a_emp1') || '/dd000000-0000-4000-8000-000000000001', tests.id('a_hr'), now() - interval '2 days');
select app.daily_housekeeping();
insert into tests.results (line) select ok(
  not exists (select 1 from documents where id = 'dd000000-0000-4000-8000-000000000001')
  and exists (select 1 from cleanup_queue where kind = 'storage' and path like '%dd000000-0000-4000-8000-000000000001'),
  'The nightly job removes abandoned uploads and queues their files for deletion');

insert into tests.results (line) select * from finish();
select line from tests.results order by n;
rollback;
