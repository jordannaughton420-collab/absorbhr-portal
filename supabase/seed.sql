-- =============================================================================
-- FAKE DEMO DATA ONLY — every person and company here is invented.
-- Never run against the production project.
--
-- Run with:  SEED_PASSWORD='choose-a-long-password' npm run db:seed
-- The password is substituted at run time and never stored in the repository.
-- All demo logins use @example.com (a reserved domain that can never receive mail).
-- =============================================================================

do $$
declare
  v_password text := '{{SEED_PASSWORD}}';
  v_bw uuid;  -- Brightwater Bakery Ltd
  v_ng uuid;  -- Northgate Logistics Ltd
  v_user uuid;
  v_emp uuid;
  r record;
  i int;
  v_first text[] := array['Amelia','Oliver','Isla','George','Ava','Noah','Mia','Arthur','Ivy','Leo',
    'Freya','Oscar','Grace','Harry','Lily','Jack','Evie','Theo','Ella','Finley','Rosie','Alfie',
    'Sophie','Archie','Poppy','Rory','Hannah','Callum','Niamh','Euan','Skye','Lewis','Erin','Fraser',
    'Kirsty','Ruairidh','Morven','Struan','Catriona','Hamish'];
  v_last text[] := array['Fakeham','Testwood','Sampleton','Mockford','Demoly','Placeholt','Exampleby',
    'Dummett','Specimen','Trialle','Pretendon','Notreal','Fictionby','Madeup','Imaginary','Synthetic'];
begin
  if v_password like '{{%' or length(v_password) < 12 then
    raise exception 'Set SEED_PASSWORD (at least 12 characters) when running the seed';
  end if;

  -- ---------------------------------------------------------------- reset demo data
  delete from public.tenants where name in ('Brightwater Bakery Ltd', 'Northgate Logistics Ltd');
  delete from auth.users where email like '%@example.com';
  delete from public.privacy_notices where tenant_id is null and title like '[DRAFT%';

  -- ---------------------------------------------------------------- companies
  insert into public.tenants (name, bank_holiday_region) values ('Brightwater Bakery Ltd', 'england-and-wales') returning id into v_bw;
  insert into public.tenants (name, bank_holiday_region) values ('Northgate Logistics Ltd', 'scotland') returning id into v_ng;
  insert into public.tenant_settings (tenant_id) values (v_bw), (v_ng);

  insert into public.departments (tenant_id, name) values
    (v_bw, 'Leadership'), (v_bw, 'Production'), (v_bw, 'Sales'), (v_bw, 'Finance'), (v_bw, 'People'),
    (v_ng, 'Leadership'), (v_ng, 'Warehouse'), (v_ng, 'Transport'), (v_ng, 'Office');
  insert into public.locations (tenant_id, name, address) values
    (v_bw, 'Bristol Bakery', '1 Example Street, Bristol'),
    (v_bw, 'Bath Shop', '2 Sample Road, Bath'),
    (v_ng, 'Glasgow Depot', '3 Demo Way, Glasgow');

  -- ---------------------------------------------------------------- demo logins
  create temporary table seed_logins (email text, tenant uuid, role public.app_role, first text, last text,
    title text, dept text, loc text, manager_email text, platform boolean default false) on commit drop;
  insert into seed_logins values
    ('absorb.admin@example.com', null, null, 'Alex', 'Absorb', null, null, null, null, true),
    ('brightwater.admin@example.com', v_bw, 'client_admin', 'Dana', 'Director', 'Managing Director', 'Leadership', 'Bristol Bakery', null, false),
    ('brightwater.hr@example.com', v_bw, 'hr_manager', 'Harper', 'Peopleton', 'HR Manager', 'People', 'Bristol Bakery', 'brightwater.admin@example.com', false),
    ('brightwater.manager@example.com', v_bw, 'line_manager', 'Morgan', 'Bakewell', 'Production Manager', 'Production', 'Bristol Bakery', 'brightwater.admin@example.com', false),
    ('brightwater.employee@example.com', v_bw, 'employee', 'Jamie', 'Crumb', 'Baker', 'Production', 'Bristol Bakery', 'brightwater.manager@example.com', false),
    ('northgate.admin@example.com', v_ng, 'client_admin', 'Fiona', 'Gateway', 'Operations Director', 'Leadership', 'Glasgow Depot', null, false),
    ('northgate.employee@example.com', v_ng, 'employee', 'Callum', 'Forklift', 'Warehouse Operative', 'Warehouse', 'Glasgow Depot', 'northgate.admin@example.com', false);

  for r in select * from seed_logins order by ctid loop
    v_user := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', r.email,
      extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_user, v_user::text,
      jsonb_build_object('sub', v_user::text, 'email', r.email, 'email_verified', true), 'email', now(), now(), now());

    if r.platform then
      insert into public.platform_admins (user_id) values (v_user);
    else
      insert into public.memberships (tenant_id, user_id, role) values (r.tenant, v_user, r.role);
      insert into public.employees (tenant_id, user_id, first_name, last_name, work_email, job_title,
        department_id, location_id, manager_id, start_date, probation_end_date, contract_type, weekly_hours, days_per_week)
      values (r.tenant, v_user, r.first, r.last, r.email, r.title,
        (select id from public.departments where tenant_id = r.tenant and name = r.dept),
        (select id from public.locations where tenant_id = r.tenant and name = r.loc),
        (select id from public.employees where work_email = r.manager_email),
        date '2019-03-01' + (random() * 1500)::int, null, 'permanent', 37.5, 5);
    end if;
  end loop;

  -- ---------------------------------------------------------------- other staff (no logins)
  for i in 1..33 loop
    insert into public.employees (tenant_id, first_name, last_name, work_email, job_title, department_id,
      location_id, manager_id, start_date, probation_end_date, contract_type, fixed_term_end_date,
      weekly_hours, days_per_week)
    select t.tenant, v_first[i], v_last[1 + (i % array_length(v_last, 1))],
      lower(v_first[i] || '.' || v_last[1 + (i % array_length(v_last, 1))] || i || '@example.com'),
      t.title,
      (select id from public.departments where tenant_id = t.tenant and name = t.dept),
      (select id from public.locations where tenant_id = t.tenant and name = t.loc),
      (select id from public.employees where work_email = t.manager),
      t.start, case when t.start > current_date - 180 then t.start + 180 end,
      t.contract::public.contract_type,
      case when t.contract = 'fixed_term' then t.start + 365 end,
      t.hours, t.days
    from (select
        case when i <= 22 then v_bw else v_ng end as tenant,
        case when i <= 22 then (array['Baker','Baker','Pastry Chef','Sales Assistant','Delivery Driver','Finance Assistant'])[1 + i % 6]
             else (array['Warehouse Operative','HGV Driver','Transport Planner','Office Administrator'])[1 + i % 4] end as title,
        case when i <= 22 then (array['Production','Production','Production','Sales','Sales','Finance'])[1 + i % 6]
             else (array['Warehouse','Transport','Transport','Office'])[1 + i % 4] end as dept,
        case when i <= 22 then (case when i % 3 = 0 then 'Bath Shop' else 'Bristol Bakery' end) else 'Glasgow Depot' end as loc,
        case when i <= 22 then (case when i % 6 in (0, 1, 2) then 'brightwater.manager@example.com' else 'brightwater.admin@example.com' end)
             else 'northgate.admin@example.com' end as manager,
        current_date - (30 + i * 97) % 2400 as start,
        case when i % 9 = 0 then 'fixed_term' when i % 7 = 0 then 'zero_hours' else 'permanent' end as contract,
        case when i % 4 = 0 then 22.5 else 37.5 end as hours,
        case when i % 4 = 0 then 3 else 5 end as days) t;
  end loop;

  -- ---------------------------------------------------------------- related records for everyone
  for r in select e.* from public.employees e where e.tenant_id in (v_bw, v_ng) loop
    insert into public.employee_personal (employee_id, tenant_id, personal_phone, address_line1, town, postcode, date_of_birth)
    values (r.id, r.tenant_id, '07700 900' || lpad((abs(hashtext(r.id::text)) % 1000)::text, 3, '0'),
      (1 + abs(hashtext(r.id::text)) % 200) || ' Fictional Lane',
      case when r.tenant_id = v_bw then 'Bristol' else 'Glasgow' end,
      case when r.tenant_id = v_bw then 'BS1 1AA' else 'G1 1AA' end,
      date '1965-01-01' + abs(hashtext(r.id::text)) % 13000);
    insert into public.emergency_contacts (tenant_id, employee_id, name, relationship, phone)
    values (r.tenant_id, r.id, 'Pat ' || r.last_name, 'Partner', '07700 900999');
    insert into public.salary_history (tenant_id, employee_id, effective_date, amount, pay_basis, reason)
    values (r.tenant_id, r.id, r.start_date, 24000 + abs(hashtext(r.id::text)) % 20000, 'annual', 'Starting salary');
    insert into public.employment_history (tenant_id, employee_id, effective_date, job_title, department_id, manager_id, note)
    values (r.tenant_id, r.id, r.start_date, r.job_title, r.department_id, r.manager_id, 'Joined');
    -- Every 5th person holds time-limited permission, some expiring within 60 days (for expiry reports).
    insert into public.right_to_work_checks (tenant_id, employee_id, check_type, checked_on, status, expiry_date, follow_up_date)
    values (r.tenant_id, r.id,
      case when abs(hashtext(r.id::text)) % 5 = 0 then 'online_share_code' else 'manual_document' end,
      r.start_date - 7,
      case when abs(hashtext(r.id::text)) % 5 = 0 then 'time_limited' else 'verified' end,
      case when abs(hashtext(r.id::text)) % 5 = 0 then current_date + (abs(hashtext(r.id::text)) % 120) end,
      case when abs(hashtext(r.id::text)) % 5 = 0 then current_date + (abs(hashtext(r.id::text)) % 120) - 28 end);
  end loop;

  -- ---------------------------------------------------------------- default privacy notice (DRAFT)
  insert into public.privacy_notices (tenant_id, version, title, body, published_at)
  values (null, 1, '[DRAFT — needs legal review] Employee privacy notice',
$notice$**DRAFT PLACEHOLDER — this wording must be reviewed by a qualified data protection lawyer before use.**

## Who we are
Your employer is the data controller for the personal data held in this portal. AbsorbHR (Absorb Employment Law Consultants Limited) provides the portal and acts as a data processor on your employer's behalf.

## What we hold and why
- **Identity and contact details** — to manage your employment and contact you.
- **Job, contract and pay details** — to perform your employment contract and meet legal obligations.
- **Right-to-work checks** — required by UK immigration law.
- **Absence and health information** — to manage absence, pay sick pay and support your wellbeing (special category data, handled with extra protection).
- **Emergency contacts** — to contact someone if you are taken ill or injured at work.

## Where it is stored
In the United Kingdom (London data centre), encrypted in transit and at rest.

## How long we keep it
In line with your employer's retention schedule. [Periods to be confirmed.]

## Your rights
You can ask to access, correct or (in some cases) erase your data, object to or restrict its use, and complain to the Information Commissioner's Office (ico.org.uk). Use the "Request a correction" option in the portal or contact your HR team.
$notice$, now());
end $$;
