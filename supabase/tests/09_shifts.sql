-- Shifts and open shifts: who can plan, who is offered an open shift and why others aren't,
-- first to accept wins, nobody else can take it afterwards, and people only see what they should.
select plan(61);

-- An employee with no login (can't be offered shifts: they couldn't accept).
insert into public.employees (id, tenant_id, first_name, last_name, start_date, manager_id)
values ('a0000000-0000-4000-8000-000000000099', tests.id('tenant_a'), 'Nat', 'Nologin', '2022-01-01', tests.id('a_mgr'));

-- Eli (a_emp2) is on approved holiday and Lee (a_lead) is off sick on Wed 10 Mar 2027.
insert into public.leave_requests (tenant_id, employee_id, leave_type_id, start_date, end_date, days, leave_year_start, requested_by, status)
values (tests.id('tenant_a'), tests.id('a_emp2'),
        (select id from public.leave_types where tenant_id = tests.id('tenant_a') order by deducts_allowance desc, name limit 1),
        '2027-03-10', '2027-03-10', 1, '2027-01-01', tests.id('a_emp2'), 'approved');
insert into public.sickness_absences (tenant_id, employee_id, start_date, end_date, reported_by)
values (tests.id('tenant_a'), tests.id('a_lead'), '2027-03-09', '2027-03-11', tests.id('a_mgr'));

create function pg_temp.mk(p_emp text, p_date text, p_start text, p_end text, p_allow boolean default false) returns text language sql as $$
  select format('select create_shift(%L, %L, %L, %L, %L, null, null, %L)', tests.id(p_emp), p_date, p_start, p_end, 'Bar', p_allow) $$;
create function pg_temp.shift_at(p_date date, p_start time) returns uuid language sql as $$
  select id from public.shifts where starts_at = app.shift_start(p_date, p_start) and status <> 'cancelled'
  order by created_at limit 1 $$;
create function pg_temp.grp() returns uuid language sql as $$
  select id from public.shift_groups where tenant_id = tests.id('tenant_a') and lower(name) = 'open shifts' $$;

-- ---------------------------------------------------------------- planning shifts
insert into tests.results (line) select unnest(array[
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', pg_temp.mk('a_emp1', '2027-03-12', '09:00', '17:00')), 'error:42501',
    'An employee cannot put shifts on the rota'),
  is(tests.exec_as(tests.id('a_mgr'), 'aal1', pg_temp.mk('a_emp1', '2027-03-12', '09:00', '17:00')), 'error:42501',
    'A line manager cannot plan shifts while the company setting is off'),
  is(tests.exec_as(tests.id('b_admin'), 'aal2', pg_temp.mk('a_emp4', '2027-03-10', '04:00', '12:00')), 'error:42501',
    'Another company cannot plan shifts for our staff'),
  is(tests.exec_as(tests.id('a_hr'), 'aal1', pg_temp.mk('a_emp4', '2027-03-10', '04:00', '12:00')), 'error:42501',
    'HR must have two-step verification on to plan shifts'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', pg_temp.mk('a_emp4', '2027-03-10', '04:00', '12:00')), 'rows:1',
    'HR can put a shift on the rota'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', pg_temp.mk('a_emp4', '2027-03-10', '10:00', '14:00')), 'error:22023',
    'A shift that overlaps another of the person''s shifts is refused'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', pg_temp.mk('a_emp4', '2027-03-10', '18:00', '22:00')), 'error:22023',
    'A shift that leaves less than an 11-hour rest break is refused…'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', pg_temp.mk('a_emp1', '2027-04-01', '06:00', '14:00')), 'rows:1',
    '(an early shift)'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', pg_temp.mk('a_emp1', '2027-04-01', '20:00', '23:00', true)), 'rows:1',
    '…unless HR says to allow the short rest'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', pg_temp.mk('a_emp2', '2027-03-10', '09:00', '17:00')), 'error:22023',
    'Nobody can be put on a shift while on approved holiday'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', pg_temp.mk('a_lead', '2027-03-10', '09:00', '17:00')), 'error:22023',
    '…or while off sick')
]);
insert into tests.results (line) select unnest(array[
  is((select to_char(ends_at at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI') from public.shifts
       where starts_at = app.shift_start('2027-04-01', '20:00')), '2027-04-01 23:00',
    'Shift times are UK time (British Summer Time on 1 Apr 2027)'),
  is(app.shift_end('2027-03-10', '20:00', '05:00') - app.shift_start('2027-03-10', '20:00'), interval '9 hours',
    'An end time earlier than the start means the next morning (8pm to 5am is 9 hours)')
]);

select set_config('request.jwt.claims', '', true);
update public.tenant_settings set managers_can_plan_shifts = true where tenant_id = tests.id('tenant_a');

insert into tests.results (line) select unnest(array[
  is(tests.exec_as(tests.id('a_mgr'), 'aal1', pg_temp.mk('a_emp1', '2027-03-12', '09:00', '17:00')), 'rows:1',
    'With the setting on, a line manager can plan shifts for their own team'),
  is(tests.exec_as(tests.id('a_mgr'), 'aal1', pg_temp.mk('a_emp4', '2027-03-13', '09:00', '17:00')), 'error:42501',
    '…but not for people who don''t report to them'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', 'update tenant_settings set managers_can_plan_shifts = false'), 'rows:0',
    'Employees cannot change the setting')
]);

-- ---------------------------------------------------------------- open shift groups
insert into tests.results (line) select unnest(array[
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', format('select add_to_shift_group(%L, %L)', tests.id('a_emp1'), 'Open shifts')), 'error:42501',
    'Employees cannot add people to open shift groups'),
  is(tests.exec_as(tests.id('a_mgr'), 'aal1', format('select add_to_shift_group(%L, %L)', tests.id('a_emp1'), 'Open shifts')), 'error:42501',
    '…nor can line managers (groups are managed by HR)'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', format('select add_to_shift_group(%L, %L), add_to_shift_group(%L, %L), add_to_shift_group(%L, %L), add_to_shift_group(%L, %L), add_to_shift_group(%L, %L)',
      tests.id('a_emp1'), 'Open shifts', tests.id('a_emp2'), 'Open shifts', tests.id('a_lead'), 'Open shifts',
      tests.id('a_emp4'), 'open SHIFTS', 'a0000000-0000-4000-8000-000000000099', 'Open shifts')), 'rows:1',
    'HR can add people to a group, which is created the first time')
]);
insert into tests.results (line) select unnest(array[
  is((select count(*) from public.shift_groups where tenant_id = tests.id('tenant_a')), 1::bigint,
    'Group names ignore capitals, so there is still one group'),
  is(tests.count_as(tests.id('a_hr'), 'aal2', 'select 1 from shift_group_members'), 5::bigint,
    'HR sees everyone in the group'),
  is(tests.count_as(tests.id('a_emp1'), 'aal1', 'select 1 from shift_group_members'), 1::bigint,
    'An employee sees only their own membership'),
  is(tests.count_as(tests.id('b_admin'), 'aal2', 'select 1 from shift_groups'), 0::bigint,
    'Another company cannot see our groups')
]);

-- ---------------------------------------------------------------- who an open shift goes to
create function pg_temp.why(p_user text, p_aal text, p_emp text) returns text language sql as $$
  select tests.value_as(tests.id(p_user), p_aal, format(
    'select coalesce(reason, %L) from open_shift_candidates(%L, %L, %L, %L) where employee_id = %L',
    'free', '2027-03-10', '20:00', '05:00', pg_temp.grp(), p_emp)) $$;

insert into tests.results (line) select unnest(array[
  is(pg_temp.why('a_hr', 'aal2', tests.id('a_emp1')::text), 'free', 'Eve is free for Wed 10 Mar, 8pm to 5am'),
  is(pg_temp.why('a_hr', 'aal2', tests.id('a_emp2')::text), 'on_leave', 'Eli is left out: on holiday'),
  is(pg_temp.why('a_hr', 'aal2', tests.id('a_lead')::text), 'off_sick', 'Lee is left out: off sick'),
  is(pg_temp.why('a_hr', 'aal2', tests.id('a_emp4')::text), 'rest_break', 'Fay is left out: her earlier shift leaves under 11 hours'' rest'),
  is(pg_temp.why('a_hr', 'aal2', 'a0000000-0000-4000-8000-000000000099'), 'no_login', 'Nat is left out: no login to accept with'),
  is(pg_temp.why('a_mgr', 'aal1', tests.id('a_emp4')::text), 'not_your_team', 'A manager can only offer shifts to their own team'),
  is(pg_temp.why('a_emp1', 'aal1', tests.id('a_emp1')::text), 'error:42501', 'Employees cannot see who would be offered a shift')
]);

-- ---------------------------------------------------------------- posting and accepting
create function pg_temp.post(p_date text, p_people text) returns text language sql as $$
  select format('select post_open_shift(%L, %L, %L, %L, null, %L, %s, %s)', p_date, '20:00', '05:00', 'Night cover',
    'Lock up at the end', case when p_people is null then quote_literal(pg_temp.grp()) else 'null' end,
    coalesce(quote_literal(p_people) || '::uuid[]', 'null')) $$;

insert into tests.results (line) select unnest(array[
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', pg_temp.post('2027-03-10', null)), 'error:42501',
    'An employee cannot post an open shift'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', pg_temp.post('2020-01-10', null)), 'error:22023',
    'An open shift in the past cannot be posted'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', pg_temp.post('2027-03-10', null)), 'rows:1',
    'HR posts an open shift to the group')
]);
insert into tests.results (line) select unnest(array[
  is((select count(*) from public.shift_offers where shift_id = pg_temp.shift_at('2027-03-10', '20:00')), 1::bigint,
    'It goes only to the person who is free'),
  is((select count(*) from public.email_outbox where template = 'open_shift_offered' and user_id = tests.id('a_emp1')), 1::bigint,
    'They get an email (with no shift details in it)'),
  is(tests.count_as(tests.id('a_emp1'), 'aal1', format('select 1 from shifts where id = %L', pg_temp.shift_at('2027-03-10', '20:00'))), 1::bigint,
    'The person offered it can see the open shift'),
  is(tests.count_as(tests.id('a_emp2'), 'aal1', format('select 1 from shifts where id = %L', pg_temp.shift_at('2027-03-10', '20:00'))), 0::bigint,
    'Someone it wasn''t offered to cannot'),
  is(tests.exec_as(tests.id('a_emp2'), 'aal1', format('select claim_open_shift(%L)', pg_temp.shift_at('2027-03-10', '20:00'))), 'error:42501',
    '…and cannot accept it')
]);

-- A second open shift, offered to two named people.
insert into tests.results (line) select unnest(array[
  is(tests.exec_as(tests.id('a_hr'), 'aal2', pg_temp.post('2027-03-20', format('{%s,%s}', tests.id('a_emp1'), tests.id('a_emp2')))), 'rows:1',
    'HR posts an open shift to two named people')
]);
insert into tests.results (line) select unnest(array[
  is((select count(*) from public.shift_offers where shift_id = pg_temp.shift_at('2027-03-20', '20:00')), 2::bigint,
    'Both are offered it'),
  is(tests.exec_as(tests.id('a_emp2'), 'aal1', format('select claim_open_shift(%L)', pg_temp.shift_at('2027-03-20', '20:00'))), 'rows:1',
    'The first to accept gets it'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', format('select claim_open_shift(%L)', pg_temp.shift_at('2027-03-20', '20:00'))), 'error:22023',
    'Nobody else can accept it afterwards')
]);
insert into tests.results (line) select unnest(array[
  is((select employee_id from public.shifts where id = pg_temp.shift_at('2027-03-20', '20:00')), tests.id('a_emp2'),
    'The shift is now on the rota for the person who accepted'),
  is((select count(*) from public.email_outbox where template = 'open_shift_filled' and user_id = tests.id('a_hr')), 1::bigint,
    'The person who posted it is emailed that it has been filled'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select status from shifts where id = %L', pg_temp.shift_at('2027-03-20', '20:00'))), 'scheduled',
    'The other person can see it has gone')
]);

-- Saying no, then changing your mind while it is still open.
insert into tests.results (line) select unnest(array[
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', format('select decline_open_shift(%L)', pg_temp.shift_at('2027-03-10', '20:00'))), 'rows:1',
    'A person can say no to an open shift'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', format('select claim_open_shift(%L)', pg_temp.shift_at('2027-03-10', '20:00'))), 'rows:1',
    '…and still accept it later if it is still open')
]);

-- An open shift that has already started can't be accepted.
insert into public.shifts (id, tenant_id, starts_at, ends_at, status, created_by)
values ('5f000000-0000-4000-8000-000000000001', tests.id('tenant_a'), now() - interval '1 hour', now() + interval '5 hours', 'open', tests.id('a_hr'));
insert into public.shift_offers (tenant_id, shift_id, employee_id)
values (tests.id('tenant_a'), '5f000000-0000-4000-8000-000000000001', tests.id('a_emp4'));

insert into tests.results (line) select unnest(array[
  is(tests.exec_as(tests.id('a_emp4'), 'aal1', 'select claim_open_shift(''5f000000-0000-4000-8000-000000000001'')'), 'error:22023',
    'An open shift that has already started cannot be accepted'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', format('update shifts set employee_id = %L', tests.id('a_emp1'))), 'error:42501',
    'Nobody can change the rota directly, only through the portal''s rules'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', format('insert into shift_offers (tenant_id, shift_id, employee_id) values (%L, %L, %L)',
      tests.id('tenant_a'), '5f000000-0000-4000-8000-000000000001', tests.id('a_emp1'))), 'error:42501',
    '…not even HR can add themselves an offer by hand')
]);

-- ---------------------------------------------------------------- who sees what; cancelling
insert into tests.results (line) select unnest(array[
  is(tests.count_as(tests.id('a_emp4'), 'aal1', format('select 1 from shifts where employee_id = %L', tests.id('a_emp1'))), 0::bigint,
    'Employees cannot see a colleague''s shifts'),
  is(tests.count_as(tests.id('a_mgr'), 'aal1', format('select 1 from shifts where employee_id = %L', tests.id('a_emp4'))), 0::bigint,
    'A manager cannot see shifts of people outside their team'),
  ok(tests.count_as(tests.id('a_mgr'), 'aal1', format('select 1 from shifts where employee_id = %L', tests.id('a_emp1'))) >= 1,
    '…but can see their own team''s'),
  is(tests.count_as(tests.id('b_admin'), 'aal2', 'select 1 from shifts'), 0::bigint,
    'Another company cannot see our rota'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1', format('select cancel_shift(%L)', pg_temp.shift_at('2027-03-10', '20:00'))), 'error:42501',
    'An employee cannot cancel a shift'),
  is(tests.exec_as(tests.id('a_hr'), 'aal2', format('select cancel_shift(%L)', pg_temp.shift_at('2027-03-10', '20:00'))), 'rows:1',
    'HR can cancel it')
]);
insert into tests.results (line) select unnest(array[
  is((select count(*) from public.email_outbox where template = 'shift_cancelled' and user_id = tests.id('a_emp1')), 1::bigint,
    'The person whose shift it was is emailed'),
  ok((select count(*) from public.audit_log where entity = 'shifts') >= 5,
    'Every shift change is in the audit log')
]);

-- ---------------------------------------------------------------- GDPR
update public.employees set anonymised_at = now() where id = tests.id('a_emp4');
insert into tests.results (line) select unnest(array[
  ok(tests.value_as(tests.id('a_hr'), 'aal2', format('select jsonb_array_length(shifts_sar_data(%L) -> %L)', tests.id('a_emp2'), 'shifts'))::int >= 1,
    'A subject access export includes the person''s shifts'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1', format('select shifts_sar_data(%L)::text', tests.id('a_emp2'))), 'error:42501',
    'Only HR can run that export'),
  is((select count(*) from public.shift_group_members where employee_id = tests.id('a_emp4')), 0::bigint,
    'Anonymising someone removes them from open shift groups')
]);

insert into tests.results (line) select * from finish();
select line from tests.results order by n;
rollback;
