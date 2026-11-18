-- =============================================================================
-- 0016 · Shifts, rota and open shifts.
--
--   shifts               one shift for one person, or an open shift nobody has taken yet
--   shift_groups         named groups of people who pick up open shifts ("Open shifts", "Night cover")
--   shift_group_members  who is in each group
--   shift_offers         who an open shift was sent to, and what they said
--
-- Who can plan: HR (with two-step verification) for anyone in the company. Line managers only
-- when the company switches on "managers can plan shifts", and only for their own direct reports.
-- Groups are managed by HR.
--
-- Open shifts go only to people in the chosen group (or named people) who are free: not on
-- holiday, not off sick, no shift that overlaps, and an 11-hour rest break either side
-- (Working Time Regulations 1998). The first person to accept gets the shift; the shift row is
-- locked while it is claimed, so two people can never both get it.
-- Every change goes through the functions below; nobody can write to these tables directly.
-- =============================================================================

alter table public.tenant_settings
  add column managers_can_plan_shifts boolean not null default false;
comment on column public.tenant_settings.managers_can_plan_shifts is
  'When on, line managers can plan shifts and post open shifts for their own direct reports.';

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.shift_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index shift_groups_name_idx on public.shift_groups (tenant_id, lower(name));
comment on table public.shift_groups is 'Groups of people who can be offered open shifts. No personal data.';

create table public.shift_group_members (
  tenant_id uuid not null,
  group_id uuid not null references public.shift_groups (id) on delete cascade,
  employee_id uuid not null,
  added_by uuid,
  created_at timestamptz not null default now(),
  primary key (group_id, employee_id),
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
create index shift_group_members_employee_idx on public.shift_group_members (employee_id);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid,                                    -- null while the shift is open
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  role_label text check (length(trim(role_label)) between 1 and 80),
  location_id uuid references public.locations (id) on delete set null,
  notes text check (length(notes) <= 500),
  status text not null check (status in ('scheduled', 'open', 'cancelled')),
  group_id uuid references public.shift_groups (id) on delete set null,  -- the group an open shift was sent to
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  claimed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid,
  check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours'),
  check ((status = 'open' and employee_id is null)
      or (status = 'scheduled' and employee_id is not null)
      or status = 'cancelled'),
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
create index shifts_tenant_time_idx on public.shifts (tenant_id, starts_at);
create index shifts_employee_time_idx on public.shifts (employee_id, starts_at) where status <> 'cancelled';
comment on table public.shifts is 'Rota shifts. Open shifts have no employee until someone accepts.';

create table public.shift_offers (
  tenant_id uuid not null,
  shift_id uuid not null references public.shifts (id) on delete cascade,
  employee_id uuid not null,
  offered_at timestamptz not null default now(),
  response text check (response in ('accepted', 'declined')),
  responded_at timestamptz,
  primary key (shift_id, employee_id),
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
create index shift_offers_employee_idx on public.shift_offers (employee_id, offered_at desc);

create trigger touch before update on public.shift_groups for each row execute function app.touch_updated_at();
create trigger touch before update on public.shifts for each row execute function app.touch_updated_at();
create trigger audit after insert or update or delete on public.shift_groups for each row execute function app.audit_row();
create trigger audit after insert or update or delete on public.shift_group_members for each row execute function app.audit_row('employee_id');
create trigger audit after insert or update or delete on public.shifts for each row execute function app.audit_row('employee_id');

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
-- A date with UK start and end times. An end time at or before the start means the next day
-- (8pm to 5am). British Summer Time is handled by the Europe/London time zone.
create function app.shift_start(p_date date, p_start time) returns timestamptz
language sql immutable set search_path = '' as $$
  select (p_date + p_start) at time zone 'Europe/London'
$$;
create function app.shift_end(p_date date, p_start time, p_end time) returns timestamptz
language sql immutable set search_path = '' as $$
  select ((p_date + case when p_end <= p_start then 1 else 0 end) + p_end) at time zone 'Europe/London'
$$;

-- May the caller plan shifts in this company (for this person, when given)?
create function app.can_plan_shifts(p_tenant uuid, p_employee uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_tenant is not null and p_tenant = app.current_tenant_id() and (
    app.is_hr()
    or (app.current_app_role() = 'line_manager'
        and exists (select 1 from public.tenant_settings s where s.tenant_id = p_tenant and s.managers_can_plan_shifts)
        and (p_employee is null or app.is_manager_of(p_employee)))
  ), false)
$$;

-- Why a person can't work a shift (null when they can). Reads leave and sickness, so it is
-- only ever called from functions that have already checked the caller's permission.
create function app.shift_blocker(p_employee uuid, p_starts timestamptz, p_ends timestamptz, p_ignore uuid default null)
returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_emp public.employees;
  d1 date := (p_starts at time zone 'Europe/London')::date;
  d2 date := ((p_ends - interval '1 second') at time zone 'Europe/London')::date;
begin
  select * into v_emp from public.employees where id = p_employee;
  if v_emp.id is null or v_emp.status = 'leaver' or v_emp.anonymised_at is not null then
    return 'leaver';
  end if;
  if exists (select 1 from public.leave_requests l
             where l.employee_id = p_employee and l.status = 'approved'
               and l.start_date <= d2 and l.end_date >= d1) then
    return 'on_leave';
  end if;
  if exists (select 1 from public.sickness_absences s
             where s.employee_id = p_employee
               and s.start_date <= d2 and coalesce(s.end_date, 'infinity'::date) >= d1) then
    return 'off_sick';
  end if;
  if exists (select 1 from public.shifts s
             where s.employee_id = p_employee and s.status = 'scheduled' and s.id is distinct from p_ignore
               and s.starts_at < p_ends and s.ends_at > p_starts) then
    return 'overlap';
  end if;
  if exists (select 1 from public.shifts s
             where s.employee_id = p_employee and s.status = 'scheduled' and s.id is distinct from p_ignore
               and s.starts_at < p_ends + interval '11 hours' and s.ends_at > p_starts - interval '11 hours') then
    return 'rest_break';
  end if;
  return null;
end $$;

create function app.shift_offered_to_me(p_shift uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shift_offers o
                 where o.shift_id = p_shift and o.employee_id = app.my_employee_id())
$$;

create function app.shift_posted_by_me(p_shift uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shifts s
                 where s.id = p_shift and s.created_by = auth.uid() and s.tenant_id = app.current_tenant_id())
$$;

create function app.check_shift_location(p_tenant uuid, p_location uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_location is not null and not exists (
    select 1 from public.locations l where l.id = p_location and l.tenant_id = p_tenant) then
    raise exception 'unknown location' using errcode = '22023', hint = 'bad_location';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Planning shifts
-- -----------------------------------------------------------------------------
create function public.create_shift(
  p_employee uuid, p_date date, p_start time, p_end time,
  p_role text default null, p_location uuid default null, p_notes text default null,
  p_allow_short_rest boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := (select tenant_id from public.employees where id = p_employee);
  v_starts timestamptz := app.shift_start(p_date, p_start);
  v_ends timestamptz := app.shift_end(p_date, p_start, p_end);
  v_block text;
  v_id uuid;
begin
  if not app.can_plan_shifts(v_tenant, p_employee) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform app.check_shift_location(v_tenant, p_location);
  v_block := app.shift_blocker(p_employee, v_starts, v_ends);
  if v_block is not null and not (v_block = 'rest_break' and p_allow_short_rest) then
    raise exception 'person not free' using errcode = '22023', hint = v_block;
  end if;
  insert into public.shifts (tenant_id, employee_id, starts_at, ends_at, role_label, location_id, notes, status, created_by)
  values (v_tenant, p_employee, v_starts, v_ends, nullif(trim(p_role), ''), p_location, nullif(trim(p_notes), ''),
          'scheduled', auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Cancels a shift (open or taken) that hasn't started yet. Tells the person if it was theirs.
create function public.cancel_shift(p_shift uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.shifts;
begin
  select * into v from public.shifts where id = p_shift for update;
  -- A taken shift: whoever may plan that person's shifts. An open one: HR, or the person who posted it.
  if v.id is null or not (
       (v.employee_id is not null and app.can_plan_shifts(v.tenant_id, v.employee_id))
       or (v.employee_id is null and v.tenant_id = app.current_tenant_id() and app.is_hr())
       or (v.employee_id is null and v.created_by = auth.uid() and app.can_plan_shifts(v.tenant_id))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v.status = 'cancelled' then
    raise exception 'already cancelled' using errcode = '22023', hint = 'shift_cancelled';
  end if;
  if v.starts_at <= now() then
    raise exception 'already started' using errcode = '22023', hint = 'shift_closed';
  end if;
  update public.shifts set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
   where id = p_shift;
  if v.employee_id is not null then
    perform app.enqueue_email(v.tenant_id, app.user_of(v.employee_id), 'shift_cancelled', '/shifts',
                              'shift_cancelled:' || v.id);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Groups (HR)
-- -----------------------------------------------------------------------------
-- Adds a person to a group, creating the group if it doesn't exist yet. Returns the group id.
create function public.add_to_shift_group(p_employee uuid, p_group_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := (select tenant_id from public.employees where id = p_employee and status <> 'leaver');
  v_name text := nullif(trim(p_group_name), '');
  v_group uuid;
begin
  if v_tenant is null or v_tenant is distinct from app.current_tenant_id() or not app.is_hr() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_name is null or length(v_name) > 60 then
    raise exception 'bad group name' using errcode = '22023', hint = 'bad_group';
  end if;
  select id into v_group from public.shift_groups where tenant_id = v_tenant and lower(name) = lower(v_name);
  if v_group is null then
    insert into public.shift_groups (tenant_id, name) values (v_tenant, v_name) returning id into v_group;
  end if;
  insert into public.shift_group_members (tenant_id, group_id, employee_id, added_by)
  values (v_tenant, v_group, p_employee, auth.uid())
  on conflict do nothing;
  return v_group;
end $$;

create function public.remove_from_shift_group(p_employee uuid, p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.shift_groups g
                 where g.id = p_group and g.tenant_id = app.current_tenant_id()) or not app.is_hr() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.shift_group_members where group_id = p_group and employee_id = p_employee;
  if not found then
    raise exception 'not in group' using errcode = '22023', hint = 'not_in_group';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Open shifts
-- -----------------------------------------------------------------------------
-- Who an open shift would go to, and why anyone is left out. Used to preview before posting.
create function public.open_shift_candidates(
  p_date date, p_start time, p_end time, p_group uuid default null, p_employees uuid[] default null
) returns table (employee_id uuid, name text, available boolean, reason text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_starts timestamptz := app.shift_start(p_date, p_start);
  v_ends timestamptz := app.shift_end(p_date, p_start, p_end);
  v_hr boolean := app.is_hr();
begin
  if not app.can_plan_shifts(v_tenant) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_group is not null and not exists (select 1 from public.shift_groups g where g.id = p_group and g.tenant_id = v_tenant) then
    raise exception 'unknown group' using errcode = '22023', hint = 'bad_group';
  end if;
  if p_group is null and coalesce(cardinality(p_employees), 0) = 0 then
    raise exception 'nobody chosen' using errcode = '22023', hint = 'no_people';
  end if;
  return query
  with pool as (
    select e.id, e.first_name, e.preferred_name, e.last_name
    from public.employees e
    where e.tenant_id = v_tenant and e.anonymised_at is null
      and (e.id = any(coalesce(p_employees, '{}'))
           or exists (select 1 from public.shift_group_members m where m.group_id = p_group and m.employee_id = e.id))
  ), checked as (
    select p.*,
      case
        when not v_hr and not app.is_manager_of(p.id) then 'not_your_team'
        when app.user_of(p.id) is null then 'no_login'
        else app.shift_blocker(p.id, v_starts, v_ends)
      end as why
    from pool p
  )
  select c.id, coalesce(nullif(c.preferred_name, ''), c.first_name) || ' ' || c.last_name,
         c.why is null, c.why
  from checked c
  order by c.why is not null, c.last_name, c.first_name;
end $$;

-- Posts an open shift to everyone free in the group (and/or named people) and emails them.
-- Returns the new shift's id.
create function public.post_open_shift(
  p_date date, p_start time, p_end time,
  p_role text default null, p_location uuid default null, p_notes text default null,
  p_group uuid default null, p_employees uuid[] default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_starts timestamptz := app.shift_start(p_date, p_start);
  v_ends timestamptz := app.shift_end(p_date, p_start, p_end);
  v_id uuid;
  v_pick uuid[];
  v_emp uuid;
begin
  if not app.can_plan_shifts(v_tenant) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_starts <= now() then
    raise exception 'in the past' using errcode = '22023', hint = 'in_past';
  end if;
  perform app.check_shift_location(v_tenant, p_location);

  v_pick := array(select c.employee_id
                  from public.open_shift_candidates(p_date, p_start, p_end, p_group, p_employees) c
                  where c.available);
  if cardinality(v_pick) = 0 then
    raise exception 'nobody free' using errcode = '22023', hint = 'no_one_available';
  end if;

  insert into public.shifts (tenant_id, starts_at, ends_at, role_label, location_id, notes, status, group_id, created_by)
  values (v_tenant, v_starts, v_ends, nullif(trim(p_role), ''), p_location, nullif(trim(p_notes), ''),
          'open', p_group, auth.uid())
  returning id into v_id;

  foreach v_emp in array v_pick loop
    insert into public.shift_offers (tenant_id, shift_id, employee_id) values (v_tenant, v_id, v_emp);
    perform app.enqueue_email(v_tenant, app.user_of(v_emp), 'open_shift_offered', '/shifts',
                              'open_shift:' || v_id || ':' || v_emp);
  end loop;
  return v_id;
end $$;

-- Accept an open shift. The shift row is locked first, so if two people accept at the same
-- moment the second one waits, then finds it already taken.
create function public.claim_open_shift(p_shift uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := app.my_employee_id();
  v public.shifts;
  v_block text;
begin
  select * into v from public.shifts where id = p_shift and tenant_id = app.current_tenant_id() for update;
  if v.id is null or v_me is null or not exists (
       select 1 from public.shift_offers o where o.shift_id = p_shift and o.employee_id = v_me) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v.status <> 'open' then
    raise exception 'already taken' using errcode = '22023', hint = 'shift_taken';
  end if;
  if v.starts_at <= now() then
    raise exception 'closed' using errcode = '22023', hint = 'shift_closed';
  end if;
  v_block := app.shift_blocker(v_me, v.starts_at, v.ends_at, v.id);
  if v_block is not null then
    raise exception 'not free' using errcode = '22023', hint = v_block;
  end if;

  update public.shifts set employee_id = v_me, status = 'scheduled', claimed_at = now() where id = p_shift;
  update public.shift_offers set response = 'accepted', responded_at = now()
   where shift_id = p_shift and employee_id = v_me;
  perform app.enqueue_email(v.tenant_id, v.created_by, 'open_shift_filled', '/rota', 'open_shift_filled:' || v.id);
end $$;

create function public.decline_open_shift(p_shift uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.shift_offers o set response = 'declined', responded_at = now()
   where o.shift_id = p_shift and o.employee_id = app.my_employee_id() and o.response is null
     and o.tenant_id = app.current_tenant_id();
  if not found then
    raise exception 'not available' using errcode = '22023', hint = 'not_pending';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- GDPR: subject access export and anonymisation
-- -----------------------------------------------------------------------------
create function public.shifts_sar_data(p_employee uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_emp public.employees;
begin
  select * into v_emp from public.employees where id = p_employee;
  if v_emp is null or app.case_access(v_emp.tenant_id, p_employee) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object('starts', s.starts_at, 'ends', s.ends_at, 'role', s.role_label,
        'status', s.status, 'notes', s.notes, 'picked_up_as_open_shift', s.claimed_at is not null) order by s.starts_at)
      from public.shifts s where s.employee_id = p_employee), '[]'::jsonb),
    'open_shifts_offered', coalesce((
      select jsonb_agg(jsonb_build_object('offered', o.offered_at, 'response', o.response, 'responded', o.responded_at)
        order by o.offered_at)
      from public.shift_offers o where o.employee_id = p_employee), '[]'::jsonb),
    'shift_groups', coalesce((
      select jsonb_agg(g.name order by g.name)
      from public.shift_group_members m join public.shift_groups g on g.id = m.group_id
      where m.employee_id = p_employee), '[]'::jsonb)
  );
end $$;

create function app.shifts_on_anonymise() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.shifts set notes = null where employee_id = new.id and notes is not null;
  delete from public.shift_group_members where employee_id = new.id;
  return null;
end $$;
create trigger shifts_anonymise after update of anonymised_at on public.employees
  for each row when (old.anonymised_at is null and new.anonymised_at is not null)
  execute function app.shifts_on_anonymise();

-- -----------------------------------------------------------------------------
-- The assistant can suggest shift changes too (still only on the person's Confirm).
-- -----------------------------------------------------------------------------
alter table public.assistant_actions drop constraint assistant_actions_kind_check;
alter table public.assistant_actions add constraint assistant_actions_kind_check check (kind in (
  'request_leave', 'cancel_leave', 'decide_leave', 'record_sickness', 'create_employee',
  'update_employee', 'start_checklist', 'remember',
  'create_shift', 'cancel_shift', 'post_open_shift', 'add_to_shift_group', 'remove_from_shift_group'
));

-- -----------------------------------------------------------------------------
-- Row Level Security: reading only. All writes go through the functions above.
-- -----------------------------------------------------------------------------
alter table public.shift_groups enable row level security;
alter table public.shift_group_members enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_offers enable row level security;

create policy shift_groups_select on public.shift_groups for select to authenticated
  using (app.member_of(tenant_id));
create policy shift_groups_delete on public.shift_groups for delete to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_hr());

create policy shift_group_members_select on public.shift_group_members for select to authenticated
  using (app.hr_access(tenant_id) or app.is_self(employee_id) or app.is_manager_of(employee_id));

-- Shifts: HR sees all; managers see their team's and the open shifts they posted; people see
-- their own shifts and any open shift they were offered.
create policy shifts_select on public.shifts for select to authenticated
  using (app.hr_access(tenant_id) or app.is_self(employee_id) or app.is_manager_of(employee_id)
         or app.shift_posted_by_me(id) or app.shift_offered_to_me(id));

create policy shift_offers_select on public.shift_offers for select to authenticated
  using (app.hr_access(tenant_id) or app.is_self(employee_id) or app.is_manager_of(employee_id)
         or app.shift_posted_by_me(shift_id));

revoke all on public.shift_groups, public.shift_group_members, public.shifts, public.shift_offers
  from anon, authenticated;
grant select, delete on public.shift_groups to authenticated;
grant select on public.shift_group_members, public.shifts, public.shift_offers to authenticated;

revoke all on function app.shift_start, app.shift_end, app.can_plan_shifts, app.shift_blocker,
  app.shift_offered_to_me, app.shift_posted_by_me, app.check_shift_location, app.shifts_on_anonymise
  from public, anon, authenticated;
grant execute on function app.can_plan_shifts, app.shift_offered_to_me, app.shift_posted_by_me
  to authenticated;
revoke execute on function public.create_shift, public.cancel_shift, public.add_to_shift_group,
  public.remove_from_shift_group, public.open_shift_candidates, public.post_open_shift,
  public.claim_open_shift, public.decline_open_shift, public.shifts_sar_data from public, anon;
grant execute on function public.create_shift, public.cancel_shift, public.add_to_shift_group,
  public.remove_from_shift_group, public.open_shift_candidates, public.post_open_shift,
  public.claim_open_shift, public.decline_open_shift, public.shifts_sar_data to authenticated;
