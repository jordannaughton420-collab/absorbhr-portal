-- =============================================================================
-- AbsorbHR Portal — Phase 2, part 2: sickness absence, return-to-work,
-- Bradford Factor and the team absence calendar.
--
-- Sickness records are health data (special category, Art. 9 UK GDPR):
--   * Dates of sickness: HR (own company, MFA), the employee, their DIRECT line manager.
--     AbsorbHR support sessions are deliberately excluded.
--   * Reasons and return-to-work notes: encrypted; same people, decided by AbsorbHR
--     on 26 Oct 2026 ("HR plus line manager for return-to-work"). Every read is audited.
--   * HR can exclude a spell from Bradford Factor triggers (e.g. pregnancy-related or
--     disability-related absence, where counting it could be unlawful discrimination).
-- =============================================================================

create function app.sickness_access(p_employee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    app.is_self(p_employee)
    or app.is_manager_of(p_employee)
    or exists (select 1 from public.employees e
               where e.id = p_employee and e.tenant_id = app.current_tenant_id() and app.is_hr()),
    false)
$$;

create table public.sickness_absences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  employee_id uuid not null,
  start_date date not null,
  end_date date,                                  -- null while still off
  half_day_start boolean not null default false,
  half_day_end boolean not null default false,
  exclude_from_triggers boolean not null default false,
  exclusion_basis text check (exclusion_basis in ('pregnancy', 'disability', 'other')),
  reported_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (end_date is null or end_date >= start_date),
  check (exclude_from_triggers = (exclusion_basis is not null)),
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
create index sickness_employee_idx on public.sickness_absences (employee_id, start_date desc);
create index sickness_tenant_dates_idx on public.sickness_absences (tenant_id, start_date);

create table public.sickness_details (
  absence_id uuid primary key references public.sickness_absences (id) on delete cascade,
  tenant_id uuid not null,
  employee_id uuid not null,
  payload bytea not null,                         -- encrypted {reason_category, notes, fit_note}
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.return_to_work_forms (
  absence_id uuid primary key references public.sickness_absences (id) on delete cascade,
  tenant_id uuid not null,
  employee_id uuid not null,
  meeting_date date not null,
  completed_by uuid not null,
  payload bytea not null,                         -- encrypted {fit_to_return, adjustments, support, notes}
  employee_acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Working days lost (to today for an ongoing absence).
create function app.sickness_days(p_absence public.sickness_absences, p_as_of date default current_date)
returns numeric
language sql stable security definer set search_path = '' as $$
  select case when p_absence.start_date > p_as_of then 0 else
    app.count_working_days(p_absence.employee_id, p_absence.start_date,
      least(coalesce(p_absence.end_date, p_as_of), p_as_of),
      p_absence.half_day_start,
      p_absence.half_day_end and p_absence.end_date is not null and p_absence.end_date <= p_as_of)
  end
$$;

-- Bradford Factor = S² × D over the last 52 weeks (S = spells, D = working days lost),
-- ignoring spells HR has excluded from triggers.
create function app.bradford(p_employee uuid, p_as_of date default current_date)
returns table (spells integer, days numeric, score numeric)
language sql stable security definer set search_path = '' as $$
  select count(*)::int, coalesce(sum(app.sickness_days(s, p_as_of)), 0),
         (count(*) ^ 2) * coalesce(sum(app.sickness_days(s, p_as_of)), 0)
  from public.sickness_absences s
  where s.employee_id = p_employee and not s.exclude_from_triggers
    and s.start_date > p_as_of - 364 and s.start_date <= p_as_of
$$;

-- -----------------------------------------------------------------------------
-- Sickness RPCs
-- -----------------------------------------------------------------------------
create function public.record_sickness(
  p_employee uuid, p_start date, p_end date default null,
  p_half_start boolean default false, p_half_end boolean default false,
  p_reason_category text default null, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := (select tenant_id from public.employees where id = p_employee);
  v_id uuid;
begin
  if app.sickness_access(p_employee) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_end is not null and p_end < p_start or p_start > current_date + 1 then
    raise exception 'invalid dates' using errcode = '22023';
  end if;
  if exists (select 1 from public.sickness_absences
             where employee_id = p_employee
               and daterange(start_date, coalesce(end_date, 'infinity'::date), '[]')
                   && daterange(p_start, coalesce(p_end, 'infinity'::date), '[]')) then
    raise exception 'overlaps an existing sickness record' using errcode = '22023', hint = 'overlap';
  end if;
  insert into public.sickness_absences (tenant_id, employee_id, start_date, end_date, half_day_start, half_day_end, reported_by)
  values (v_tenant, p_employee, p_start, p_end, p_half_start, p_half_end, auth.uid())
  returning id into v_id;
  if p_reason_category is not null or nullif(trim(p_notes), '') is not null then
    insert into public.sickness_details (absence_id, tenant_id, employee_id, payload, updated_by)
    values (v_id, v_tenant, p_employee,
      app.encrypt_json(jsonb_strip_nulls(jsonb_build_object('reason_category', p_reason_category,
        'notes', nullif(left(trim(p_notes), 2000), '')))), auth.uid());
  end if;
  return v_id;
end $$;

-- Close an ongoing absence (the person is back) or correct the end date.
create function public.end_sickness(p_absence uuid, p_end date, p_half_end boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_abs public.sickness_absences;
begin
  select * into v_abs from public.sickness_absences where id = p_absence for update;
  if v_abs is null or app.sickness_access(v_abs.employee_id) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_end < v_abs.start_date then
    raise exception 'invalid dates' using errcode = '22023';
  end if;
  update public.sickness_absences set end_date = p_end, half_day_end = p_half_end where id = p_absence;
end $$;

-- Pregnancy/disability-related absence can be excluded from triggers. HR only.
create function public.set_sickness_exclusion(p_absence uuid, p_basis text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_abs public.sickness_absences;
begin
  select * into v_abs from public.sickness_absences where id = p_absence;
  if v_abs is null or not (v_abs.tenant_id = app.current_tenant_id() and app.is_hr()) or app.is_self(v_abs.employee_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_basis is not null and p_basis not in ('pregnancy', 'disability', 'other') then
    raise exception 'invalid basis' using errcode = '22023';
  end if;
  update public.sickness_absences
    set exclude_from_triggers = p_basis is not null, exclusion_basis = p_basis
    where id = p_absence;
end $$;

create function public.get_sickness_details(p_absence uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_abs public.sickness_absences;
  v_details public.sickness_details;
  v_rtw public.return_to_work_forms;
begin
  select * into v_abs from public.sickness_absences where id = p_absence;
  if v_abs is null or app.sickness_access(v_abs.employee_id) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_details from public.sickness_details where absence_id = p_absence;
  select * into v_rtw from public.return_to_work_forms where absence_id = p_absence;
  perform app.write_audit(v_abs.tenant_id, 'view', 'sickness_details', p_absence, v_abs.employee_id);
  return jsonb_build_object(
    'details', case when v_details is null then null else app.decrypt_json(v_details.payload) end,
    'rtw', case when v_rtw is null then null else
      app.decrypt_json(v_rtw.payload) || jsonb_build_object(
        'meeting_date', v_rtw.meeting_date, 'completed_by', v_rtw.completed_by,
        'employee_acknowledged_at', v_rtw.employee_acknowledged_at) end
  );
end $$;

create function public.update_sickness_reason(p_absence uuid, p_reason_category text, p_notes text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_abs public.sickness_absences;
begin
  select * into v_abs from public.sickness_absences where id = p_absence;
  if v_abs is null or app.sickness_access(v_abs.employee_id) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.sickness_details (absence_id, tenant_id, employee_id, payload, updated_by)
  values (p_absence, v_abs.tenant_id, v_abs.employee_id,
    app.encrypt_json(jsonb_strip_nulls(jsonb_build_object('reason_category', p_reason_category,
      'notes', nullif(left(trim(p_notes), 2000), '')))), auth.uid())
  on conflict (absence_id) do update set payload = excluded.payload, updated_at = now(), updated_by = auth.uid();
end $$;

-- Return-to-work interview: completed by the line manager or HR (not the employee themself).
create function public.save_return_to_work(p_absence uuid, p_meeting_date date, p_form jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_abs public.sickness_absences;
  v_key text;
begin
  select * into v_abs from public.sickness_absences where id = p_absence;
  if v_abs is null or app.is_self(v_abs.employee_id) or app.sickness_access(v_abs.employee_id) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_form) is distinct from 'object' then
    raise exception 'invalid form' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_form) loop
    if v_key <> all (array['fit_to_return', 'gp_seen', 'fit_note_received', 'adjustments', 'support_offered', 'notes']) then
      raise exception 'invalid field' using errcode = '22023';
    end if;
  end loop;
  if pg_column_size(p_form) > 12000 then
    raise exception 'form too large' using errcode = '22023';
  end if;
  insert into public.return_to_work_forms (absence_id, tenant_id, employee_id, meeting_date, completed_by, payload, updated_by)
  values (p_absence, v_abs.tenant_id, v_abs.employee_id, p_meeting_date, auth.uid(), app.encrypt_json(p_form), auth.uid())
  on conflict (absence_id) do update
    set meeting_date = excluded.meeting_date, payload = excluded.payload, completed_by = auth.uid(),
        employee_acknowledged_at = null, updated_at = now(), updated_by = auth.uid();
end $$;

create function public.acknowledge_return_to_work(p_absence uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_abs public.sickness_absences;
begin
  select * into v_abs from public.sickness_absences where id = p_absence;
  if v_abs is null or not app.is_self(v_abs.employee_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.return_to_work_forms set employee_acknowledged_at = now() where absence_id = p_absence;
  perform app.write_audit(v_abs.tenant_id, 'acknowledge', 'return_to_work_forms', p_absence, v_abs.employee_id);
end $$;

-- Bradford Factor for everyone the caller may see (HR: company; manager: direct reports; self).
create function public.bradford_scores()
returns table (employee_id uuid, spells integer, days numeric, score numeric)
language sql stable security definer set search_path = '' as $$
  select e.id, b.spells, b.days, b.score
  from public.employees e
  cross join lateral app.bradford(e.id) b
  where e.tenant_id = app.current_tenant_id() and e.status <> 'leaver'
    and (app.is_hr() or app.is_manager_of(e.id) or app.is_self(e.id))
$$;

-- -----------------------------------------------------------------------------
-- Team absence calendar. What you see depends on who you are:
--   HR (MFA):          everyone, with leave type and sickness
--   Line manager:      direct reports with type and sickness; teammates as "away"
--   Employee:          own absences with type; teammates (same manager) as "away" only
--   AbsorbHR support:  leave with type; sickness shown only as "away"
-- Pending requests are visible only to people who can see the type.
-- -----------------------------------------------------------------------------
create function public.absence_calendar(p_from date, p_to date)
returns table (
  employee_id uuid, start_date date, end_date date, half_day_start boolean, half_day_end boolean,
  kind text, label text, status text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tenant uuid := coalesce(app.support_tenant_id(), app.current_tenant_id());
  v_support boolean := app.support_tenant_id() is not null;
  v_hr boolean := app.is_hr() and not v_support;
  v_me uuid := app.my_employee_id();
  v_my_manager uuid := (select manager_id from public.employees where id = app.my_employee_id());
begin
  if v_tenant is null or p_to < p_from or p_to - p_from > 92 then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  with people as (
    select e.id,
      (v_hr or v_support or e.id = v_me or app.is_manager_of(e.id)) as full_view,
      (v_hr or e.id = v_me or app.is_manager_of(e.id)) as health_view
    from public.employees e
    where e.tenant_id = v_tenant and e.status <> 'leaver'
      and (v_hr or v_support or e.id = v_me or app.is_manager_of(e.id)
           or (v_my_manager is not null and e.manager_id = v_my_manager))
  )
  select lr.employee_id, lr.start_date, lr.end_date, lr.half_day_start, lr.half_day_end,
    case when p.full_view then case when lt.deducts_allowance then 'holiday' else 'leave' end else 'away' end,
    case when p.full_view then lt.name else 'Away' end,
    lr.status
  from public.leave_requests lr
  join people p on p.id = lr.employee_id
  join public.leave_types lt on lt.id = lr.leave_type_id
  where lr.status in ('approved', 'pending') and (lr.status = 'approved' or p.full_view)
    and lr.start_date <= p_to and lr.end_date >= p_from
  union all
  select s.employee_id, s.start_date, coalesce(s.end_date, greatest(current_date, s.start_date)), s.half_day_start, s.half_day_end,
    case when p.health_view then 'sickness' else 'away' end,
    case when p.health_view then 'Sickness' else 'Away' end,
    case when s.end_date is null then 'ongoing' else 'recorded' end
  from public.sickness_absences s
  join people p on p.id = s.employee_id
  where s.start_date <= p_to and coalesce(s.end_date, current_date) >= p_from;
end $$;

-- -----------------------------------------------------------------------------
-- Triggers, RLS, privileges
-- -----------------------------------------------------------------------------
create trigger touch before update on public.sickness_absences for each row execute function app.touch_updated_at();
create trigger audit after insert or update or delete on public.sickness_absences for each row execute function app.audit_row('employee_id');
create trigger audit after insert or update or delete on public.sickness_details for each row execute function app.audit_row('employee_id');
create trigger audit after insert or update or delete on public.return_to_work_forms for each row execute function app.audit_row('employee_id');

alter table public.sickness_absences enable row level security;
alter table public.sickness_details enable row level security;
alter table public.return_to_work_forms enable row level security;

create policy sickness_select on public.sickness_absences for select to authenticated
  using (app.sickness_access(employee_id));
-- sickness_details and return_to_work_forms: no policies — encrypted, functions only.

revoke all on public.sickness_details, public.return_to_work_forms from anon, authenticated;
revoke insert, update, delete, truncate on public.sickness_absences from authenticated;
revoke all on all tables in schema public from anon;
revoke all on all functions in schema app from public, anon;
grant execute on function app.sickness_access to authenticated;

revoke execute on function public.record_sickness, public.end_sickness, public.set_sickness_exclusion,
  public.get_sickness_details, public.update_sickness_reason, public.save_return_to_work,
  public.acknowledge_return_to_work, public.bradford_scores, public.absence_calendar from public, anon;
grant execute on function public.record_sickness, public.end_sickness, public.set_sickness_exclusion,
  public.get_sickness_details, public.update_sickness_reason, public.save_return_to_work,
  public.acknowledge_return_to_work, public.bradford_scores, public.absence_calendar to authenticated;
