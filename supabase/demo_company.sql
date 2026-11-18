-- =============================================================================
-- DEMO COMPANY for showing the live portal — every person here is invented.
-- Run only through scripts/seed-demo-company.mjs, which fills in the four login
-- addresses ({{ADMIN}}, {{HR}}, {{MANAGER}}, {{EMPLOYEE}}) and then adds the
-- holiday, policy, people-process and data-protection demo content.
--
-- Unlike seed.sql this is safe on production: it touches only the demo company
-- and its four logins, and the logins have NO password (each one sets its own
-- through "Forgot password").
-- =============================================================================

do $$
declare
  v_name constant text := 'Brightwater Bakery Ltd (Demo)';
  v_bw uuid;
  v_user uuid;
  r record;
  i int;
  v_first text[] := array['Amelia','Oliver','Isla','George','Ava','Noah','Mia','Arthur','Ivy','Leo',
    'Freya','Oscar','Grace','Harry','Lily','Jack','Evie','Theo','Ella','Finley','Rosie','Alfie'];
  v_last text[] := array['Fakeham','Testwood','Sampleton','Mockford','Demoly','Placeholt','Exampleby',
    'Dummett','Specimen','Trialle','Pretendon','Notreal','Fictionby','Madeup','Imaginary','Synthetic'];
begin
  -- ---------------------------------------------------------------- remove a previous demo
  delete from public.tenants where name = v_name;
  delete from auth.users where email in ('{{ADMIN}}', '{{HR}}', '{{MANAGER}}', '{{EMPLOYEE}}')
    and id not in (select user_id from public.platform_admins);

  -- ---------------------------------------------------------------- company
  insert into public.tenants (name, bank_holiday_region) values (v_name, 'england-and-wales') returning id into v_bw;
  insert into public.tenant_settings (tenant_id) values (v_bw);
  insert into public.departments (tenant_id, name) values
    (v_bw, 'Leadership'), (v_bw, 'Production'), (v_bw, 'Sales'), (v_bw, 'Finance'), (v_bw, 'People');
  insert into public.locations (tenant_id, name, address) values
    (v_bw, 'Bristol Bakery', '1 Example Street, Bristol'),
    (v_bw, 'Bath Shop', '2 Sample Road, Bath');

  -- ---------------------------------------------------------------- demo logins (no password)
  create temporary table demo_logins (email text, role public.app_role, first text, last text,
    title text, dept text, manager_email text) on commit drop;
  insert into demo_logins values
    ('{{ADMIN}}', 'client_admin', 'Dana', 'Director', 'Managing Director', 'Leadership', null),
    ('{{HR}}', 'hr_manager', 'Harper', 'Peopleton', 'HR Manager', 'People', '{{ADMIN}}'),
    ('{{MANAGER}}', 'line_manager', 'Morgan', 'Bakewell', 'Production Manager', 'Production', '{{ADMIN}}'),
    ('{{EMPLOYEE}}', 'employee', 'Jamie', 'Crumb', 'Baker', 'Production', '{{MANAGER}}');

  for r in select * from demo_logins order by ctid loop
    v_user := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', r.email,
      '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
    values (gen_random_uuid(), v_user, v_user::text,
      jsonb_build_object('sub', v_user::text, 'email', r.email, 'email_verified', true), 'email', now(), now());
    insert into public.memberships (tenant_id, user_id, role) values (v_bw, v_user, r.role);
    insert into public.employees (tenant_id, user_id, first_name, last_name, work_email, job_title,
      department_id, location_id, manager_id, start_date, contract_type, weekly_hours, days_per_week)
    values (v_bw, v_user, r.first, r.last, r.email, r.title,
      (select id from public.departments where tenant_id = v_bw and name = r.dept),
      (select id from public.locations where tenant_id = v_bw and name = 'Bristol Bakery'),
      (select id from public.employees where tenant_id = v_bw and work_email = r.manager_email),
      date '2019-03-01' + (random() * 1500)::int, 'permanent', 37.5, 5);
  end loop;

  -- ---------------------------------------------------------------- other staff (no logins)
  for i in 1..22 loop
    insert into public.employees (tenant_id, first_name, last_name, work_email, job_title, department_id,
      location_id, manager_id, start_date, probation_end_date, contract_type, fixed_term_end_date,
      weekly_hours, days_per_week)
    select v_bw, v_first[i], v_last[1 + (i % array_length(v_last, 1))],
      lower(v_first[i] || '.' || v_last[1 + (i % array_length(v_last, 1))] || i || '@example.com'),
      (array['Baker','Baker','Pastry Chef','Sales Assistant','Delivery Driver','Finance Assistant'])[1 + i % 6],
      (select id from public.departments where tenant_id = v_bw
         and name = (array['Production','Production','Production','Sales','Sales','Finance'])[1 + i % 6]),
      (select id from public.locations where tenant_id = v_bw
         and name = case when i % 3 = 0 then 'Bath Shop' else 'Bristol Bakery' end),
      (select id from public.employees where tenant_id = v_bw
         and work_email = case when i % 6 in (0, 1, 2) then '{{MANAGER}}' else '{{ADMIN}}' end),
      t.start, case when t.start > current_date - 180 then t.start + 180 end,
      t.contract::public.contract_type, case when t.contract = 'fixed_term' then t.start + 365 end,
      case when i % 4 = 0 then 22.5 else 37.5 end, case when i % 4 = 0 then 3 else 5 end
    from (select current_date - (30 + i * 97) % 2400 as start,
            case when i % 9 = 0 then 'fixed_term' when i % 7 = 0 then 'zero_hours' else 'permanent' end as contract) t;
  end loop;

  -- ---------------------------------------------------------------- related records for everyone
  for r in select e.* from public.employees e where e.tenant_id = v_bw loop
    insert into public.employee_personal (employee_id, tenant_id, personal_phone, address_line1, town, postcode, date_of_birth)
    values (r.id, v_bw, '07700 900' || lpad((abs(hashtext(r.id::text)) % 1000)::text, 3, '0'),
      (1 + abs(hashtext(r.id::text)) % 200) || ' Fictional Lane', 'Bristol', 'BS1 1AA',
      date '1965-01-01' + abs(hashtext(r.id::text)) % 13000);
    insert into public.emergency_contacts (tenant_id, employee_id, name, relationship, phone)
    values (v_bw, r.id, 'Pat ' || r.last_name, 'Partner', '07700 900999');
    insert into public.salary_history (tenant_id, employee_id, effective_date, amount, pay_basis, reason)
    values (v_bw, r.id, r.start_date, 24000 + abs(hashtext(r.id::text)) % 20000, 'annual', 'Starting salary');
    insert into public.employment_history (tenant_id, employee_id, effective_date, job_title, department_id, manager_id, note)
    values (v_bw, r.id, r.start_date, r.job_title, r.department_id, r.manager_id, 'Joined');
    insert into public.right_to_work_checks (tenant_id, employee_id, check_type, checked_on, status, expiry_date, follow_up_date)
    values (v_bw, r.id,
      case when abs(hashtext(r.id::text)) % 5 = 0 then 'online_share_code' else 'manual_document' end,
      r.start_date - 7,
      case when abs(hashtext(r.id::text)) % 5 = 0 then 'time_limited' else 'verified' end,
      case when abs(hashtext(r.id::text)) % 5 = 0 then current_date + (abs(hashtext(r.id::text)) % 120) end,
      case when abs(hashtext(r.id::text)) % 5 = 0 then current_date + (abs(hashtext(r.id::text)) % 120) - 28 end);
  end loop;

  -- ---------------------------------------------------------------- privacy notice (this company only)
  insert into public.privacy_notices (tenant_id, version, title, body, published_at)
  values (v_bw, 1, '[DEMO] Employee privacy notice',
$notice$**Demo wording — not for real use.**

## Who we are
Your employer is the data controller for the personal data held in this portal. AbsorbHR provides the portal and acts as a data processor on your employer's behalf.

## What we hold and why
- **Identity and contact details** — to manage your employment and contact you.
- **Job, contract and pay details** — to perform your employment contract and meet legal obligations.
- **Right-to-work checks** — required by UK immigration law.
- **Absence and health information** — to manage absence and support your wellbeing (extra protection applies).

## Where it is stored
In the United Kingdom (London), encrypted in transit and at rest.

## Your rights
You can ask to access, correct or (in some cases) erase your data. Use "Request a correction" in the portal or contact HR.
$notice$, now());
end $$;
