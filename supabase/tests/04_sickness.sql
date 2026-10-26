-- Sickness absence: who can see dates and reasons, return-to-work forms, Bradford Factor,
-- exclusions, and how sickness appears on the team calendar.
-- Dates are relative to today (Tue–Thu spells, avoiding Monday/Friday bank holidays).
select plan(25);

create temp table d as select
  (date_trunc('week', current_date)::date - 49 + 2) as s1,        -- a Wednesday 7 weeks ago (1 day)
  (date_trunc('week', current_date)::date - 21 + 1) as s2_start,  -- Tuesday 3 weeks ago
  (date_trunc('week', current_date)::date - 21 + 3) as s2_end;    -- Thursday 3 weeks ago (3 days)
grant select on d to authenticated;
create temp table sick (k text primary key, id uuid);
grant select on sick to authenticated;

-- ---------------------------------------------------------------- recording
insert into sick select 's1', tests.value_as(tests.id('a_emp1'), 'aal1',
  format('select record_sickness(%L, %L, %L, false, false, %L, %L)', tests.id('a_emp1'), (select s1 from d), (select s1 from d), 'cold_flu', 'Bad cold'))::uuid;
insert into sick select 's2', tests.value_as(tests.id('a_mgr'), 'aal1',
  format('select record_sickness(%L, %L, %L, false, false, %L, null)', tests.id('a_emp1'), (select s2_start from d), (select s2_end from d), 'musculoskeletal'))::uuid;

insert into tests.results (line) select unnest(array[
  ok((select id from sick where k = 's1') is not null, 'Employee can report their own sickness'),
  ok((select id from sick where k = 's2') is not null, 'Direct line manager can record sickness for their report'),
  is(tests.value_as(tests.id('a_emp2'), 'aal1', format('select record_sickness(%L, %L)::text', tests.id('a_emp1'), current_date)), 'error:42501',
     'A colleague cannot record sickness for someone else'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select record_sickness(%L, %L)::text', tests.id('a_emp1'), (select s1 from d))), 'error:22023',
     'Overlapping sickness records are refused'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', format('insert into sickness_absences (tenant_id, employee_id, start_date, reported_by) values (%L, %L, current_date, %L)',
       tests.id('tenant_a'), tests.id('a_emp1'), tests.id('a_hr'))), 'error:42501',
     'Nobody can write sickness rows directly (functions only)')
]);

-- ---------------------------------------------------------------- who sees dates and reasons
insert into tests.results (line) select unnest(array[
  is(tests.count_as(tests.id('a_emp2'), 'aal1', format('select 1 from sickness_absences where employee_id = %L', tests.id('a_emp1'))), 0::bigint,
     'A colleague cannot see someone''s sickness records'),
  is(tests.count_as(tests.id('a_mgr'), 'aal1', format('select 1 from sickness_absences where employee_id = %L', tests.id('a_emp1'))), 2::bigint,
     'Direct line manager sees their report''s sickness dates'),
  is(tests.count_as(tests.id('a_lead'), 'aal1', format('select 1 from sickness_absences where employee_id = %L', tests.id('a_emp1'))), 0::bigint,
     'A different line manager sees nothing'),
  is(tests.count_as(tests.id('a_hr'), 'aal1', format('select 1 from sickness_absences where employee_id = %L', tests.id('a_emp1'))), 0::bigint,
     'HR without MFA sees nothing'),
  is(tests.count_as(tests.id('a_hr'), 'aal2', format('select 1 from sickness_absences where employee_id = %L', tests.id('a_emp1'))), 2::bigint,
     'HR with MFA sees the sickness dates'),
  is(tests.value_as(tests.id('a_mgr'), 'aal1', format('select get_sickness_details(%L) -> %L ->> %L', (select id from sick where k='s1'), 'details', 'reason_category')), 'cold_flu',
     'Direct line manager can read the reason (for the return-to-work meeting)'),
  is(tests.value_as(tests.id('a_emp2'), 'aal1', format('select get_sickness_details(%L)::text', (select id from sick where k='s1'))), 'error:42501',
     'A colleague cannot read the reason'),
  is(tests.value_as(tests.id('b_admin'), 'aal2', format('select get_sickness_details(%L)::text', (select id from sick where k='s1'))), 'error:42501',
     'Another company''s admin cannot read the reason'),
  ok((select payload::text not like '%cold_flu%' from sickness_details where absence_id = (select id from sick where k='s1')),
     'Sickness reasons are stored encrypted')
]);

-- ---------------------------------------------------------------- Bradford Factor and exclusions
insert into tests.results (line) select is(tests.value_as(tests.id('a_mgr'), 'aal1', format('select score::text from bradford_scores() where employee_id = %L', tests.id('a_emp1'))), '16',
  'Bradford Factor: 2 spells, 4 days lost → 2² × 4 = 16');
insert into tests.results (line) select is(tests.count_as(tests.id('a_emp2'), 'aal1', format('select 1 from bradford_scores() where employee_id = %L', tests.id('a_emp1'))), 0::bigint,
  'A colleague cannot see someone else''s Bradford score');
insert into tests.results (line) select is(tests.value_as(tests.id('a_mgr'), 'aal1', format('select set_sickness_exclusion(%L, %L)::text', (select id from sick where k='s2'), 'pregnancy')), 'error:42501',
  'Only HR can exclude a spell from triggers');
insert into tests.results (line) select is(tests.value_as(tests.id('a_hr'), 'aal2', format('select set_sickness_exclusion(%L, %L)::text', (select id from sick where k='s2'), 'pregnancy')), '',
  'HR can exclude a pregnancy-related spell');
insert into tests.results (line) select is(tests.value_as(tests.id('a_mgr'), 'aal1', format('select score::text from bradford_scores() where employee_id = %L', tests.id('a_emp1'))), '1',
  'Excluded spell no longer counts: 1² × 1 = 1');

-- ---------------------------------------------------------------- return to work
insert into tests.results (line) select is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select save_return_to_work(%L, current_date, %L::jsonb)::text', (select id from sick where k='s1'), '{"fit_to_return":"yes"}')), 'error:42501',
  'Employees cannot complete their own return-to-work form');
insert into tests.results (line) select is(tests.value_as(tests.id('a_mgr'), 'aal1', format('select save_return_to_work(%L, current_date, %L::jsonb)::text', (select id from sick where k='s1'), '{"fit_to_return":"yes","notes":"Feeling better"}')), '',
  'Line manager completes the return-to-work form');
insert into tests.results (line) select is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select get_sickness_details(%L) -> %L ->> %L', (select id from sick where k='s1'), 'rtw', 'fit_to_return')), 'yes',
  'Employee can read their own return-to-work form');

-- ---------------------------------------------------------------- calendar + AbsorbHR support
insert into tests.results (line) select is(tests.value_as(tests.id('a_emp2'), 'aal1', format('select string_agg(label, %L) from absence_calendar(%L, %L) where employee_id = %L', ',', (select s1 from d), (select s1 from d), tests.id('a_emp1'))), 'Away',
  'Teammates see sickness on the calendar only as "Away"');
insert into tests.results (line) select is(tests.value_as(tests.id('a_mgr'), 'aal1', format('select string_agg(label, %L) from absence_calendar(%L, %L) where employee_id = %L', ',', (select s1 from d), (select s1 from d), tests.id('a_emp1'))), 'Sickness',
  'The direct line manager sees it as "Sickness"');
select tests.value_as(tests.id('p_admin'), 'aal2', format('select start_support_session(%L, %L)::text', tests.id('tenant_a'), 'Testing sickness privacy'));
insert into tests.results (line) select is(tests.count_as(tests.id('p_admin'), 'aal2', 'select 1 from sickness_absences'), 0::bigint,
  'AbsorbHR support sessions cannot see sickness records');

insert into tests.results (line) select * from finish();
select line from tests.results order by n;
rollback;
