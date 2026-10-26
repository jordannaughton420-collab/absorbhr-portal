-- Proves one client company can never read or change another company's data.
select plan(16);

insert into tests.results (line) select unnest(array[
  is(tests.count_as(tests.id('a_admin'), 'aal2', 'select 1 from employees'), 7::bigint,
     'Company A admin sees all 7 of their own employees'),
  is(tests.count_as(tests.id('a_admin'), 'aal2', format('select 1 from employees where tenant_id = %L', tests.id('tenant_b'))), 0::bigint,
     'Company A admin sees zero Company B employees'),
  is(tests.count_as(tests.id('b_admin'), 'aal2', format('select 1 from employees where tenant_id = %L', tests.id('tenant_a'))), 0::bigint,
     'Company B admin sees zero Company A employees'),
  is(tests.count_as(tests.id('b_admin'), 'aal2', format('select 1 from employee_personal where tenant_id = %L', tests.id('tenant_a'))), 0::bigint,
     'Company B admin sees zero Company A personal details'),
  is(tests.count_as(tests.id('b_admin'), 'aal2', format('select 1 from salary_history where tenant_id = %L', tests.id('tenant_a'))), 0::bigint,
     'Company B admin sees zero Company A salaries'),
  is(tests.count_as(tests.id('b_admin'), 'aal2', format('select 1 from emergency_contacts where tenant_id = %L', tests.id('tenant_a'))), 0::bigint,
     'Company B admin sees zero Company A emergency contacts'),
  is(tests.count_as(tests.id('b_admin'), 'aal2', format('select 1 from right_to_work_checks where tenant_id = %L', tests.id('tenant_a'))), 0::bigint,
     'Company B admin sees zero Company A right-to-work checks'),
  is(tests.count_as(tests.id('b_admin'), 'aal2', format('select 1 from memberships where tenant_id = %L', tests.id('tenant_a'))), 0::bigint,
     'Company B admin sees zero Company A user accounts'),
  is(tests.count_as(tests.id('b_admin'), 'aal2', format('select 1 from audit_log where tenant_id = %L', tests.id('tenant_a'))), 0::bigint,
     'Company B admin sees zero Company A audit entries'),
  is(tests.count_as(tests.id('b_emp'), 'aal1', format('select 1 from employee_directory where tenant_id = %L', tests.id('tenant_a'))), 0::bigint,
     'Company B employee sees nobody from Company A in the directory'),
  is(tests.count_as(tests.id('a_emp1'), 'aal1', 'select 1 from tenants'), 1::bigint,
     'An employee can see only their own company record'),
  is(tests.exec_as(tests.id('a_admin'), 'aal2',
       format('insert into employees (tenant_id, first_name, last_name, start_date) values (%L, %L, %L, %L)',
              tests.id('tenant_b'), 'Sneaky', 'Insert', '2024-01-01')), 'error:42501',
     'Company A admin cannot create an employee inside Company B'),
  is(tests.exec_as(tests.id('a_admin'), 'aal2',
       format('update employees set job_title = %L where id = %L', 'Hacked', tests.id('b_emp'))), 'rows:0',
     'Company A admin cannot edit a Company B employee'),
  is(tests.exec_as(tests.id('a_admin'), 'aal2',
       format('insert into departments (tenant_id, name) values (%L, %L)', tests.id('tenant_b'), 'Sneaky')), 'error:42501',
     'Company A admin cannot add a department to Company B'),
  is(tests.exec_as(tests.id('a_admin'), 'aal2',
       format('update employees set manager_id = %L where id = %L', tests.id('b_emp'), tests.id('a_emp1'))), 'error:23503',
     'An employee cannot be given a manager from another company'),
  is(tests.exec_anon('select * from employees'), 'error:42501',
     'Someone who is not signed in cannot read any employee data')
]);

insert into tests.results (line) select * from finish();
select line from tests.results order by n;
rollback;
