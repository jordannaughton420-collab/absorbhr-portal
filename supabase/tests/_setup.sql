-- Shared fixtures for RLS tests. Prepended to every test file by scripts/db.mjs.
-- Everything runs inside one transaction that each test file rolls back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create schema tests;
create table tests.results (n serial primary key, line text);

-- Pretend to be a signed-in user. aal2 = MFA-verified session.
create function tests.as_user(p_user uuid, p_aal text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;

-- Count rows a query returns when run as that user.
create function tests.count_as(p_user uuid, p_aal text, p_sql text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  perform tests.as_user(p_user, p_aal);
  execute 'set local role authenticated';
  execute format('select count(*) from (%s) q', p_sql) into n;
  execute 'reset role';
  return n;
end $$;

-- Run a statement as that user; returns 'rows:N' or 'error:SQLSTATE'.
create function tests.exec_as(p_user uuid, p_aal text, p_sql text) returns text
language plpgsql as $$
declare n bigint;
begin
  perform tests.as_user(p_user, p_aal);
  execute 'set local role authenticated';
  begin
    execute p_sql;
    get diagnostics n = row_count;
    execute 'reset role';
    return 'rows:' || n;
  exception when others then
    execute 'reset role';
    return 'error:' || sqlstate;
  end;
end $$;

-- First column of first row, as text, when run as that user (or 'error:SQLSTATE').
create function tests.value_as(p_user uuid, p_aal text, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  perform tests.as_user(p_user, p_aal);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
    execute 'reset role';
    return v;
  exception when others then
    execute 'reset role';
    return 'error:' || sqlstate;
  end;
end $$;

-- Run a statement as the anonymous (not signed in) role.
create function tests.exec_anon(p_sql text) returns text
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin
    execute p_sql;
    execute 'reset role';
    return 'ok';
  exception when others then
    execute 'reset role';
    return 'error:' || sqlstate;
  end;
end $$;

grant usage on schema tests to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Fixed IDs (fake people only)
--   Tenant A "Test Co A": admin, hr, mgr → (emp1, emp2, lead → emp4)
--   Tenant B "Test Co B": admin, emp
--   p_admin: AbsorbHR platform admin
-- ---------------------------------------------------------------------------
create table tests.ids (name text primary key, id uuid not null);
insert into tests.ids values
  ('tenant_a', '0a000000-0000-4000-8000-000000000000'),
  ('tenant_b', '0b000000-0000-4000-8000-000000000000'),
  ('a_admin',  'a0000000-0000-4000-8000-000000000001'),
  ('a_hr',     'a0000000-0000-4000-8000-000000000002'),
  ('a_mgr',    'a0000000-0000-4000-8000-000000000003'),
  ('a_emp1',   'a0000000-0000-4000-8000-000000000004'),
  ('a_emp2',   'a0000000-0000-4000-8000-000000000005'),
  ('a_lead',   'a0000000-0000-4000-8000-000000000006'),
  ('a_emp4',   'a0000000-0000-4000-8000-000000000007'),
  ('b_admin',  'b0000000-0000-4000-8000-000000000001'),
  ('b_emp',    'b0000000-0000-4000-8000-000000000002'),
  ('p_admin',  'c0000000-0000-4000-8000-000000000001');
grant select on tests.ids to authenticated, anon;

create function tests.id(p_name text) returns uuid language sql stable as $$
  select id from tests.ids where name = p_name
$$;

insert into auth.users (id, email, aud, role)
select id, name || '@example.test', 'authenticated', 'authenticated'
from tests.ids where name not like 'tenant_%';

insert into public.tenants (id, name) values
  (tests.id('tenant_a'), 'Test Co A'), (tests.id('tenant_b'), 'Test Co B');
insert into public.tenant_settings (tenant_id) values (tests.id('tenant_a')), (tests.id('tenant_b'));
insert into public.platform_admins (user_id) values (tests.id('p_admin'));

insert into public.memberships (tenant_id, user_id, role) values
  (tests.id('tenant_a'), tests.id('a_admin'), 'client_admin'),
  (tests.id('tenant_a'), tests.id('a_hr'), 'hr_manager'),
  (tests.id('tenant_a'), tests.id('a_mgr'), 'line_manager'),
  (tests.id('tenant_a'), tests.id('a_emp1'), 'employee'),
  (tests.id('tenant_a'), tests.id('a_emp2'), 'employee'),
  (tests.id('tenant_a'), tests.id('a_lead'), 'line_manager'),
  (tests.id('tenant_a'), tests.id('a_emp4'), 'employee'),
  (tests.id('tenant_b'), tests.id('b_admin'), 'client_admin'),
  (tests.id('tenant_b'), tests.id('b_emp'), 'employee');

insert into public.departments (id, tenant_id, name) values
  ('da000000-0000-4000-8000-000000000001', tests.id('tenant_a'), 'Operations'),
  ('db000000-0000-4000-8000-000000000001', tests.id('tenant_b'), 'Operations');

-- Employee id = user id for readability.
insert into public.employees (id, tenant_id, user_id, first_name, last_name, start_date, manager_id) values
  (tests.id('a_admin'), tests.id('tenant_a'), tests.id('a_admin'), 'Ada', 'Admin', '2020-01-01', null),
  (tests.id('a_hr'),    tests.id('tenant_a'), tests.id('a_hr'),    'Hal', 'Hr',    '2020-01-01', tests.id('a_admin')),
  (tests.id('a_mgr'),   tests.id('tenant_a'), tests.id('a_mgr'),   'Max', 'Mgr',   '2020-01-01', tests.id('a_admin')),
  (tests.id('a_emp1'),  tests.id('tenant_a'), tests.id('a_emp1'),  'Eve', 'One',   '2021-01-01', tests.id('a_mgr')),
  (tests.id('a_emp2'),  tests.id('tenant_a'), tests.id('a_emp2'),  'Eli', 'Two',   '2021-01-01', tests.id('a_mgr')),
  (tests.id('a_lead'),  tests.id('tenant_a'), tests.id('a_lead'),  'Lee', 'Lead',  '2021-01-01', tests.id('a_mgr')),
  (tests.id('a_emp4'),  tests.id('tenant_a'), tests.id('a_emp4'),  'Fay', 'Four',  '2022-01-01', tests.id('a_lead')),
  (tests.id('b_admin'), tests.id('tenant_b'), tests.id('b_admin'), 'Bea', 'Admin', '2020-01-01', null),
  (tests.id('b_emp'),   tests.id('tenant_b'), tests.id('b_emp'),   'Ben', 'Emp',   '2021-01-01', tests.id('b_admin'));

insert into public.employee_personal (employee_id, tenant_id, postcode)
select id, tenant_id, 'ZZ1 1ZZ' from public.employees;

insert into public.emergency_contacts (tenant_id, employee_id, name, phone)
select tenant_id, id, 'Contact of ' || first_name, '07700900000' from public.employees;

insert into public.salary_history (tenant_id, employee_id, effective_date, amount)
select tenant_id, id, '2024-04-01', 30000 from public.employees;

insert into public.right_to_work_checks (tenant_id, employee_id, check_type, checked_on, status)
select tenant_id, id, 'manual_document', start_date, 'verified' from public.employees;

update public.tenant_settings set diversity_monitoring_enabled = true;
