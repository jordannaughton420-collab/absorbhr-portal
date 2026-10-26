-- Proves role-based access inside one company, MFA enforcement, special-category
-- protection, AbsorbHR support-session limits and the append-only audit log.
select plan(33);

insert into tests.results (line) select unnest(array[
  -- Employees: own data only
  is(tests.count_as(tests.id('a_emp1'), 'aal1', 'select 1 from employees'), 1::bigint,
     'Employee sees only their own employee record'),
  is(tests.count_as(tests.id('a_emp1'), 'aal1', format('select 1 from employee_personal where employee_id = %L', tests.id('a_emp2'))), 0::bigint,
     'Employee cannot see a colleague''s personal details'),
  is(tests.count_as(tests.id('a_emp1'), 'aal1', 'select 1 from employee_personal'), 1::bigint,
     'Employee can see their own personal details'),
  is(tests.count_as(tests.id('a_emp1'), 'aal1', format('select 1 from emergency_contacts where employee_id = %L', tests.id('a_emp2'))), 0::bigint,
     'Employee cannot see a colleague''s emergency contacts'),
  is(tests.count_as(tests.id('a_emp1'), 'aal1', 'select 1 from salary_history'), 0::bigint,
     'Employee cannot see salary data by default (company setting off)'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1',
       format('update employees set job_title = %L where id = %L', 'CEO', tests.id('a_emp1'))), 'rows:0',
     'Employee cannot change their own job record'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1',
       format('update employee_personal set town = %L where employee_id = %L', 'Testville', tests.id('a_emp1'))), 'rows:1',
     'Employee can update their own personal details'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1',
       format('insert into emergency_contacts (employee_id, name, phone) values (%L, %L, %L)', tests.id('a_emp2'), 'X', '0770000000')), 'error:42501',
     'Employee cannot add an emergency contact to a colleague'),
  is(tests.exec_as(tests.id('a_emp1'), 'aal1',
       format('update memberships set role = %L where user_id = %L', 'client_admin', tests.id('a_emp1'))), 'rows:0',
     'Employee cannot promote themselves to admin'),
  is(tests.count_as(tests.id('a_emp1'), 'aal1', 'select 1 from employee_directory'), 7::bigint,
     'Employee can see the company directory (minimal fields)'),

  -- Line managers: direct reports only
  is(tests.count_as(tests.id('a_mgr'), 'aal1', 'select 1 from employees'), 4::bigint,
     'Line manager sees themself plus their 3 direct reports'),
  is(tests.count_as(tests.id('a_mgr'), 'aal1', format('select 1 from employees where id = %L', tests.id('a_emp4'))), 0::bigint,
     'Line manager cannot see an indirect report (report''s report)'),
  is(tests.count_as(tests.id('a_mgr'), 'aal1', format('select 1 from emergency_contacts where employee_id = %L', tests.id('a_emp1'))), 1::bigint,
     'Line manager can see a direct report''s emergency contact'),
  is(tests.count_as(tests.id('a_mgr'), 'aal1', format('select 1 from salary_history where employee_id = %L', tests.id('a_emp1'))), 0::bigint,
     'Line manager cannot see a direct report''s salary'),
  is(tests.count_as(tests.id('a_mgr'), 'aal1', format('select 1 from employee_personal where employee_id = %L', tests.id('a_emp1'))), 0::bigint,
     'Line manager cannot see a direct report''s home address'),

  -- HR roles need MFA
  is(tests.count_as(tests.id('a_hr'), 'aal1', 'select 1 from employees'), 1::bigint,
     'HR manager WITHOUT MFA sees only their own record'),
  is(tests.count_as(tests.id('a_hr'), 'aal2', 'select 1 from employees'), 7::bigint,
     'HR manager WITH MFA sees every employee in their company'),
  is(tests.count_as(tests.id('a_hr'), 'aal2', 'select 1 from salary_history'), 7::bigint,
     'HR manager with MFA can see salaries'),
  is(tests.count_as(tests.id('a_hr'), 'aal2', 'select 1 from audit_log'), 0::bigint,
     'HR manager cannot read the audit log (Client Admin only)'),
  ok(tests.count_as(tests.id('a_admin'), 'aal2', 'select 1 from audit_log') > 0,
     'Client Admin with MFA can read their company''s audit log'),

  -- Special-category data (encrypted)
  is(tests.value_as(tests.id('a_emp1'), 'aal1',
       format('select set_employee_sensitive(%L, %L::jsonb)::text', tests.id('a_emp1'), '{"ethnicity":"Prefer not to say"}')), '',
     'Employee can record their own diversity data'),
  is(tests.value_as(tests.id('a_emp1'), 'aal1',
       format('select get_employee_sensitive(%L) ->> %L', tests.id('a_emp1'), 'ethnicity')), 'Prefer not to say',
     'Employee can read back their own diversity data'),
  is(tests.value_as(tests.id('a_mgr'), 'aal1', format('select get_employee_sensitive(%L)::text', tests.id('a_emp1'))), 'error:42501',
     'Line manager cannot read a report''s special-category data'),
  is(tests.value_as(tests.id('a_hr'), 'aal2',
       format('select get_employee_sensitive(%L) ->> %L', tests.id('a_emp1'), 'ethnicity')), 'Prefer not to say',
     'HR manager with MFA can read special-category data'),
  is(tests.value_as(tests.id('b_admin'), 'aal2', format('select get_employee_sensitive(%L)::text', tests.id('a_emp1'))), 'error:42501',
     'Another company''s admin cannot read special-category data'),
  is(tests.exec_as(tests.id('a_admin'), 'aal2', 'select * from employee_sensitive'), 'error:42501',
     'Nobody can read the encrypted table directly'),
  isnt((select payload::text from employee_sensitive where employee_id = tests.id('a_emp1')), '{"ethnicity": "Prefer not to say"}',
     'Special-category data is stored encrypted, not as plain text'),

  -- AbsorbHR support access
  is(tests.count_as(tests.id('p_admin'), 'aal2', 'select 1 from employees'), 0::bigint,
     'AbsorbHR admin sees no client employees without a support session'),
  is(tests.value_as(tests.id('p_admin'), 'aal1',
       format('select start_support_session(%L, %L)::text', tests.id('tenant_a'), 'Testing support access')), 'error:42501',
     'AbsorbHR admin cannot open a support session without MFA')
]);

-- Open a support session, then check what it can and cannot reach.
select tests.value_as(tests.id('p_admin'), 'aal2',
  format('select start_support_session(%L, %L)::text', tests.id('tenant_a'), 'Investigating client ticket'));

insert into tests.results (line) select unnest(array[
  is(tests.count_as(tests.id('p_admin'), 'aal2', format('select 1 from employees where tenant_id = %L', tests.id('tenant_a'))), 7::bigint,
     'During a support session AbsorbHR can see that company''s employees'),
  is(tests.value_as(tests.id('p_admin'), 'aal2', format('select get_employee_sensitive(%L)::text', tests.id('a_emp1'))), 'error:42501',
     'Support sessions can never read special-category data'),
  is(tests.exec_as(tests.id('a_admin'), 'aal2', 'update audit_log set action = ''view'''), 'error:42501',
     'Audit log cannot be edited, even by a Client Admin'),
  throws_ok('delete from audit_log', '42501', 'audit_log is append-only',
     'Audit log cannot be deleted, even by the database owner')
]);

insert into tests.results (line) select * from finish();
select line from tests.results order by n;
rollback;
