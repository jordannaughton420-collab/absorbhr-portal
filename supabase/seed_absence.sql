-- =============================================================================
-- FAKE DEMO DATA ONLY — holiday and sickness for the demo companies (Phase 2).
-- Safe to re-run: it replaces only demo absence data and leaves accounts alone.
-- Brightwater Bakery: holiday rules confirmed. Northgate Logistics: left unconfirmed
-- on purpose, to show that holiday can't be booked until a company sets its rules.
-- =============================================================================
do $$
declare
  v_bw uuid := (select id from public.tenants where name = 'Brightwater Bakery Ltd');
  v_ng uuid := (select id from public.tenants where name = 'Northgate Logistics Ltd');
  v_hr_user uuid := (select m.user_id from public.memberships m join auth.users u on u.id = m.user_id
                     where u.email = 'brightwater.hr@example.com');
  v_holiday uuid;
  v_medical uuid;
  v_mgr uuid := (select id from public.employees where work_email = 'brightwater.manager@example.com');
  v_jamie uuid := (select id from public.employees where work_email = 'brightwater.employee@example.com');
  r record;
  i int := 0;
  v_abs uuid;

begin
  if v_bw is null then
    raise exception 'Run the main seed first (Brightwater Bakery Ltd not found)';
  end if;
  select id into v_holiday from public.leave_types where tenant_id = v_bw and code = 'holiday';
  select id into v_medical from public.leave_types where tenant_id = v_bw and code = 'medical_appointment';

  delete from public.leave_requests where tenant_id in (v_bw, v_ng);
  delete from public.leave_adjustments where tenant_id in (v_bw, v_ng);
  delete from public.sickness_absences where tenant_id in (v_bw, v_ng);

  update public.holiday_policies
    set full_time_entitlement_days = 28, bank_holidays_in_allowance = true,
        carry_over_max_days = 5, carry_over_expiry_months = 3, configured_at = now()
    where tenant_id = v_bw;
  update public.holiday_policies set configured_at = null, carry_over_max_days = null where tenant_id = v_ng;

  -- Part-timers work Mon–Wed.
  update public.employees set working_days = '{1,2,3}' where tenant_id in (v_bw, v_ng) and days_per_week = 3;

  -- ---------------------------------------------------------------- holiday
  for r in select e.id, e.user_id, e.manager_id from public.employees e
           where e.tenant_id = v_bw and e.status = 'active' order by e.last_name, e.first_name loop
    i := i + 1;
    -- A week in the summer (approved, taken).
    insert into public.leave_requests (tenant_id, employee_id, leave_type_id, start_date, end_date, days,
      leave_year_start, status, requested_by, decided_by, decided_at)
    select v_bw, r.id, v_holiday, s, s + 4, app.count_working_days(r.id, s, s + 4), '2026-01-01', 'approved',
      coalesce(r.user_id, v_hr_user), v_hr_user, s - 30
    from (select date '2026-06-29' + ((i % 9) * 7) as s) x
    where app.count_working_days(r.id, s, s + 4) > 0;

    -- Christmas week for every third person (approved, future).
    if i % 3 = 0 then
      insert into public.leave_requests (tenant_id, employee_id, leave_type_id, start_date, end_date, days,
        leave_year_start, status, requested_by, decided_by, decided_at)
      select v_bw, r.id, v_holiday, '2026-12-21', '2026-12-24', app.count_working_days(r.id, '2026-12-21', '2026-12-24'),
        '2026-01-01', 'approved', coalesce(r.user_id, v_hr_user), v_hr_user, now() - interval '5 days'
      where app.count_working_days(r.id, '2026-12-21', '2026-12-24') > 0;
    end if;

    -- A few of Morgan's team are waiting for approval in November.
    if r.manager_id = v_mgr and i % 4 = 1 then
      insert into public.leave_requests (tenant_id, employee_id, leave_type_id, start_date, end_date, days,
        leave_year_start, status, requested_by, employee_note)
      select v_bw, r.id, v_holiday, s, s + 1, app.count_working_days(r.id, s, s + 1), '2026-01-01', 'pending',
        coalesce(r.user_id, v_hr_user), 'Long weekend away'
      from (select date '2026-11-09' + (i % 3) * 7 as s) x
      where app.count_working_days(r.id, s, s + 1) > 0;
    end if;
  end loop;

  -- The demo employee: one pending request and a medical appointment.
  insert into public.leave_requests (tenant_id, employee_id, leave_type_id, start_date, end_date, days,
    leave_year_start, status, requested_by, employee_note)
  values (v_bw, v_jamie, v_holiday, '2026-11-16', '2026-11-20', app.count_working_days(v_jamie, '2026-11-16', '2026-11-20'),
    '2026-01-01', 'pending', (select user_id from public.employees where id = v_jamie), 'Family visit');
  insert into public.leave_requests (tenant_id, employee_id, leave_type_id, start_date, end_date, half_day_end, days,
    leave_year_start, status, requested_by, decided_by, decided_at)
  values (v_bw, v_jamie, v_medical, '2026-10-29', '2026-10-29', true, 0.5, '2026-01-01', 'approved',
    (select user_id from public.employees where id = v_jamie), v_hr_user, now() - interval '2 days');

  -- Someone has TOIL added by HR.
  insert into public.leave_adjustments (tenant_id, employee_id, leave_year_start, days, reason, created_by)
  values (v_bw, v_jamie, '2026-01-01', 1, 'TOIL for working the summer fete (Saturday)', v_hr_user);

  -- ---------------------------------------------------------------- sickness
  -- Jamie: two short spells (Bradford 2² × 3 = 12), the second with a return-to-work form.
  insert into public.sickness_absences (tenant_id, employee_id, start_date, end_date, reported_by)
  values (v_bw, v_jamie, '2026-09-08', '2026-09-08', v_hr_user) returning id into v_abs;
  insert into public.sickness_details (absence_id, tenant_id, employee_id, payload)
  values (v_abs, v_bw, v_jamie, app.encrypt_json('{"reason_category":"cold_flu","notes":"Heavy cold"}'));

  insert into public.sickness_absences (tenant_id, employee_id, start_date, end_date, reported_by)
  values (v_bw, v_jamie, '2026-10-13', '2026-10-14', v_hr_user) returning id into v_abs;
  insert into public.sickness_details (absence_id, tenant_id, employee_id, payload)
  values (v_abs, v_bw, v_jamie, app.encrypt_json('{"reason_category":"stomach"}'));
  insert into public.return_to_work_forms (absence_id, tenant_id, employee_id, meeting_date, completed_by, payload)
  values (v_abs, v_bw, v_jamie, '2026-10-15', (select user_id from public.employees where id = v_mgr),
    app.encrypt_json('{"fit_to_return":"yes","gp_seen":"no","fit_note_received":"not_needed","notes":"Feeling much better. No adjustments needed."}'));

  -- Others in Brightwater: a mix of short spells, one longer one and one person off today.
  i := 0;
  for r in select e.id from public.employees e
           where e.tenant_id = v_bw and e.status = 'active' and e.id not in (v_jamie, v_mgr)
           order by e.first_name limit 6 loop
    i := i + 1;
    insert into public.sickness_absences (tenant_id, employee_id, start_date, end_date, reported_by)
    values (v_bw, r.id,
      case i when 1 then date '2026-10-22' when 2 then date '2026-08-11' when 3 then date '2026-05-05'
             when 4 then date '2026-02-03' when 5 then date '2026-09-21' else date '2026-07-14' end,
      case i when 1 then null when 2 then date '2026-08-21' when 3 then date '2026-05-06'
             when 4 then date '2026-02-03' when 5 then date '2026-09-23' else date '2026-07-14' end,
      v_hr_user)
    returning id into v_abs;
    insert into public.sickness_details (absence_id, tenant_id, employee_id, payload)
    values (v_abs, v_bw, r.id, app.encrypt_json(jsonb_build_object('reason_category',
      (array['cold_flu','musculoskeletal','headache_migraine','stomach','mental_health','injury'])[i])));
  end loop;
end $$;
