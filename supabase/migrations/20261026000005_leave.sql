-- =============================================================================
-- AbsorbHR Portal — Phase 2, part 1: holiday & leave
--
-- Decisions (26 Oct 2026, AbsorbHR):
--   * Bank holidays are INCLUDED in the allowance by default (28 days for a
--     full-timer incl. bank holidays). Each company can switch to "on top".
--   * Carry-over has NO default: each company must set its rule before staff
--     can book holiday (holiday_policies.configured_at).
--   * Irregular-hours / part-year 12.07% accrual is deferred; HR uses manual
--     adjustments meanwhile.
--
-- All calculations live here in the database so they cannot be bypassed, and
-- every state change goes through a SECURITY DEFINER function that checks the
-- caller's permission. Clients cannot insert or update leave_requests directly.
-- =============================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- -----------------------------------------------------------------------------
-- Working pattern on the employee record: ISO weekdays worked (1 = Monday).
-- -----------------------------------------------------------------------------
alter table public.employees
  add column working_days smallint[] not null default '{1,2,3,4,5}'
    check (working_days <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(working_days) between 0 and 7);
comment on column public.employees.working_days is 'ISO weekdays normally worked (1=Mon..7=Sun). Used to count days of leave and sickness.';

-- -----------------------------------------------------------------------------
-- UK bank holidays (shared reference data, refreshed daily from GOV.UK)
-- -----------------------------------------------------------------------------
create table public.bank_holidays (
  region public.bank_holiday_region not null,
  date date not null,
  title text not null check (length(title) <= 200),
  primary key (region, date)
);
alter table public.bank_holidays enable row level security;
create policy bank_holidays_read on public.bank_holidays for select to authenticated using (true);
revoke insert, update, delete, truncate on public.bank_holidays from authenticated, anon;

-- Processes the newest successful GOV.UK response, then requests a fresh copy for next time.
-- (pg_net is asynchronous, so each run imports the data fetched by the previous run.)
create function app.refresh_bank_holidays() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_body jsonb;
  v_count integer := 0;
begin
  select content::jsonb into v_body
  from net._http_response
  where status_code = 200 and content like '{"england-and-wales"%'
  order by id desc limit 1;

  if v_body is not null then
    insert into public.bank_holidays (region, date, title)
    select r.key::public.bank_holiday_region, (e ->> 'date')::date, e ->> 'title'
    from jsonb_each(v_body) r, jsonb_array_elements(r.value -> 'events') e
    where r.key in ('england-and-wales', 'scotland', 'northern-ireland')
    on conflict (region, date) do update set title = excluded.title;
    get diagnostics v_count = row_count;
  end if;

  perform net.http_get('https://www.gov.uk/bank-holidays.json');
  return v_count;
end $$;
revoke all on function app.refresh_bank_holidays from public, anon, authenticated;

select app.refresh_bank_holidays();  -- imports the response already fetched during setup, if present
select cron.schedule('refresh-bank-holidays', '17 3 * * *', $$select app.refresh_bank_holidays()$$);

-- -----------------------------------------------------------------------------
-- Leave types and holiday policy
-- -----------------------------------------------------------------------------
create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default app.current_tenant_id() references public.tenants (id) on delete cascade,
  code text not null check (code ~ '^[a-z_]{2,40}$'),
  name text not null check (length(trim(name)) between 1 and 80),
  deducts_allowance boolean not null default false,
  requires_approval boolean not null default true,
  is_paid boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (tenant_id, code),
  unique (tenant_id, id)
);

create table public.holiday_policies (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  full_time_days_per_week numeric(3, 1) not null default 5 check (full_time_days_per_week between 1 and 7),
  full_time_entitlement_days numeric(4, 1) not null default 28 check (full_time_entitlement_days between 0 and 60),
  bank_holidays_in_allowance boolean not null default true,
  carry_over_max_days numeric(4, 1) check (carry_over_max_days between 0 and 60),   -- null = not yet chosen
  carry_over_expiry_months smallint check (carry_over_expiry_months between 1 and 12), -- null = never expires
  configured_at timestamptz,          -- null until a Client Admin has confirmed the rules
  configured_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
comment on column public.holiday_policies.configured_at is 'Holiday cannot be booked until a Client Admin has confirmed the holiday rules (including carry-over).';

-- Default leave types + policy for every company (existing and future).
create function app.seed_tenant_leave(p_tenant uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.leave_types (tenant_id, code, name, deducts_allowance, requires_approval, is_paid) values
    (p_tenant, 'holiday', 'Holiday', true, true, true),
    (p_tenant, 'unpaid', 'Unpaid leave', false, true, false),
    (p_tenant, 'compassionate', 'Compassionate leave', false, true, true),
    (p_tenant, 'medical_appointment', 'Medical appointment', false, true, true),
    (p_tenant, 'jury_service', 'Jury service', false, true, false),
    (p_tenant, 'family_leave', 'Maternity, paternity, adoption or shared parental leave', false, true, true),
    (p_tenant, 'toil', 'Time off in lieu', false, true, true)
  on conflict do nothing;
  insert into public.holiday_policies (tenant_id) values (p_tenant) on conflict do nothing;
$$;

create function app.on_tenant_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.seed_tenant_leave(new.id);
  return null;
end $$;
create trigger seed_leave after insert on public.tenants for each row execute function app.on_tenant_created();
select app.seed_tenant_leave(id) from public.tenants;

-- Manual changes to someone's allowance (carry-over, TOIL, irregular hours, statutory carry-over after sickness, etc.)
create table public.leave_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default app.current_tenant_id(),
  employee_id uuid not null,
  leave_year_start date not null,
  kind text not null default 'manual' check (kind in ('manual', 'carry_over')),
  days numeric(5, 1) not null check (days between -100 and 100 and days <> 0),
  expires_on date,
  reason text not null check (length(trim(reason)) between 3 and 300),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
create unique index leave_adjustments_one_carry on public.leave_adjustments (employee_id, leave_year_start) where kind = 'carry_over';
create index leave_adjustments_employee_idx on public.leave_adjustments (employee_id, leave_year_start);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  employee_id uuid not null,
  leave_type_id uuid not null,
  start_date date not null,
  end_date date not null,
  half_day_start boolean not null default false,   -- first day starts after lunch
  half_day_end boolean not null default false,     -- last day ends at lunch
  days numeric(5, 1) not null check (days > 0),
  leave_year_start date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  employee_note text check (length(employee_note) <= 500),
  requested_by uuid not null,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text check (length(decision_note) <= 500),
  cancelled_by uuid,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (end_date >= start_date),
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade,
  foreign key (tenant_id, leave_type_id) references public.leave_types (tenant_id, id)
);
create index leave_requests_employee_idx on public.leave_requests (employee_id, start_date);
create index leave_requests_tenant_dates_idx on public.leave_requests (tenant_id, start_date, end_date) where status in ('pending', 'approved');

-- -----------------------------------------------------------------------------
-- Calculation helpers
-- -----------------------------------------------------------------------------
create function app.leave_year_start(p_tenant uuid, p_on date) returns date
language sql stable security definer set search_path = '' as $$
  select case
    when make_date(extract(year from p_on)::int, s.leave_year_start_month, s.leave_year_start_day) <= p_on
      then make_date(extract(year from p_on)::int, s.leave_year_start_month, s.leave_year_start_day)
    else make_date(extract(year from p_on)::int - 1, s.leave_year_start_month, s.leave_year_start_day)
  end
  from public.tenant_settings s where s.tenant_id = p_tenant
$$;

create function app.employee_region(p_employee uuid) returns public.bank_holiday_region
language sql stable security definer set search_path = '' as $$
  select coalesce(l.bank_holiday_region, t.bank_holiday_region)
  from public.employees e
  join public.tenants t on t.id = e.tenant_id
  left join public.locations l on l.id = e.location_id
  where e.id = p_employee
$$;

-- Working days between two dates for this person: their working weekdays, excluding bank holidays.
create function app.count_working_days(
  p_employee uuid, p_start date, p_end date, p_half_start boolean default false, p_half_end boolean default false
) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(
    case when (d.day = p_start and p_half_start) or (d.day = p_end and p_half_end) then 0.5 else 1 end
  ), 0)
  from public.employees e
  cross join lateral (
    select gs::date as day from generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') as gs
  ) as d
  where e.id = p_employee
    and extract(isodow from d.day)::smallint = any (e.working_days)
    and not exists (
      select 1 from public.bank_holidays b where b.region = app.employee_region(p_employee) and b.date = d.day
    )
$$;

-- Bank holidays that fall on this person's working days while employed in the given leave year.
create function app.bank_holidays_on_working_days(p_employee uuid, p_year_start date) returns numeric
language sql stable security definer set search_path = '' as $$
  select count(*)::numeric
  from public.employees e
  join public.bank_holidays b on b.region = app.employee_region(e.id)
  where e.id = p_employee
    and b.date between greatest(p_year_start, e.start_date)
                   and least((p_year_start + interval '1 year' - interval '1 day')::date, coalesce(e.end_date, 'infinity'::date))
    and extract(isodow from b.date)::smallint = any (e.working_days)
$$;

-- Annual entitlement in days for one leave year, before bank-holiday deduction:
--   company full-time allowance × (days worked per week ÷ full-time days), pro-rated for
--   part of the year employed, never below the statutory 5.6 weeks (capped at 28 days),
--   rounded UP to the nearest half day.
create function app.holiday_entitlement(p_employee uuid, p_year_start date) returns numeric
language sql stable security definer set search_path = '' as $$
  with x as (
    select
      p.full_time_entitlement_days as ft_days,
      p.full_time_days_per_week as ft_week,
      p.bank_holidays_in_allowance as bh_in,
      coalesce(e.days_per_week, cardinality(e.working_days))::numeric as dpw,
      p_year_start as ys,
      (p_year_start + interval '1 year' - interval '1 day')::date as ye,
      e.start_date, e.end_date
    from public.employees e
    join public.holiday_policies p on p.tenant_id = e.tenant_id
    where e.id = p_employee
  ), f as (
    select x.*,
      greatest(0, least(x.ye, coalesce(x.end_date, x.ye)) - greatest(x.ys, x.start_date) + 1)::numeric
        / (x.ye - x.ys + 1) as year_fraction
    from x
  )
  select ceil(2 * greatest(
      f.ft_days * least(f.dpw / f.ft_week, 1),
      case when f.bh_in then least(5.6 * f.dpw, 28) else 0 end
    ) * f.year_fraction) / 2
  from f
$$;

-- Full balance for one person and leave year. Readable by the person, their direct manager and HR.
create function public.leave_balance(p_employee uuid, p_on date default current_date)
returns table (
  leave_year_start date, leave_year_end date, entitlement numeric, bank_holidays numeric,
  adjustments numeric, carried_over numeric, approved numeric, pending numeric, remaining numeric,
  policy_configured boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tenant uuid := (select tenant_id from public.employees where id = p_employee);
  v_ys date;
  v_bh_in boolean;
begin
  if not (app.is_self(p_employee) or app.is_manager_of(p_employee) or app.hr_access(v_tenant)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_ys := app.leave_year_start(v_tenant, p_on);
  select p.bank_holidays_in_allowance into v_bh_in from public.holiday_policies p where p.tenant_id = v_tenant;

  return query
  with r as (
    select
      coalesce(sum(lr.days) filter (where lr.status = 'approved'), 0) as approved,
      coalesce(sum(lr.days) filter (where lr.status = 'pending'), 0) as pending
    from public.leave_requests lr join public.leave_types lt on lt.id = lr.leave_type_id
    where lr.employee_id = p_employee and lr.leave_year_start = v_ys and lt.deducts_allowance
  ), a as (
    select
      coalesce(sum(la.days) filter (where la.kind = 'manual'), 0) as manual,
      -- Carried-over days that have expired only count to the extent they were used before expiry.
      coalesce(sum(
        case when la.kind <> 'carry_over' then 0
             when la.expires_on is null or la.expires_on >= current_date then la.days
             else least(la.days, (
               select coalesce(sum(lr.days), 0) from public.leave_requests lr
               join public.leave_types lt on lt.id = lr.leave_type_id
               where lr.employee_id = p_employee and lr.leave_year_start = v_ys and lt.deducts_allowance
                 and lr.status = 'approved' and lr.start_date <= la.expires_on))
        end), 0) as carried
    from public.leave_adjustments la where la.employee_id = p_employee and la.leave_year_start = v_ys
  ), b as (
    select app.holiday_entitlement(p_employee, v_ys) as ent,
           case when v_bh_in then app.bank_holidays_on_working_days(p_employee, v_ys) else 0 end as bh
  )
  select v_ys, (v_ys + interval '1 year' - interval '1 day')::date, b.ent, b.bh, a.manual, a.carried,
         r.approved, r.pending, b.ent - b.bh + a.manual + a.carried - r.approved,
         (select hp.configured_at is not null from public.holiday_policies hp where hp.tenant_id = v_tenant)
  from b, a, r;
end $$;

-- Preview: how many days would this request use? (Same calculation the request uses.)
create function public.count_leave_days(
  p_employee uuid, p_start date, p_end date, p_half_start boolean default false, p_half_end boolean default false
) returns numeric
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (app.is_self(p_employee) or app.is_manager_of(p_employee)
          or app.hr_access((select tenant_id from public.employees where id = p_employee))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_end < p_start or p_end - p_start > 366 then
    raise exception 'invalid dates' using errcode = '22023';
  end if;
  return app.count_working_days(p_employee, p_start, p_end, p_half_start, p_half_end);
end $$;

-- -----------------------------------------------------------------------------
-- Workflow: request, decide, cancel
-- -----------------------------------------------------------------------------
create function public.request_leave(
  p_employee uuid, p_leave_type uuid, p_start date, p_end date,
  p_half_start boolean default false, p_half_end boolean default false, p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_emp public.employees;
  v_type public.leave_types;
  v_days numeric;
  v_ys date;
  v_remaining numeric;
  v_pending numeric;
  v_id uuid;
begin
  select * into v_emp from public.employees where id = p_employee;
  if v_emp is null or not (app.is_self(p_employee) or app.hr_access(v_emp.tenant_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_emp.status = 'leaver' then
    raise exception 'leavers cannot book leave' using errcode = '22023';
  end if;
  select * into v_type from public.leave_types where id = p_leave_type and tenant_id = v_emp.tenant_id and active;
  if v_type is null then
    raise exception 'unknown leave type' using errcode = '22023';
  end if;
  if p_end < p_start or p_end - p_start > 366 or (p_start = p_end and p_half_start and p_half_end) then
    raise exception 'invalid dates' using errcode = '22023';
  end if;

  v_ys := app.leave_year_start(v_emp.tenant_id, p_start);
  if app.leave_year_start(v_emp.tenant_id, p_end) <> v_ys then
    raise exception 'requests cannot span two leave years — please split it' using errcode = '22023', hint = 'span_years';
  end if;
  if exists (
    select 1 from public.leave_requests
    where employee_id = p_employee and status in ('pending', 'approved')
      and daterange(start_date, end_date, '[]') && daterange(p_start, p_end, '[]')
  ) then
    raise exception 'overlaps an existing request' using errcode = '22023', hint = 'overlap';
  end if;

  v_days := app.count_working_days(p_employee, p_start, p_end, p_half_start, p_half_end);
  if v_days <= 0 then
    raise exception 'no working days in that period' using errcode = '22023', hint = 'no_days';
  end if;

  if v_type.deducts_allowance then
    if (select configured_at from public.holiday_policies where tenant_id = v_emp.tenant_id) is null then
      raise exception 'holiday rules not configured' using errcode = '22023', hint = 'not_configured';
    end if;
    select b.remaining, b.pending into v_remaining, v_pending from public.leave_balance(p_employee, p_start) b;
    if v_days > v_remaining - v_pending then
      raise exception 'not enough holiday left' using errcode = '22023', hint = 'insufficient';
    end if;
  end if;

  insert into public.leave_requests (tenant_id, employee_id, leave_type_id, start_date, end_date,
    half_day_start, half_day_end, days, leave_year_start, status, employee_note, requested_by,
    decided_by, decided_at)
  values (v_emp.tenant_id, p_employee, p_leave_type, p_start, p_end, p_half_start, p_half_end, v_days, v_ys,
    case when v_type.requires_approval then 'pending' else 'approved' end,
    nullif(trim(p_note), ''), auth.uid(),
    case when v_type.requires_approval then null else auth.uid() end,
    case when v_type.requires_approval then null else now() end)
  returning id into v_id;
  return v_id;
end $$;

-- Approve or decline. Allowed for the DIRECT line manager or HR — never for your own request.
create function public.decide_leave(p_request uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.leave_requests;
  v_deducts boolean;
  v_remaining numeric;
begin
  select * into v_req from public.leave_requests where id = p_request for update;
  if v_req is null or app.is_self(v_req.employee_id)
     or not (app.is_manager_of(v_req.employee_id) or app.hr_access(v_req.tenant_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'request is no longer pending' using errcode = '22023', hint = 'not_pending';
  end if;
  if p_approve then
    select deducts_allowance into v_deducts from public.leave_types where id = v_req.leave_type_id;
    if v_deducts then
      select b.remaining into v_remaining from public.leave_balance(v_req.employee_id, v_req.start_date) b;
      if v_req.days > v_remaining then
        raise exception 'not enough holiday left' using errcode = '22023', hint = 'insufficient';
      end if;
    end if;
  end if;
  update public.leave_requests
    set status = case when p_approve then 'approved' else 'declined' end,
        decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '')
    where id = p_request;
end $$;

-- Employees can cancel their own pending or future requests; managers/HR can cancel any.
create function public.cancel_leave(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.leave_requests;
begin
  select * into v_req from public.leave_requests where id = p_request for update;
  if v_req is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not (
    app.hr_access(v_req.tenant_id) or app.is_manager_of(v_req.employee_id)
    or (app.is_self(v_req.employee_id) and (v_req.status = 'pending' or v_req.start_date > current_date))
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_req.status not in ('pending', 'approved') then
    raise exception 'request cannot be cancelled' using errcode = '22023', hint = 'not_cancellable';
  end if;
  update public.leave_requests set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now()
    where id = p_request;
end $$;

-- Year-end: carry unused holiday into the next leave year under the company's rule. HR only.
create function public.process_carry_over(p_year_start date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_policy public.holiday_policies;
  v_next date := (p_year_start + interval '1 year')::date;
  v_count integer := 0;
  r record;
  v_unused numeric;
begin
  if not app.hr_access(v_tenant) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_policy from public.holiday_policies where tenant_id = v_tenant;
  if v_policy.configured_at is null or coalesce(v_policy.carry_over_max_days, 0) = 0 then
    return 0;
  end if;
  if app.leave_year_start(v_tenant, p_year_start) <> p_year_start then
    raise exception 'not a leave year start date' using errcode = '22023';
  end if;
  for r in select id from public.employees
           where tenant_id = v_tenant and status <> 'leaver' and start_date <= (v_next - 1)
  loop
    select b.remaining into v_unused from public.leave_balance(r.id, p_year_start) b;
    if v_unused > 0 then
      insert into public.leave_adjustments (tenant_id, employee_id, leave_year_start, kind, days, expires_on, reason)
      values (v_tenant, r.id, v_next, 'carry_over', least(v_unused, v_policy.carry_over_max_days),
        case when v_policy.carry_over_expiry_months is null then null
             else (v_next + make_interval(months => v_policy.carry_over_expiry_months) - interval '1 day')::date end,
        'Carried over from leave year starting ' || to_char(p_year_start, 'DD Mon YYYY'))
      on conflict (employee_id, leave_year_start) where kind = 'carry_over'
      do update set days = excluded.days, expires_on = excluded.expires_on, updated_at = now(), updated_by = auth.uid();
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

-- -----------------------------------------------------------------------------
-- Triggers, RLS, privileges
-- -----------------------------------------------------------------------------
create trigger touch before update on public.leave_types for each row execute function app.touch_updated_at();
create trigger touch before update on public.holiday_policies for each row execute function app.touch_updated_at();
create trigger touch before update on public.leave_adjustments for each row execute function app.touch_updated_at();
create trigger touch before update on public.leave_requests for each row execute function app.touch_updated_at();

create trigger audit after insert or update or delete on public.leave_types for each row execute function app.audit_row();
create trigger audit after insert or update or delete on public.holiday_policies for each row execute function app.audit_row();
create trigger audit after insert or update or delete on public.leave_adjustments for each row execute function app.audit_row('employee_id');
create trigger audit after insert or update or delete on public.leave_requests for each row execute function app.audit_row('employee_id');

alter table public.leave_types enable row level security;
alter table public.holiday_policies enable row level security;
alter table public.leave_adjustments enable row level security;
alter table public.leave_requests enable row level security;

create policy leave_types_select on public.leave_types for select to authenticated using (app.member_of(tenant_id));
create policy leave_types_write on public.leave_types for all to authenticated
  using (app.admin_access(tenant_id)) with check (app.admin_access(tenant_id));

create policy holiday_policies_select on public.holiday_policies for select to authenticated using (app.member_of(tenant_id));
create policy holiday_policies_update on public.holiday_policies for update to authenticated
  using (app.admin_access(tenant_id)) with check (app.admin_access(tenant_id));

create policy leave_adjustments_select on public.leave_adjustments for select to authenticated
  using (app.hr_access(tenant_id) or app.is_self(employee_id));
create policy leave_adjustments_write on public.leave_adjustments for all to authenticated
  using (app.hr_access(tenant_id)) with check (app.hr_access(tenant_id));

create policy leave_requests_select on public.leave_requests for select to authenticated
  using (app.hr_access(tenant_id) or app.is_self(employee_id) or app.is_manager_of(employee_id));

revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on public.leave_requests from authenticated;
revoke insert, delete on public.holiday_policies from authenticated;
revoke all on all functions in schema app from public, anon;
grant execute on function app.leave_year_start, app.employee_region to authenticated;

revoke execute on function public.leave_balance, public.count_leave_days, public.request_leave,
  public.decide_leave, public.cancel_leave, public.process_carry_over from public, anon;
grant execute on function public.leave_balance, public.count_leave_days, public.request_leave,
  public.decide_leave, public.cancel_leave, public.process_carry_over to authenticated;
