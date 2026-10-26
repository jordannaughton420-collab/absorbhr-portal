-- =============================================================================
-- Fix: access helpers could return NULL ("unknown") instead of false for users
-- with no employee record (e.g. AbsorbHR admins). In PL/pgSQL, `if not NULL`
-- does not fire, so get_/set_employee_sensitive let a support session read
-- special-category data. Caught by supabase/tests/02_roles_and_sensitive_data.sql.
--
-- Every boolean helper now returns strictly true/false, and every guard uses
-- `is not true` so anything other than an explicit yes is a no.
-- =============================================================================

create or replace function app.hr_access(p_tenant uuid) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(p_tenant is not null and (
    (p_tenant = app.current_tenant_id() and app.is_hr())
    or p_tenant = app.support_tenant_id()
  ), false)
$$;

create or replace function app.admin_access(p_tenant uuid) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(p_tenant is not null and (
    (p_tenant = app.current_tenant_id() and app.is_client_admin())
    or p_tenant = app.support_tenant_id()
  ), false)
$$;

create or replace function app.member_of(p_tenant uuid) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(p_tenant is not null and (p_tenant = app.current_tenant_id() or p_tenant = app.support_tenant_id()), false)
$$;

create or replace function app.is_self(p_employee uuid) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(p_employee = app.my_employee_id(), false)
$$;

create or replace function app.special_category_access(p_employee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.is_self(p_employee) or exists (
    select 1 from public.employees e
    where e.id = p_employee and e.tenant_id = app.current_tenant_id() and app.is_hr()
  ), false)
$$;

create or replace function public.get_employee_sensitive(p_employee uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.employee_sensitive;
begin
  if app.special_category_access(p_employee) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_row from public.employee_sensitive where employee_id = p_employee;
  perform app.write_audit(
    (select tenant_id from public.employees where id = p_employee),
    'view', 'employee_sensitive', p_employee, p_employee);
  return case when v_row is null then null else app.decrypt_json(v_row.payload) end;
end $$;

create or replace function public.set_employee_sensitive(p_employee uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := (select tenant_id from public.employees where id = p_employee);
  v_allowed_keys text[] := array['ethnicity', 'disability', 'religion_or_belief', 'sexual_orientation', 'gender_identity'];
  v_key text;
begin
  if app.special_category_access(p_employee) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (select diversity_monitoring_enabled from public.tenant_settings where tenant_id = v_tenant) is not true then
    raise exception 'diversity monitoring is not enabled for this company' using errcode = '22023';
  end if;
  if jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'invalid data' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_data) loop
    if v_key <> all (v_allowed_keys) or jsonb_typeof(p_data -> v_key) <> 'string'
       or length(p_data ->> v_key) > 100 then
      raise exception 'invalid field' using errcode = '22023';
    end if;
  end loop;

  if p_data = '{}'::jsonb then
    delete from public.employee_sensitive where employee_id = p_employee;    -- consent withdrawn
  else
    insert into public.employee_sensitive (employee_id, tenant_id, payload, updated_by)
    values (p_employee, v_tenant, app.encrypt_json(p_data), auth.uid())
    on conflict (employee_id) do update
      set payload = excluded.payload, updated_at = now(), updated_by = auth.uid();
  end if;
end $$;

create or replace function public.create_tenant(p_name text, p_region public.bank_holiday_region default 'england-and-wales')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if app.is_platform_admin() is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.tenants (name, bank_holiday_region) values (trim(p_name), p_region) returning id into v_id;
  insert into public.tenant_settings (tenant_id) values (v_id);
  return v_id;
end $$;

create or replace function public.start_support_session(p_tenant uuid, p_reason text, p_minutes int default 60)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if app.is_platform_admin() is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_minutes is null or p_minutes not between 5 and 240 then
    raise exception 'support sessions last between 5 and 240 minutes' using errcode = '22023';
  end if;
  update public.support_sessions set ended_at = now()
    where admin_user_id = auth.uid() and ended_at is null;
  insert into public.support_sessions (admin_user_id, tenant_id, reason, expires_at)
    values (auth.uid(), p_tenant, trim(p_reason), now() + make_interval(mins => p_minutes))
    returning id into v_id;
  perform app.write_audit(p_tenant, 'support_start', 'support_sessions', v_id, null, null,
    jsonb_build_object('minutes', p_minutes));
  return v_id;
end $$;
