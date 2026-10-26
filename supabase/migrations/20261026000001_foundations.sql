-- =============================================================================
-- AbsorbHR Portal — Phase 1, part 1: foundations
--
-- Tenancy, roles, security helper functions, support sessions, audit log.
--
-- Security model in one paragraph:
--   Every business table carries tenant_id. Row Level Security (RLS) policies
--   call the helper functions in the private `app` schema to decide access.
--   The helpers read the live memberships table (not cached token claims), so
--   role changes and deactivations apply immediately. HR/admin powers require
--   an MFA-verified session (aal2). AbsorbHR staff ("platform admins") have no
--   standing access to client data: they open a time-limited, audited support
--   session for one tenant, which never covers special-category data.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Private schema for helpers. Not exposed through the Supabase API.
create schema if not exists app;
revoke all on schema app from public, anon;
grant usage on schema app to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('client_admin', 'hr_manager', 'line_manager', 'employee');

create type public.bank_holiday_region as enum ('england-and-wales', 'scotland', 'northern-ireland');

-- -----------------------------------------------------------------------------
-- Generic triggers
-- -----------------------------------------------------------------------------
create function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Tenants (client companies)
-- -----------------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  bank_holiday_region public.bank_holiday_region not null default 'england-and-wales',
  plan_tier text not null default 'standard' check (length(plan_tier) <= 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
comment on table public.tenants is 'One row per AbsorbHR client company. Every other business table is scoped to a tenant.';

create table public.tenant_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  leave_year_start_month smallint not null default 1 check (leave_year_start_month between 1 and 12),
  leave_year_start_day smallint not null default 1 check (leave_year_start_day between 1 and 28),
  session_idle_minutes smallint not null default 30 check (session_idle_minutes between 5 and 480),
  require_mfa_for_all boolean not null default false,
  employees_can_view_own_salary boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
comment on table public.tenant_settings is 'Per-company configuration. No personal data.';

-- AbsorbHR staff. Managed only by AbsorbHR via SQL/service role, never through the app UI.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Which company a login belongs to, and with what role. One company per login (v1).
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  role public.app_role not null default 'employee',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index memberships_tenant_idx on public.memberships (tenant_id);

-- AbsorbHR support access: time-limited, reason required, visible to the client.
create table public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  reason text not null check (length(trim(reason)) between 10 and 500),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  check (expires_at > started_at)
);
create index support_sessions_active_idx on public.support_sessions (admin_user_id) where ended_at is null;
create index support_sessions_tenant_idx on public.support_sessions (tenant_id, started_at desc);

-- -----------------------------------------------------------------------------
-- Security helper functions (used by RLS policies)
-- SECURITY DEFINER so they can read memberships without recursing into RLS;
-- each one only ever answers questions about the calling user (auth.uid()).
-- -----------------------------------------------------------------------------
create function app.is_aal2() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

create function app.current_tenant_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.tenant_id
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = auth.uid() and m.is_active and t.status = 'active'
$$;

create function app.current_app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select m.role
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = auth.uid() and m.is_active and t.status = 'active'
$$;

create function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_aal2() and exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

-- Tenant the calling AbsorbHR admin currently has an open support session for (or null).
create function app.support_tenant_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.tenant_id
  from public.support_sessions s
  where s.admin_user_id = auth.uid()
    and s.ended_at is null
    and s.expires_at > now()
    and app.is_platform_admin()
  order by s.started_at desc
  limit 1
$$;

-- HR powers inside the user's own company (MFA required).
create function app.is_hr() returns boolean
language sql stable set search_path = '' as $$
  select app.is_aal2() and coalesce(app.current_app_role() in ('client_admin', 'hr_manager'), false)
$$;

create function app.is_client_admin() returns boolean
language sql stable set search_path = '' as $$
  select app.is_aal2() and coalesce(app.current_app_role() = 'client_admin', false)
$$;

-- HR-level access to a given tenant's ordinary (non special-category) data.
create function app.hr_access(p_tenant uuid) returns boolean
language sql stable set search_path = '' as $$
  select p_tenant is not null and (
    (p_tenant = app.current_tenant_id() and app.is_hr())
    or p_tenant = app.support_tenant_id()
  )
$$;

-- Client-admin-level access (company settings, roles) to a tenant.
create function app.admin_access(p_tenant uuid) returns boolean
language sql stable set search_path = '' as $$
  select p_tenant is not null and (
    (p_tenant = app.current_tenant_id() and app.is_client_admin())
    or p_tenant = app.support_tenant_id()
  )
$$;

-- Any member of the tenant (or support session) may see shared reference data.
create function app.member_of(p_tenant uuid) returns boolean
language sql stable set search_path = '' as $$
  select p_tenant is not null and (p_tenant = app.current_tenant_id() or p_tenant = app.support_tenant_id())
$$;

-- -----------------------------------------------------------------------------
-- Audit log — append-only record of who did what to personal data, and when.
-- Stores field NAMES that changed, never the values.
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  tenant_id uuid,                      -- no FK: the log must outlive what it describes
  actor_user_id uuid,
  actor_kind text not null check (actor_kind in ('user', 'support', 'system')),
  action text not null check (action in (
    'create', 'update', 'delete', 'view', 'export', 'erase', 'anonymise',
    'login', 'logout', 'login_failed', 'mfa_enrolled', 'mfa_verified',
    'support_start', 'support_end', 'acknowledge', 'invite'
  )),
  entity text not null check (length(entity) <= 100),
  entity_id uuid,
  subject_employee_id uuid,
  changed_fields text[],
  ip_hash text check (length(ip_hash) <= 128),
  metadata jsonb not null default '{}'::jsonb check (pg_column_size(metadata) <= 2048)
);
create index audit_log_tenant_time_idx on public.audit_log (tenant_id, occurred_at desc);
create index audit_log_subject_idx on public.audit_log (subject_employee_id, occurred_at desc);
comment on table public.audit_log is 'Append-only. UPDATE/DELETE/TRUNCATE are blocked for every role by trigger and privileges.';

create function app.audit_log_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end $$;

create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function app.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function app.audit_log_immutable();

create function app.actor_kind(p_tenant uuid) returns text
language sql stable set search_path = '' as $$
  select case
    when auth.uid() is null then 'system'
    when p_tenant is not null and p_tenant = app.support_tenant_id()
      and p_tenant is distinct from app.current_tenant_id() then 'support'
    else 'user'
  end
$$;

create function app.write_audit(
  p_tenant uuid, p_action text, p_entity text, p_entity_id uuid,
  p_subject uuid default null, p_fields text[] default null, p_metadata jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log
    (tenant_id, actor_user_id, actor_kind, action, entity, entity_id, subject_employee_id, changed_fields, metadata)
  values
    (p_tenant, auth.uid(), app.actor_kind(p_tenant), p_action, p_entity, p_entity_id, p_subject, p_fields,
     coalesce(p_metadata, '{}'::jsonb));
$$;

-- Row trigger: logs create/update/delete. TG_ARGV[0] = column holding the employee the row is about.
create function app.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_fields text[];
  v_tenant uuid;
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_fields
    from jsonb_object_keys(v_new) as k
    where k not in ('updated_at', 'updated_by') and v_new -> k is distinct from v_old -> k;
    if v_fields is null then
      return null;
    end if;
  end if;

  v_tenant := coalesce(
    (v_row ->> 'tenant_id')::uuid,
    case when tg_table_name = 'tenants' then (v_row ->> 'id')::uuid end
  );

  perform app.write_audit(
    v_tenant,
    case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'employee_id', v_row ->> 'tenant_id')::uuid,
    case when tg_nargs > 0 then (v_row ->> tg_argv[0])::uuid end,
    v_fields
  );
  return null;
end $$;

-- Lets the app record reads/exports/logins. Actor and tenant are taken from the
-- session, so a caller cannot forge who they are or which company they act in.
create function public.log_event(
  p_action text, p_entity text, p_entity_id uuid default null,
  p_subject_employee_id uuid default null, p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := coalesce(app.support_tenant_id(), app.current_tenant_id());
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_action not in ('view', 'export', 'login', 'logout', 'mfa_enrolled', 'mfa_verified', 'acknowledge') then
    raise exception 'action not allowed' using errcode = '22023';
  end if;
  perform app.write_audit(v_tenant, p_action, p_entity, p_entity_id, p_subject_employee_id, null, p_metadata);
end $$;

-- -----------------------------------------------------------------------------
-- Departments & locations
-- -----------------------------------------------------------------------------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default app.current_tenant_id() references public.tenants (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (tenant_id, name),
  unique (tenant_id, id)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default app.current_tenant_id() references public.tenants (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  address text check (length(address) <= 500),           -- business address (optional)
  bank_holiday_region public.bank_holiday_region,          -- optional override of company default
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (tenant_id, name),
  unique (tenant_id, id)
);

-- -----------------------------------------------------------------------------
-- Tenant / support RPCs (platform admins)
-- -----------------------------------------------------------------------------
create function public.create_tenant(p_name text, p_region public.bank_holiday_region default 'england-and-wales')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.tenants (name, bank_holiday_region) values (trim(p_name), p_region) returning id into v_id;
  insert into public.tenant_settings (tenant_id) values (v_id);
  return v_id;
end $$;

create function public.start_support_session(p_tenant uuid, p_reason text, p_minutes int default 60)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_minutes not between 5 and 240 then
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

create function public.end_support_session() returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in update public.support_sessions set ended_at = now()
           where admin_user_id = auth.uid() and ended_at is null
           returning id, tenant_id
  loop
    perform app.write_audit(r.tenant_id, 'support_end', 'support_sessions', r.id);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
create trigger touch before update on public.tenants for each row execute function app.touch_updated_at();
create trigger touch before update on public.tenant_settings for each row execute function app.touch_updated_at();
create trigger touch before update on public.memberships for each row execute function app.touch_updated_at();
create trigger touch before update on public.departments for each row execute function app.touch_updated_at();
create trigger touch before update on public.locations for each row execute function app.touch_updated_at();

create trigger audit after insert or update or delete on public.tenants for each row execute function app.audit_row();
create trigger audit after insert or update or delete on public.tenant_settings for each row execute function app.audit_row();
create trigger audit after insert or update or delete on public.memberships for each row execute function app.audit_row();
create trigger audit after insert or update or delete on public.departments for each row execute function app.audit_row();
create trigger audit after insert or update or delete on public.locations for each row execute function app.audit_row();
create trigger audit after insert or update or delete on public.platform_admins for each row execute function app.audit_row();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- (select ...) wrappers let Postgres evaluate each helper once per query.
-- -----------------------------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.platform_admins enable row level security;
alter table public.memberships enable row level security;
alter table public.support_sessions enable row level security;
alter table public.audit_log enable row level security;
alter table public.departments enable row level security;
alter table public.locations enable row level security;

-- tenants
create policy tenants_select on public.tenants for select to authenticated
  using (app.member_of(id) or (select app.is_platform_admin()));
create policy tenants_update on public.tenants for update to authenticated
  using (app.admin_access(id) or (select app.is_platform_admin()))
  with check (app.admin_access(id) or (select app.is_platform_admin()));

-- tenant_settings
create policy tenant_settings_select on public.tenant_settings for select to authenticated
  using (app.member_of(tenant_id) or (select app.is_platform_admin()));
create policy tenant_settings_update on public.tenant_settings for update to authenticated
  using (app.admin_access(tenant_id)) with check (app.admin_access(tenant_id));

-- platform_admins: a user may only see whether they themselves are one
create policy platform_admins_self on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- memberships
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or app.hr_access(tenant_id) or (select app.is_platform_admin()));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (app.admin_access(tenant_id));
create policy memberships_update on public.memberships for update to authenticated
  using (app.admin_access(tenant_id) and user_id <> (select auth.uid()))
  with check (app.admin_access(tenant_id));
create policy memberships_delete on public.memberships for delete to authenticated
  using (app.admin_access(tenant_id) and user_id <> (select auth.uid()));

-- support_sessions: AbsorbHR admins see theirs; client admins see every session on their company
create policy support_sessions_select on public.support_sessions for select to authenticated
  using (
    (select app.is_platform_admin())
    or (tenant_id = (select app.current_tenant_id()) and (select app.is_client_admin()))
  );

-- audit_log: client admins read their company's log; AbsorbHR admins read all. Nobody writes directly.
create policy audit_log_select on public.audit_log for select to authenticated
  using (
    (select app.is_platform_admin())
    or (tenant_id = (select app.current_tenant_id()) and (select app.is_client_admin()))
  );

-- departments & locations
create policy departments_select on public.departments for select to authenticated using (app.member_of(tenant_id));
create policy departments_write on public.departments for all to authenticated
  using (app.hr_access(tenant_id)) with check (app.hr_access(tenant_id));
create policy locations_select on public.locations for select to authenticated using (app.member_of(tenant_id));
create policy locations_write on public.locations for all to authenticated
  using (app.hr_access(tenant_id)) with check (app.hr_access(tenant_id));

-- -----------------------------------------------------------------------------
-- Privileges: deny-by-default for anonymous users; audit log is never writable.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on public.audit_log from authenticated, service_role;
revoke insert, update, delete, truncate on public.platform_admins from authenticated;
revoke insert, update, delete, truncate on public.support_sessions from authenticated;
revoke insert, delete on public.tenants from authenticated;
revoke insert, delete on public.tenant_settings from authenticated;

revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
-- Audit writers are only reachable through triggers and vetted SECURITY DEFINER functions.
revoke execute on function app.write_audit, app.audit_row from authenticated, service_role;

-- Future tables/functions: anonymous users get nothing by default.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

revoke execute on function public.log_event, public.create_tenant, public.start_support_session,
  public.end_support_session from public, anon;
grant execute on function public.log_event, public.create_tenant, public.start_support_session,
  public.end_support_session to authenticated;
