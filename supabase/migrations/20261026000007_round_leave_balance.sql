-- Present every leave balance figure to one decimal place (e.g. 12.0, not 12.0000000000000000).

create or replace function public.leave_balance(p_employee uuid, p_on date default current_date)
returns table (
  leave_year_start date, leave_year_end date, entitlement numeric, bank_holidays numeric,
  adjustments numeric, carried_over numeric, approved numeric, pending numeric, remaining numeric,
  policy_configured boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tenant uuid := (select tenant_id from public.employees where id = p_employee);
  v_ys date;
  v_bh_in boolean;
begin
  if not (app.is_self(p_employee) or app.is_manager_of(p_employee) or app.hr_access(v_tenant)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_ys := app.leave_year_start(v_tenant, p_on);
  select p.bank_holidays_in_allowance into v_bh_in from public.holiday_policies p where p.tenant_id = v_tenant;

  return query
  with r as (
    select
      coalesce(sum(lr.days) filter (where lr.status = 'approved'), 0) as approved,
      coalesce(sum(lr.days) filter (where lr.status = 'pending'), 0) as pending
    from public.leave_requests lr join public.leave_types lt on lt.id = lr.leave_type_id
    where lr.employee_id = p_employee and lr.leave_year_start = v_ys and lt.deducts_allowance
  ), a as (
    select
      coalesce(sum(la.days) filter (where la.kind = 'manual'), 0) as manual,
      -- Carried-over days that have expired only count to the extent they were used before expiry.
      coalesce(sum(
        case when la.kind <> 'carry_over' then 0
             when la.expires_on is null or la.expires_on >= current_date then la.days
             else least(la.days, (
               select coalesce(sum(lr.days), 0) from public.leave_requests lr
               join public.leave_types lt on lt.id = lr.leave_type_id
               where lr.employee_id = p_employee and lr.leave_year_start = v_ys and lt.deducts_allowance
                 and lr.status = 'approved' and lr.start_date <= la.expires_on))
        end), 0) as carried
    from public.leave_adjustments la where la.employee_id = p_employee and la.leave_year_start = v_ys
  ), b as (
    select app.holiday_entitlement(p_employee, v_ys) as ent,
           case when v_bh_in then app.bank_holidays_on_working_days(p_employee, v_ys) else 0 end as bh
  )
  select v_ys, (v_ys + interval '1 year' - interval '1 day')::date,
         round(b.ent, 1), round(b.bh, 1), round(a.manual, 1), round(a.carried, 1),
         round(r.approved, 1), round(r.pending, 1), round(b.ent - b.bh + a.manual + a.carried - r.approved, 1),
         (select hp.configured_at is not null from public.holiday_policies hp where hp.tenant_id = v_tenant)
  from b, a, r;
end $$;
