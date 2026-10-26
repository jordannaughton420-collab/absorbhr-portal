-- =============================================================================
-- DEMO CONTENT — Phase 5 data protection tools for Brightwater Bakery (all fake).
-- Three leavers (one due for anonymisation, one due soon, one recent) and a sample breach.
-- Safe to re-run: replaces Brightwater's Phase 5 demo rows only.
-- =============================================================================
do $$
declare
  v_bw uuid := (select id from public.tenants where name = 'Brightwater Bakery Ltd');
  u_admin uuid := (select id from auth.users where email = 'brightwater.admin@example.com');
  v_prod uuid;
  v_sales uuid;
  v_id uuid;
begin
  if v_bw is null then return; end if;
  -- Exports: queue their files for deletion, then remove the records.
  insert into public.cleanup_queue (kind, bucket, path)
    select 'storage', 'sar-exports', storage_path from public.sar_exports where tenant_id = v_bw and storage_path is not null;
  delete from public.sar_exports where tenant_id = v_bw;
  delete from public.data_breaches where tenant_id = v_bw;
  delete from public.erasure_log where tenant_id = v_bw;
  delete from public.employees where tenant_id = v_bw and (employee_number like 'DEMO-L%' or anonymised_at is not null);
  update public.tenant_settings set retention_years = 6 where tenant_id = v_bw;

  select id into v_prod from public.departments where tenant_id = v_bw and name = 'Production';
  select id into v_sales from public.departments where tenant_id = v_bw and name <> 'Production' order by name limit 1;

  insert into public.employees (tenant_id, employee_number, first_name, last_name, job_title, department_id, start_date, end_date, status, contract_type)
  values
    (v_bw, 'DEMO-L1', 'Ollie', 'Oldfield', 'Delivery Driver', v_sales, '2015-03-02', current_date - interval '6 years 3 months', 'leaver', 'permanent'),
    (v_bw, 'DEMO-L2', 'Petra', 'Pastwell', 'Baker', v_prod, '2016-09-05', current_date - interval '6 years' + interval '30 days', 'leaver', 'permanent'),
    (v_bw, 'DEMO-L3', 'Quinn', 'Quitley', 'Kitchen Assistant', v_prod, '2024-01-08', current_date - interval '3 months', 'leaver', 'fixed_term');
  update public.employees set fixed_term_end_date = end_date where tenant_id = v_bw and employee_number = 'DEMO-L3';

  -- A little history for the leaver who is due, so anonymising visibly removes something.
  select id into v_id from public.employees where tenant_id = v_bw and employee_number = 'DEMO-L1';
  insert into public.employee_personal (employee_id, tenant_id, personal_email, postcode) values (v_id, v_bw, 'ollie.demo@example.com', 'BS1 4XX');
  insert into public.emergency_contacts (tenant_id, employee_id, name, relationship, phone) values (v_bw, v_id, 'Pat Oldfield', 'Parent', '07700900123');
  insert into public.salary_history (tenant_id, employee_id, effective_date, amount, reason) values (v_bw, v_id, '2015-03-02', 21000, 'Starting salary');

  insert into public.data_breaches (tenant_id, title, discovered_at, occurred_at, description, data_types, people_affected,
    risk_level, ico_reportable, decision_reason, actions_taken, status, created_by)
  values (v_bw, 'Rota with home phone numbers left in staff room', now() - interval '20 hours', now() - interval '2 days',
    'A printed rota showing staff home phone numbers was pinned in the staff room, visible to visiting contractors. FAKE DEMO RECORD.',
    'Names and personal phone numbers', 14, 'low', null, null,
    'Removed the same morning. Rotas will now show first names only.', 'open', u_admin);
end $$;
