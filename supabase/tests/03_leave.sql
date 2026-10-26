-- Holiday calculations (worked examples for leave year 1 Jan – 31 Dec 2027, England & Wales)
-- and the request → approve → cancel workflow permissions.
--
-- 2027 bank holidays (E&W): Fri 1 Jan, Fri 26 Mar, Mon 29 Mar, Mon 3 May, Mon 31 May,
-- Mon 30 Aug, Mon 27 Dec, Tue 28 Dec.
select plan(32);

-- Company A has confirmed its holiday rules: 28 days incl. bank holidays, carry over up to 5 days for 3 months.
update holiday_policies set configured_at = now(), carry_over_max_days = 5, carry_over_expiry_months = 3
  where tenant_id = tests.id('tenant_a');
-- a_emp2 works Mon–Wed (3 days); a new starter joins on 1 July 2027.
update employees set working_days = '{1,2,3}', days_per_week = 3 where id = tests.id('a_emp2');
insert into tests.ids values ('a_starter', 'a0000000-0000-4000-8000-0000000000a8');
insert into employees (id, tenant_id, first_name, last_name, start_date, manager_id)
  values (tests.id('a_starter'), tests.id('tenant_a'), 'New', 'Starter', '2027-07-01', tests.id('a_mgr'));
create temp table v (k text primary key, val text);
grant all on v to authenticated;
insert into v values
  ('holiday_a', (select id::text from leave_types where tenant_id = tests.id('tenant_a') and code = 'holiday')),
  ('holiday_b', (select id::text from leave_types where tenant_id = tests.id('tenant_b') and code = 'holiday')),
  ('unpaid_a', (select id::text from leave_types where tenant_id = tests.id('tenant_a') and code = 'unpaid'));

-- ---------------------------------------------------------------- calculations
insert into tests.results (line) select unnest(array[
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select entitlement from leave_balance(%L, %L)', tests.id('a_emp1'), '2027-06-01')), '28.0',
     'Full-timer: 28 days entitlement'),
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select bank_holidays from leave_balance(%L, %L)', tests.id('a_emp1'), '2027-06-01')), '8.0',
     'Full-timer: all 8 bank holidays come out of the allowance'),
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select remaining from leave_balance(%L, %L)', tests.id('a_emp1'), '2027-06-01')), '20.0',
     'Full-timer: 20 days left to book'),
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select entitlement from leave_balance(%L, %L)', tests.id('a_emp2'), '2027-06-01')), '17.0',
     'Part-timer Mon–Wed: 28 × 3/5 = 16.8, rounded up to 17'),
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select bank_holidays from leave_balance(%L, %L)', tests.id('a_emp2'), '2027-06-01')), '6.0',
     'Part-timer Mon–Wed: only the 6 bank holidays on Mon–Wed are deducted'),
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select remaining from leave_balance(%L, %L)', tests.id('a_emp2'), '2027-06-01')), '11.0',
     'Part-timer Mon–Wed: 11 days left to book'),
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select entitlement from leave_balance(%L, %L)', tests.id('a_starter'), '2027-08-01')), '14.5',
     'Starter on 1 July: 28 × 184/365 = 14.1, rounded up to 14.5'),
  is(tests.value_as(tests.id('a_hr'), 'aal2', format('select remaining from leave_balance(%L, %L)', tests.id('a_starter'), '2027-08-01')), '11.5',
     'Starter on 1 July: minus the 3 bank holidays after they start = 11.5'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select count_leave_days(%L, %L, %L)', tests.id('a_emp1'), '2027-03-22', '2027-04-02')), '8',
     'Two weeks over Easter = 8 days (Good Friday and Easter Monday not counted)'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select count_leave_days(%L, %L, %L, true, false)', tests.id('a_emp1'), '2027-03-22', '2027-04-02')), '7.5',
     'Starting after lunch on the first day = 7.5 days'),
  is(tests.value_as(tests.id('a_emp2'), 'aal1', format('select count_leave_days(%L, %L, %L)', tests.id('a_emp2'), '2027-06-07', '2027-06-13')), '3',
     'Part-timer booking a whole week uses only their 3 working days')
]);

-- ---------------------------------------------------------------- requests: validation
insert into tests.results (line) select unnest(array[
  is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select request_leave(%L, %L, %L, %L)::text is not null', tests.id('a_emp1'), (select val from v where k='holiday_a'), '2027-03-22', '2027-04-02')), 'true',
     'Employee can request holiday for themself'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select request_leave(%L, %L, %L, %L)::text', tests.id('a_emp1'), (select val from v where k='holiday_a'), '2027-03-31', '2027-04-01')), 'error:22023',
     'Overlapping request is refused'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select request_leave(%L, %L, %L, %L)::text', tests.id('a_emp1'), (select val from v where k='holiday_a'), '2027-06-01', '2027-07-30')), 'error:22023',
     'Request bigger than the remaining balance (incl. pending) is refused'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select request_leave(%L, %L, %L, %L)::text', tests.id('a_emp1'), (select val from v where k='holiday_a'), '2027-12-30', '2028-01-04')), 'error:22023',
     'Request spanning two leave years is refused'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select request_leave(%L, %L, %L, %L)::text', tests.id('a_emp1'), (select val from v where k='holiday_a'), '2027-05-01', '2027-05-02')), 'error:22023',
     'Request covering only non-working days is refused'),
  is(tests.value_as(tests.id('b_emp'), 'aal1', format('select request_leave(%L, %L, %L, %L)::text', tests.id('b_emp'), (select val from v where k='holiday_b'), '2027-06-07', '2027-06-08')), 'error:22023',
     'Holiday cannot be booked until the company has confirmed its holiday rules'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select request_leave(%L, %L, %L, %L)::text', tests.id('a_emp2'), (select val from v where k='holiday_a'), '2027-06-07', '2027-06-08')), 'error:42501',
     'Employee cannot book leave for a colleague'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', format('update leave_requests set status = %L', 'approved')), 'error:42501',
     'Employee cannot approve their own request by editing it directly'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select remaining::text || %L || pending::text from leave_balance(%L, %L)', '/', tests.id('a_emp1'), '2027-06-01')), '20.0/8.0',
     'Pending request shows separately and is not yet taken from the balance')
]);

-- ---------------------------------------------------------------- approvals
create temp table req as select id from leave_requests where employee_id = tests.id('a_emp1');
grant select on req to authenticated;
insert into tests.results (line) select is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select decide_leave(%L, true)::text', (select id from req))), 'error:42501',
  'Employee cannot approve their own request');
insert into tests.results (line) select is(tests.value_as(tests.id('a_lead'), 'aal1', format('select decide_leave(%L, true)::text', (select id from req))), 'error:42501',
  'A line manager who is not their manager cannot approve');
insert into tests.results (line) select is(tests.value_as(tests.id('a_hr'), 'aal1', format('select decide_leave(%L, true)::text', (select id from req))), 'error:42501',
  'HR manager without MFA cannot approve');
insert into tests.results (line) select is(tests.value_as(tests.id('a_mgr'), 'aal1', format('select decide_leave(%L, true)::text', (select id from req))), '',
  'Direct line manager can approve');
insert into tests.results (line) select is(tests.value_as(tests.id('a_hr'), 'aal2', format('select remaining from leave_balance(%L, %L)', tests.id('a_emp1'), '2027-06-01')), '12.0',
  'Approved 8 days: 20 − 8 = 12 left');
insert into tests.results (line) select is(tests.value_as(tests.id('a_mgr'), 'aal1', format('select decide_leave(%L, false)::text', (select id from req))), 'error:22023',
  'An already-decided request cannot be decided again');
insert into tests.results (line) select is(tests.count_as(tests.id('a_emp2'), 'aal1', format('select 1 from leave_requests where employee_id = %L', tests.id('a_emp1'))), 0::bigint,
  'A colleague cannot see someone else''s leave requests');
insert into tests.results (line) select is(tests.value_as(tests.id('a_emp2'), 'aal1', format('select string_agg(label, %L) from absence_calendar(%L, %L) where employee_id = %L', ',', '2027-03-01', '2027-04-30', tests.id('a_emp1'))), 'Away',
  'Teammates see approved leave on the calendar only as "Away"');
insert into tests.results (line) select is(tests.count_as(tests.id('b_admin'), 'aal2', format('select 1 from absence_calendar(%L, %L) where employee_id = %L', '2027-03-01', '2027-04-30', tests.id('a_emp1'))), 0::bigint,
  'Another company sees nothing on its calendar');

-- ---------------------------------------------------------------- cancel + carry-over
insert into tests.results (line) select is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select cancel_leave(%L)::text', (select id from req))), '',
  'Employee can cancel their own future approved holiday');
insert into tests.results (line) select is(tests.value_as(tests.id('a_hr'), 'aal2', format('select coalesce(process_carry_over(%L)::text, %L)', '2027-01-01', 'none')), '8',
  'Year-end carry-over runs for all 8 Company A employees (including the July starter)');
insert into tests.results (line) select is(tests.value_as(tests.id('a_hr'), 'aal2', format('select carried_over from leave_balance(%L, %L)', tests.id('a_emp1'), '2028-02-01')), '5.0',
  'Unused holiday carried into 2028 is capped at the company''s 5 days');

insert into tests.results (line) select * from finish();
select line from tests.results order by n;
rollback;
