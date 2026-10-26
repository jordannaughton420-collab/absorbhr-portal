-- =============================================================================
-- DEMO CONTENT — Phase 4 people processes for Brightwater Bakery (all fake).
-- Checklists, a review cycle, 1-to-1 notes, one grievance case and a correction request.
-- Safe to re-run: replaces Brightwater's Phase 4 demo rows only.
-- =============================================================================
do $$
declare
  v_bw uuid := (select id from public.tenants where name = 'Brightwater Bakery Ltd');
  u_hr uuid := (select id from auth.users where email = 'brightwater.hr@example.com');
  u_mgr uuid := (select id from auth.users where email = 'brightwater.manager@example.com');
  e_mgr uuid;
  e_jamie uuid;
  e_new uuid;
  e_r2 uuid;
  e_r3 uuid;
  e_case uuid;
  v_tpl uuid;
  v_list uuid;
  v_cycle uuid;
  v_case uuid;
begin
  if v_bw is null then return; end if;
  delete from public.checklists where tenant_id = v_bw;
  delete from public.performance_reviews where tenant_id = v_bw;
  delete from public.review_cycles where tenant_id = v_bw;
  delete from public.one_to_one_notes where tenant_id = v_bw;
  delete from public.documents where tenant_id = v_bw and case_id is not null;
  delete from public.cases where tenant_id = v_bw;
  delete from public.rectification_requests where tenant_id = v_bw;

  select id into e_mgr from public.employees where user_id = u_mgr;
  select id into e_jamie from public.employees where tenant_id = v_bw
    and user_id = (select id from auth.users where email = 'brightwater.employee@example.com');
  -- Two other direct reports of the manager, and one person outside the team for the case.
  select id into e_r2 from public.employees where manager_id = e_mgr and id <> e_jamie and status = 'active' order by last_name limit 1;
  select id into e_r3 from public.employees where manager_id = e_mgr and id not in (e_jamie, e_r2) and status = 'active' order by last_name limit 1;
  select id into e_case from public.employees where tenant_id = v_bw and status = 'active' and user_id is null
    and (manager_id is distinct from e_mgr) order by last_name desc limit 1;
  -- Newest starter in the team gets an onboarding checklist.
  select id into e_new from public.employees where manager_id = e_mgr and id not in (e_jamie, e_r2, e_r3)
    order by start_date desc limit 1;

  -- ---------------------------------------------------------------- onboarding checklist
  select id into v_tpl from public.checklist_templates where tenant_id = v_bw and kind = 'onboarding' and active order by created_at limit 1;
  if v_tpl is not null and e_new is not null then
    insert into public.checklists (tenant_id, employee_id, template_id, kind, title, anchor_date, created_by)
    select v_bw, e_new, v_tpl, 'onboarding', name, current_date - 3, u_hr from public.checklist_templates where id = v_tpl
    returning id into v_list;
    insert into public.checklist_items (tenant_id, checklist_id, employee_id, title, description, assignee, due_date, position, completed_at, completed_by)
    select v_bw, v_list, e_new, i.title, i.description, i.assignee, current_date - 3 + i.due_offset_days, i.position,
      case when i.due_offset_days < -3 then now() - interval '5 days' end,
      case when i.due_offset_days < -3 then u_hr end
    from public.checklist_template_items i where i.template_id = v_tpl;
  end if;

  -- ---------------------------------------------------------------- review cycle
  insert into public.review_cycles (tenant_id, name, period_start, period_end, self_due, manager_due, created_by)
  values (v_bw, '2026 mid-year reviews', '2026-01-01', '2026-06-30', current_date + 14, current_date + 28, u_hr)
  returning id into v_cycle;
  insert into public.performance_reviews (tenant_id, employee_id, cycle_id, reviewer_id, title, status, created_by)
  values (v_bw, e_jamie, v_cycle, e_mgr, '2026 mid-year reviews', 'self_assessment', u_hr);
  if e_r2 is not null then
    insert into public.performance_reviews (tenant_id, employee_id, cycle_id, reviewer_id, title, status, self_assessment, self_submitted_at, created_by)
    values (v_bw, e_r2, v_cycle, e_mgr, '2026 mid-year reviews', 'manager_review',
      'I have trained two new starters on the bread line and covered early shifts during the summer. I would like to learn the pastry section next.',
      now() - interval '2 days', u_hr);
  end if;
  if e_r3 is not null then
    insert into public.performance_reviews (tenant_id, employee_id, cycle_id, reviewer_id, title, status, self_assessment, self_submitted_at,
      manager_assessment, objectives, manager_submitted_at, employee_signed_at, manager_signed_at, created_by)
    values (v_bw, e_r3, v_cycle, e_mgr, '2026 mid-year reviews', 'completed',
      'A steady six months. I hit my quality targets every month.', now() - interval '20 days',
      'Reliable and consistently accurate. A good example to the rest of the team.',
      '1. Complete Level 2 food hygiene refresher by September.' || chr(10) || '2. Shadow the shift lead twice a month.',
      now() - interval '15 days', now() - interval '10 days', now() - interval '10 days', u_hr);
  end if;

  -- ---------------------------------------------------------------- 1-to-1 notes
  insert into public.one_to_one_notes (tenant_id, employee_id, author_id, meeting_date, notes, actions, is_private) values
    (v_bw, e_jamie, u_mgr, current_date - 28, 'Talked about the new rota. Jamie is happy with early shifts and would like to try the croissant line.',
      'Morgan to ask the pastry lead about a training day.', false),
    (v_bw, e_jamie, u_mgr, current_date - 7, 'Training day booked for next month. Checked in on workload — all fine.', null, false),
    (v_bw, e_jamie, u_mgr, current_date - 7, 'Reminder for myself: consider Jamie for the shift lead vacancy in the new year.', null, true);

  -- ---------------------------------------------------------------- grievance case (HR only)
  if e_case is not null then
    insert into public.cases (tenant_id, employee_id, reference, case_type, status, opened_on, payload, created_by)
    values (v_bw, e_case, 'GRV-2026-001', 'grievance', 'investigation', current_date - 12,
      app.encrypt_json(jsonb_build_object('summary',
        'Written grievance about how overtime is shared out on the night shift. FAKE DEMO CASE.')), u_hr)
    returning id into v_case;
    insert into public.case_events (tenant_id, case_id, event_date, event_type, payload, created_by) values
      (v_bw, v_case, current_date - 12, 'note', app.encrypt_json('{"details":"Grievance letter received by email. Acknowledged the same day."}'), u_hr),
      (v_bw, v_case, current_date - 9, 'letter_sent', app.encrypt_json('{"details":"Invitation to a grievance meeting sent, with the right to be accompanied."}'), u_hr),
      (v_bw, v_case, current_date - 4, 'investigation_meeting', app.encrypt_json('{"details":"Meeting held. Employee attended with a colleague. Notes to follow."}'), u_hr);
  end if;

  -- ---------------------------------------------------------------- correction request
  insert into public.rectification_requests (tenant_id, employee_id, area, details) values
    (v_bw, e_jamie, 'employment', 'My continuous service date shows 2024 but I started as an agency worker in 2023 before being taken on. Could you check?');
end $$;
