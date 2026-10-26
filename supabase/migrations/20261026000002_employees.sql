-- =============================================================================
-- AbsorbHR Portal — Phase 1, part 2: employee records
--
-- Who can see what (enforced below by RLS):
--   employees               HR (all) · the employee (own) · line manager (direct reports)
--   employee_directory      everyone in the company — name, job title, department, work email, manager only
--   employee_personal       HR · the employee
--   emergency_contacts      HR · the employee · line manager (read only, for emergencies)
--   employment_history      HR · the employee (read only)
--   salary_history          HR · the employee only if the company setting allows it
--   right_to_work_checks    HR · the employee (read only)
-- "HR" = Client Admin or HR Manager with MFA, or AbsorbHR during a support session.
-- =============================================================================

create type public.contract_type as enum
  ('permanent', 'fixed_term', 'zero_hours', 'casual', 'apprentice', 'contractor');
create type public.employment_status as enum ('pre_start', 'active', 'leaver');

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default app.current_tenant_id() references public.tenants (id) on delete cascade,
  user_id uuid unique references auth.users (id) on delete set null,
  employee_number text check (length(employee_number) <= 30),                 -- optional
  first_name text not null check (length(trim(first_name)) between 1 and 100),
  last_name text not null check (length(trim(last_name)) between 1 and 100),
  preferred_name text check (length(preferred_name) <= 100),                   -- optional
  work_email text check (work_email = lower(work_email) and length(work_email) <= 254),
  job_title text check (length(job_title) <= 150),
  department_id uuid,
  location_id uuid,
  manager_id uuid,
  start_date date not null,
  continuous_service_date date,                                                -- optional
  probation_end_date date,                                                     -- optional
  contract_type public.contract_type not null default 'permanent',
  fixed_term_end_date date,                                                    -- fixed-term only
  weekly_hours numeric(5, 2) check (weekly_hours between 0 and 100),
  days_per_week numeric(3, 1) check (days_per_week between 0 and 7),
  status public.employment_status not null default 'active',
  end_date date,
  anonymised_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (tenant_id, id),
  unique (tenant_id, employee_number),
  unique (tenant_id, work_email),
  check (manager_id is distinct from id),
  check (end_date is null or end_date >= start_date),
  check (contract_type = 'fixed_term' or fixed_term_end_date is null),
  -- Composite keys guarantee departments/locations/managers belong to the same company.
  foreign key (tenant_id, department_id) references public.departments (tenant_id, id) on delete set null (department_id),
  foreign key (tenant_id, location_id) references public.locations (tenant_id, id) on delete set null (location_id),
  foreign key (tenant_id, manager_id) references public.employees (tenant_id, id) on delete set null (manager_id)
);
create index employees_tenant_idx on public.employees (tenant_id, last_name);
create index employees_manager_idx on public.employees (manager_id);
comment on column public.employees.anonymised_at is 'Set when the record has been anonymised under the retention schedule.';

-- Integrity: no management loops; a linked login must belong to the same company.
create function app.employees_validate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.manager_id is not null and exists (
    with recursive chain(id) as (
      select new.manager_id
      union
      select e.manager_id from public.employees e join chain c on e.id = c.id where e.manager_id is not null
    )
    select 1 from chain where id = new.id
  ) then
    raise exception 'manager assignment would create a loop' using errcode = '23514';
  end if;

  if new.user_id is not null and not exists (
    select 1 from public.memberships m where m.user_id = new.user_id and m.tenant_id = new.tenant_id
  ) then
    raise exception 'linked login does not belong to this company' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger validate before insert or update on public.employees
  for each row execute function app.employees_validate();

-- -----------------------------------------------------------------------------
-- Helpers that depend on employees
-- -----------------------------------------------------------------------------
create function app.my_employee_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select e.id from public.employees e
  where e.user_id = auth.uid() and e.tenant_id = app.current_tenant_id()
$$;

-- True when the caller is the DIRECT line manager of the employee.
create function app.is_manager_of(p_employee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.current_app_role() in ('line_manager', 'hr_manager', 'client_admin'), false)
    and exists (
      select 1 from public.employees e
      where e.id = p_employee
        and e.tenant_id = app.current_tenant_id()
        and e.manager_id = app.my_employee_id()
    )
$$;

create function app.is_self(p_employee uuid) returns boolean
language sql stable set search_path = '' as $$
  select p_employee is not null and p_employee = app.my_employee_id()
$$;

create function app.own_salary_visible() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.employees_can_view_own_salary from public.tenant_settings s
                   where s.tenant_id = app.current_tenant_id()), false)
$$;

-- -----------------------------------------------------------------------------
-- Personal details (home contact info). Every field optional.
-- -----------------------------------------------------------------------------
create table public.employee_personal (
  employee_id uuid primary key,
  tenant_id uuid not null default app.current_tenant_id(),
  personal_email text check (length(personal_email) <= 254),
  personal_phone text check (length(personal_phone) <= 30),
  address_line1 text check (length(address_line1) <= 200),
  address_line2 text check (length(address_line2) <= 200),
  town text check (length(town) <= 100),
  postcode text check (length(postcode) <= 10),
  date_of_birth date check (date_of_birth > '1900-01-01'),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
comment on column public.employee_personal.date_of_birth is 'Optional. Purpose: age-related statutory rights (e.g. NMW rates, young worker rules).';

create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default app.current_tenant_id(),
  employee_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 150),
  relationship text check (length(relationship) <= 60),
  phone text not null check (length(phone) between 5 and 30),
  alt_phone text check (length(alt_phone) <= 30),                              -- optional
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
create index emergency_contacts_employee_idx on public.emergency_contacts (employee_id);

create table public.employment_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default app.current_tenant_id(),
  employee_id uuid not null,
  effective_date date not null,
  job_title text check (length(job_title) <= 150),
  department_id uuid,
  manager_id uuid,
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade,
  foreign key (tenant_id, department_id) references public.departments (tenant_id, id) on delete set null (department_id),
  foreign key (tenant_id, manager_id) references public.employees (tenant_id, id) on delete set null (manager_id)
);
create index employment_history_employee_idx on public.employment_history (employee_id, effective_date desc);

create table public.salary_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default app.current_tenant_id(),
  employee_id uuid not null,
  effective_date date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency char(3) not null default 'GBP',
  pay_basis text not null default 'annual' check (pay_basis in ('annual', 'hourly')),
  reason text check (length(reason) <= 300),                                   -- optional
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
create index salary_history_employee_idx on public.salary_history (employee_id, effective_date desc);

create table public.right_to_work_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default app.current_tenant_id(),
  employee_id uuid not null,
  check_type text not null check (check_type in ('manual_document', 'online_share_code', 'idsp')),
  checked_on date not null,
  checked_by uuid default auth.uid(),
  status text not null check (status in ('verified', 'time_limited', 'pending', 'failed')),
  expiry_date date,          -- null = no expiry (e.g. British/Irish citizen); required when time-limited
  follow_up_date date,       -- when a repeat check is due
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (status <> 'time_limited' or expiry_date is not null),
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
create index rtw_employee_idx on public.right_to_work_checks (employee_id, checked_on desc);
create index rtw_expiry_idx on public.right_to_work_checks (tenant_id, expiry_date) where expiry_date is not null;

-- -----------------------------------------------------------------------------
-- Company directory (org chart). Minimal fields, visible to all members.
-- Runs with owner rights but filters to the caller's company itself.
-- -----------------------------------------------------------------------------
create view public.employee_directory with (security_invoker = false) as
  select e.id, e.tenant_id, e.first_name, e.last_name, e.preferred_name, e.job_title,
         e.work_email, e.department_id, d.name as department_name, e.location_id,
         l.name as location_name, e.manager_id
  from public.employees e
  left join public.departments d on d.id = e.department_id
  left join public.locations l on l.id = e.location_id
  where e.status <> 'leaver'
    and e.anonymised_at is null
    and app.member_of(e.tenant_id);
revoke all on public.employee_directory from anon;
grant select on public.employee_directory to authenticated;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
create trigger touch before update on public.employees for each row execute function app.touch_updated_at();
create trigger touch before update on public.employee_personal for each row execute function app.touch_updated_at();
create trigger touch before update on public.emergency_contacts for each row execute function app.touch_updated_at();
create trigger touch before update on public.employment_history for each row execute function app.touch_updated_at();
create trigger touch before update on public.salary_history for each row execute function app.touch_updated_at();
create trigger touch before update on public.right_to_work_checks for each row execute function app.touch_updated_at();

create trigger audit after insert or update or delete on public.employees
  for each row execute function app.audit_row('id');
create trigger audit after insert or update or delete on public.employee_personal
  for each row execute function app.audit_row('employee_id');
create trigger audit after insert or update or delete on public.emergency_contacts
  for each row execute function app.audit_row('employee_id');
create trigger audit after insert or update or delete on public.employment_history
  for each row execute function app.audit_row('employee_id');
create trigger audit after insert or update or delete on public.salary_history
  for each row execute function app.audit_row('employee_id');
create trigger audit after insert or update or delete on public.right_to_work_checks
  for each row execute function app.audit_row('employee_id');

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.employees enable row level security;
alter table public.employee_personal enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.employment_history enable row level security;
alter table public.salary_history enable row level security;
alter table public.right_to_work_checks enable row level security;

-- employees: no DELETE policy — removal goes through the erasure/anonymisation process (Phase 5).
create policy employees_select on public.employees for select to authenticated
  using (app.hr_access(tenant_id) or app.is_self(id) or app.is_manager_of(id));
create policy employees_insert on public.employees for insert to authenticated
  with check (app.hr_access(tenant_id));
create policy employees_update on public.employees for update to authenticated
  using (app.hr_access(tenant_id)) with check (app.hr_access(tenant_id));

create policy employee_personal_rw on public.employee_personal for all to authenticated
  using (app.hr_access(tenant_id) or app.is_self(employee_id))
  with check (app.hr_access(tenant_id) or (app.is_self(employee_id) and tenant_id = app.current_tenant_id()));

create policy emergency_contacts_select on public.emergency_contacts for select to authenticated
  using (app.hr_access(tenant_id) or app.is_self(employee_id) or app.is_manager_of(employee_id));
create policy emergency_contacts_write on public.emergency_contacts for all to authenticated
  using (app.hr_access(tenant_id) or app.is_self(employee_id))
  with check (app.hr_access(tenant_id) or (app.is_self(employee_id) and tenant_id = app.current_tenant_id()));

create policy employment_history_select on public.employment_history for select to authenticated
  using (app.hr_access(tenant_id) or app.is_self(employee_id));
create policy employment_history_write on public.employment_history for all to authenticated
  using (app.hr_access(tenant_id)) with check (app.hr_access(tenant_id));

create policy salary_history_select on public.salary_history for select to authenticated
  using (app.hr_access(tenant_id) or (app.is_self(employee_id) and app.own_salary_visible()));
create policy salary_history_write on public.salary_history for all to authenticated
  using (app.hr_access(tenant_id)) with check (app.hr_access(tenant_id));

create policy rtw_select on public.right_to_work_checks for select to authenticated
  using (app.hr_access(tenant_id) or app.is_self(employee_id));
create policy rtw_write on public.right_to_work_checks for all to authenticated
  using (app.hr_access(tenant_id)) with check (app.hr_access(tenant_id));

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke delete on public.employees from authenticated;
revoke all on all functions in schema app from public, anon;
grant execute on function app.my_employee_id, app.is_manager_of, app.is_self, app.own_salary_visible
  to authenticated, service_role;
