-- =============================================================================
-- Phase 5: GDPR tools and notifications.
--   * Retention: leavers become due for anonymisation after the company's retention period
--     (6 years minimum). HR reviews the list and confirms each one; a hold blocks it (e.g. a live claim).
--   * Anonymisation: deletes everything about the person except a statistical shell
--     (department, location, dates, contract type) and the audit log.
--   * Subject Access Request: one function returns everything held about an employee,
--     decrypted, for HR to export, review and release.
--   * Breach log: Client Admins record breaches; AbsorbHR admins can read every company's log.
--   * Email outbox: database triggers queue short notifications (no personal detail beyond a
--     link); the web server sends them through Resend.
--   * Clean-up queue: storage files and login accounts the server must remove.
--   * Daily housekeeping job, plus a 5-minute job that asks the web server to send queued email.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Retention settings and holds
-- -----------------------------------------------------------------------------
alter table public.tenant_settings
  add column retention_years smallint not null default 6 check (retention_years between 6 and 20);

alter table public.employees
  add column retention_hold_reason text check (length(retention_hold_reason) between 5 and 500);

create table public.erasure_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null,               -- the anonymised shell keeps this id
  performed_by uuid not null default auth.uid(),
  performed_at timestamptz not null default now(),
  early boolean not null default false,   -- before the retention period ended (Art. 17 request)
  reason text check (length(reason) <= 1000)
);
create index erasure_log_tenant_idx on public.erasure_log (tenant_id, performed_at desc);

-- Files and login accounts for the server to remove (it holds the storage and auth admin keys).
create table public.cleanup_queue (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('storage', 'auth_user')),
  bucket text,
  path text,
  user_id uuid,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  check ((kind = 'storage' and bucket is not null and path is not null) or (kind = 'auth_user' and user_id is not null))
);

-- -----------------------------------------------------------------------------
-- Subject Access Request exports
-- -----------------------------------------------------------------------------
create table public.sar_exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  employee_id uuid not null,
  requested_by uuid not null default auth.uid(),
  request_received_on date not null,
  created_at timestamptz not null default now(),
  status text not null default 'review' check (status in ('review', 'released', 'expired')),
  needs_redaction_review boolean not null default false,   -- contains cases or private notes
  storage_path text,
  size_bytes integer,
  released_by uuid,
  released_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 days',
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
create index sar_exports_tenant_idx on public.sar_exports (tenant_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sar-exports', 'sar-exports', false, 52428800, array['application/zip'])
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Breach log
-- -----------------------------------------------------------------------------
create table public.data_breaches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default app.current_tenant_id() references public.tenants (id) on delete cascade,
  title text not null check (length(trim(title)) between 3 and 160),
  discovered_at timestamptz not null,
  occurred_at timestamptz,
  description text not null check (length(trim(description)) between 10 and 5000),
  data_types text check (length(data_types) <= 1000),
  people_affected integer check (people_affected >= 0),
  special_category boolean not null default false,
  risk_level text not null default 'unknown' check (risk_level in ('unknown', 'low', 'medium', 'high')),
  ico_reportable boolean,                  -- null = not yet decided
  decision_reason text check (length(decision_reason) <= 2000),
  ico_reported_at timestamptz,
  ico_reference text check (length(ico_reference) <= 60),
  individuals_informed_at timestamptz,
  actions_taken text check (length(actions_taken) <= 5000),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (occurred_at is null or occurred_at <= discovered_at)
);
create index data_breaches_tenant_idx on public.data_breaches (tenant_id, discovered_at desc);

-- -----------------------------------------------------------------------------
-- Email outbox (server-side only)
-- -----------------------------------------------------------------------------
create table public.email_outbox (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  template text not null check (template ~ '^[a-z_]{3,40}$'),
  link text not null check (link ~ '^/[A-Za-z0-9/_#?=&-]*$' and length(link) <= 200),
  dedupe_key text unique,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts integer not null default 0,
  error_code text check (length(error_code) <= 60),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_outbox_queued_idx on public.email_outbox (created_at) where status = 'queued';

create function app.user_of(p_employee uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select e.user_id from public.employees e
  join public.memberships m on m.user_id = e.user_id and m.tenant_id = e.tenant_id and m.is_active
  where e.id = p_employee and e.anonymised_at is null
$$;

create function app.hr_users(p_tenant uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.user_id from public.memberships m
  where m.tenant_id = p_tenant and m.is_active and m.role in ('client_admin', 'hr_manager')
$$;

create function app.enqueue_email(p_tenant uuid, p_user uuid, p_template text, p_link text, p_dedupe text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Never email someone about their own action.
  if p_user is null or p_user is not distinct from auth.uid() then return; end if;
  insert into public.email_outbox (tenant_id, user_id, template, link, dedupe_key)
  values (p_tenant, p_user, p_template, p_link, p_dedupe)
  on conflict (dedupe_key) do nothing;
end $$;

-- Leave: request -> direct manager (or HR if none); decision -> employee.
create function app.notify_leave() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_mgr uuid := (select manager_id from public.employees where id = new.employee_id);
  u uuid;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    if app.user_of(v_mgr) is not null then
      perform app.enqueue_email(new.tenant_id, app.user_of(v_mgr), 'leave_requested', '/leave/approvals');
    else
      for u in select app.hr_users(new.tenant_id) loop
        perform app.enqueue_email(new.tenant_id, u, 'leave_requested', '/leave/approvals');
      end loop;
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('approved', 'declined') then
    perform app.enqueue_email(new.tenant_id, app.user_of(new.employee_id), 'leave_' || new.status, '/leave');
  end if;
  return null;
end $$;
create trigger notify after insert or update of status on public.leave_requests
  for each row execute function app.notify_leave();

-- Reviews: started -> employee; self-assessment submitted -> reviewer; shared -> employee.
create function app.notify_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_link text := '/reviews/' || new.id;
begin
  if tg_op = 'INSERT' then
    perform app.enqueue_email(new.tenant_id, app.user_of(new.employee_id), 'review_started', v_link);
  elsif old.status is distinct from new.status then
    if new.status = 'manager_review' then
      perform app.enqueue_email(new.tenant_id, app.user_of(new.reviewer_id), 'review_self_submitted', v_link);
    elsif new.status = 'discussion' then
      perform app.enqueue_email(new.tenant_id, app.user_of(new.employee_id), 'review_shared', v_link);
    end if;
  end if;
  return null;
end $$;
create trigger notify after insert or update of status on public.performance_reviews
  for each row execute function app.notify_review();

-- Correction requests: new -> HR; answered -> employee.
create function app.notify_rectification() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  u uuid;
begin
  if tg_op = 'INSERT' then
    for u in select app.hr_users(new.tenant_id) loop
      perform app.enqueue_email(new.tenant_id, u, 'correction_requested', '/requests');
    end loop;
  elsif old.status = 'open' and new.status <> 'open' then
    perform app.enqueue_email(new.tenant_id, app.user_of(new.employee_id), 'correction_answered', '/requests');
  end if;
  return null;
end $$;
create trigger notify after insert or update of status on public.rectification_requests
  for each row execute function app.notify_rectification();

-- Checklists: started -> the employee and their manager.
create function app.notify_checklist() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.enqueue_email(new.tenant_id, app.user_of(new.employee_id), 'checklist_started', '/checklists/' || new.id);
  perform app.enqueue_email(new.tenant_id,
    app.user_of((select manager_id from public.employees where id = new.employee_id)),
    'checklist_started', '/checklists/' || new.id);
  return null;
end $$;
create trigger notify after insert on public.checklists
  for each row execute function app.notify_checklist();

-- -----------------------------------------------------------------------------
-- Retention: who is due, holds, anonymisation
-- -----------------------------------------------------------------------------
create function public.retention_due()
returns table (employee_id uuid, name text, department text, end_date date, due_on date, is_due boolean, hold_reason text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.first_name || ' ' || e.last_name, d.name, e.end_date,
    (e.end_date + make_interval(years => s.retention_years))::date,
    (e.end_date + make_interval(years => s.retention_years))::date <= current_date,
    e.retention_hold_reason
  from public.employees e
  join public.tenant_settings s on s.tenant_id = e.tenant_id
  left join public.departments d on d.id = e.department_id
  where e.tenant_id = app.current_tenant_id() and app.is_hr() and app.support_tenant_id() is null
    and e.status = 'leaver' and e.anonymised_at is null and e.end_date is not null
    and (e.end_date + make_interval(years => s.retention_years))::date <= current_date + 60
  order by 5
$$;

create function public.set_retention_hold(p_employee uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := (select tenant_id from public.employees where id = p_employee);
begin
  if app.case_access(v_tenant, p_employee) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.employees set retention_hold_reason = nullif(trim(p_reason), '') where id = p_employee;
end $$;

create function public.anonymise_employee(p_employee uuid, p_reason text default null, p_early boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_emp public.employees;
  v_years smallint;
  r record;
begin
  select * into v_emp from public.employees where id = p_employee for update;
  -- HR (MFA) in the same company, never in a support session, never about themselves.
  if v_emp is null or app.case_access(v_emp.tenant_id, p_employee) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_emp.anonymised_at is not null then
    raise exception 'already anonymised' using errcode = '22023', hint = 'already_done';
  end if;
  if v_emp.retention_hold_reason is not null then
    raise exception 'record is on hold' using errcode = '22023', hint = 'on_hold';
  end if;
  select retention_years into v_years from public.tenant_settings where tenant_id = v_emp.tenant_id;

  if p_early then
    -- Erasure before the retention period ends: Client Admin only, with a recorded reason.
    if app.is_client_admin() is not true then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    if length(trim(coalesce(p_reason, ''))) < 20 then
      raise exception 'reason required' using errcode = '22023', hint = 'reason';
    end if;
    if v_emp.status not in ('leaver', 'pre_start') then
      raise exception 'only leavers or people who never started' using errcode = '22023', hint = 'not_leaver';
    end if;
  elsif v_emp.status <> 'leaver' or v_emp.end_date is null
        or (v_emp.end_date + make_interval(years => v_years))::date > current_date then
    raise exception 'retention period has not ended' using errcode = '22023', hint = 'not_due';
  end if;

  -- Files: queue removal from storage, then drop the records.
  for r in select storage_path from public.documents where employee_id = p_employee and storage_path is not null loop
    insert into public.cleanup_queue (kind, bucket, path) values ('storage', 'employee-documents', r.storage_path);
  end loop;
  for r in select storage_path from public.sar_exports where employee_id = p_employee and storage_path is not null loop
    insert into public.cleanup_queue (kind, bucket, path) values ('storage', 'sar-exports', r.storage_path);
  end loop;

  delete from public.documents where employee_id = p_employee;
  delete from public.sar_exports where employee_id = p_employee;
  delete from public.cases where employee_id = p_employee;                 -- events cascade
  delete from public.one_to_one_notes where employee_id = p_employee;
  delete from public.performance_reviews where employee_id = p_employee;
  delete from public.checklists where employee_id = p_employee;            -- items cascade
  delete from public.rectification_requests where employee_id = p_employee;
  delete from public.return_to_work_forms where employee_id = p_employee;
  delete from public.sickness_details where employee_id = p_employee;
  delete from public.sickness_absences where employee_id = p_employee;
  delete from public.leave_requests where employee_id = p_employee;
  delete from public.leave_adjustments where employee_id = p_employee;
  delete from public.policy_acknowledgements where employee_id = p_employee;
  delete from public.employee_sensitive where employee_id = p_employee;
  delete from public.employee_personal where employee_id = p_employee;
  delete from public.emergency_contacts where employee_id = p_employee;
  delete from public.salary_history where employee_id = p_employee;
  delete from public.employment_history where employee_id = p_employee;
  delete from public.right_to_work_checks where employee_id = p_employee;

  -- Login: remove access now; the server deletes the account itself.
  if v_emp.user_id is not null then
    delete from public.privacy_notice_acknowledgements where user_id = v_emp.user_id and tenant_id = v_emp.tenant_id;
    delete from public.email_outbox where user_id = v_emp.user_id;
    update public.employees set user_id = null where id = p_employee;
    delete from public.memberships where user_id = v_emp.user_id and tenant_id = v_emp.tenant_id;
    insert into public.cleanup_queue (kind, user_id) values ('auth_user', v_emp.user_id);
  end if;

  -- Keep a statistical shell for headcount/turnover history.
  update public.employees set
    first_name = 'Former', last_name = 'employee', preferred_name = null, work_email = null,
    employee_number = null, job_title = null, manager_id = null, continuous_service_date = null,
    probation_end_date = null, fixed_term_end_date = null, retention_hold_reason = null, anonymised_at = now()
  where id = p_employee;
  update public.employees set manager_id = null where manager_id = p_employee;

  insert into public.erasure_log (tenant_id, employee_id, early, reason)
  values (v_emp.tenant_id, p_employee, p_early, nullif(trim(p_reason), ''));
  perform app.write_audit(v_emp.tenant_id, 'anonymise', 'employees', p_employee, p_employee, null,
    jsonb_build_object('early', p_early));
end $$;

-- -----------------------------------------------------------------------------
-- Subject Access Request: everything about one employee, decrypted. Audited as an export.
-- -----------------------------------------------------------------------------
create function public.sar_data(p_employee uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_emp public.employees;
  v_out jsonb;
begin
  select * into v_emp from public.employees where id = p_employee;
  if v_emp is null or app.case_access(v_emp.tenant_id, p_employee) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'company', (select name from public.tenants where id = v_emp.tenant_id),
    'employment_record', (select to_jsonb(x) - 'tenant_id' - 'retention_hold_reason' from (
        select e.*, d.name as department, l.name as location,
          (select m.first_name || ' ' || m.last_name from public.employees m where m.id = e.manager_id) as line_manager
        from public.employees e left join public.departments d on d.id = e.department_id
        left join public.locations l on l.id = e.location_id where e.id = p_employee) x),
    'portal_account', (select jsonb_build_object('email', u.email, 'role', m.role, 'active', m.is_active,
        'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at)
        from auth.users u left join public.memberships m on m.user_id = u.id and m.tenant_id = v_emp.tenant_id
        where u.id = v_emp.user_id),
    'personal_details', (select to_jsonb(p) - 'tenant_id' from public.employee_personal p where p.employee_id = p_employee),
    'emergency_contacts', coalesce((select jsonb_agg(to_jsonb(c) - 'tenant_id' order by c.created_at) from public.emergency_contacts c where c.employee_id = p_employee), '[]'),
    'employment_history', coalesce((select jsonb_agg(to_jsonb(h) - 'tenant_id' order by h.effective_date) from public.employment_history h where h.employee_id = p_employee), '[]'),
    'salary_history', coalesce((select jsonb_agg(to_jsonb(s) - 'tenant_id' order by s.effective_date) from public.salary_history s where s.employee_id = p_employee), '[]'),
    'right_to_work_checks', coalesce((select jsonb_agg(to_jsonb(r) - 'tenant_id' order by r.checked_on) from public.right_to_work_checks r where r.employee_id = p_employee), '[]'),
    'equality_monitoring', (select app.decrypt_json(s.payload) from public.employee_sensitive s where s.employee_id = p_employee),
    'leave_requests', coalesce((select jsonb_agg((to_jsonb(l) - 'tenant_id') || jsonb_build_object('leave_type', t.name) order by l.start_date)
        from public.leave_requests l join public.leave_types t on t.id = l.leave_type_id where l.employee_id = p_employee), '[]'),
    'leave_adjustments', coalesce((select jsonb_agg(to_jsonb(a) - 'tenant_id' order by a.created_at) from public.leave_adjustments a where a.employee_id = p_employee), '[]'),
    'sickness', coalesce((select jsonb_agg((to_jsonb(s) - 'tenant_id') || jsonb_build_object(
          'details', (select app.decrypt_json(d.payload) from public.sickness_details d where d.absence_id = s.id),
          'return_to_work', (select (to_jsonb(w) - 'payload' - 'tenant_id') || coalesce(app.decrypt_json(w.payload), '{}')
                             from public.return_to_work_forms w where w.absence_id = s.id)) order by s.start_date)
        from public.sickness_absences s where s.employee_id = p_employee), '[]'),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'category', d.category,
          'file_name', d.file_name, 'mime_type', d.mime_type, 'visibility', d.visibility, 'uploaded_at', d.created_at,
          'storage_path', d.storage_path, 'case_document', d.case_id is not null) order by d.created_at)
        from public.documents d where d.employee_id = p_employee and d.status = 'available'), '[]'),
    'policy_acknowledgements', coalesce((select jsonb_agg(jsonb_build_object('policy', p.title, 'version', v.version,
          'acknowledged_at', a.acknowledged_at) order by a.acknowledged_at)
        from public.policy_acknowledgements a join public.policies p on p.id = a.policy_id
        join public.policy_versions v on v.id = a.policy_version_id where a.employee_id = p_employee), '[]'),
    'privacy_notice_acknowledgements', coalesce((select jsonb_agg(jsonb_build_object('version', n.version, 'acknowledged_at', a.acknowledged_at))
        from public.privacy_notice_acknowledgements a join public.privacy_notices n on n.id = a.notice_id
        where a.user_id = v_emp.user_id and v_emp.user_id is not null), '[]'),
    'checklists', coalesce((select jsonb_agg(jsonb_build_object('title', c.title, 'kind', c.kind, 'date', c.anchor_date,
          'tasks', (select jsonb_agg(jsonb_build_object('task', i.title, 'for', i.assignee, 'due', i.due_date, 'completed_at', i.completed_at) order by i.position)
                    from public.checklist_items i where i.checklist_id = c.id)))
        from public.checklists c where c.employee_id = p_employee), '[]'),
    'performance_reviews', coalesce((select jsonb_agg(to_jsonb(r) - 'tenant_id' order by r.created_at) from public.performance_reviews r where r.employee_id = p_employee), '[]'),
    'one_to_one_notes', coalesce((select jsonb_agg(jsonb_build_object('meeting_date', n.meeting_date, 'notes', n.notes,
          'actions', n.actions, 'private', n.is_private,
          'author', coalesce((select a.first_name || ' ' || a.last_name from public.employees a where a.user_id = n.author_id), 'HR')) order by n.meeting_date)
        from public.one_to_one_notes n where n.employee_id = p_employee), '[]'),
    'cases', coalesce((select jsonb_agg(jsonb_build_object('reference', c.reference, 'type', c.case_type, 'stage', c.status,
          'opened_on', c.opened_on, 'closed_on', c.closed_on, 'outcome', c.outcome, 'summary', app.decrypt_json(c.payload) ->> 'summary',
          'timeline', (select jsonb_agg(jsonb_build_object('date', e.event_date, 'type', e.event_type,
                         'details', app.decrypt_json(e.payload) ->> 'details') order by e.event_date)
                       from public.case_events e where e.case_id = c.id)) order by c.opened_on)
        from public.cases c where c.employee_id = p_employee), '[]'),
    'correction_requests', coalesce((select jsonb_agg(to_jsonb(q) - 'tenant_id' order by q.created_at) from public.rectification_requests q where q.employee_id = p_employee), '[]'),
    'who_accessed_this_record', coalesce((select jsonb_agg(jsonb_build_object('when', a.occurred_at, 'action', a.action,
          'record_type', a.entity, 'by', case a.actor_kind when 'support' then 'AbsorbHR support' when 'system' then 'System'
            else coalesce((select x.first_name || ' ' || x.last_name from public.employees x where x.user_id = a.actor_user_id), 'Company administrator') end)
          order by a.occurred_at)
        from public.audit_log a where a.subject_employee_id = p_employee and a.tenant_id = v_emp.tenant_id), '[]')
  ) into v_out;

  perform app.write_audit(v_emp.tenant_id, 'export', 'sar', p_employee, p_employee);
  return v_out;
end $$;

-- -----------------------------------------------------------------------------
-- RLS and privileges
-- -----------------------------------------------------------------------------
alter table public.erasure_log enable row level security;
alter table public.cleanup_queue enable row level security;
alter table public.sar_exports enable row level security;
alter table public.data_breaches enable row level security;
alter table public.email_outbox enable row level security;

-- erasure_log: HR reads; written only by anonymise_employee().
create policy erasure_log_select on public.erasure_log for select to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_hr() and app.support_tenant_id() is null);
revoke all on public.erasure_log from anon, authenticated;
grant select on public.erasure_log to authenticated;

-- cleanup_queue and email_outbox: server (service role) only. No policies.
revoke all on public.cleanup_queue, public.email_outbox from anon, authenticated;

-- sar_exports: HR (same rules as cases) creates, reads and releases.
create policy sar_exports_select on public.sar_exports for select to authenticated
  using (app.case_access(tenant_id, employee_id));
create policy sar_exports_insert on public.sar_exports for insert to authenticated
  with check (app.case_access(tenant_id, employee_id) and requested_by = auth.uid() and status = 'review');
create policy sar_exports_update on public.sar_exports for update to authenticated
  using (app.case_access(tenant_id, employee_id)) with check (app.case_access(tenant_id, employee_id));
revoke all on public.sar_exports from anon, authenticated;
grant select, insert on public.sar_exports to authenticated;
grant update (status, released_by, released_at, storage_path, size_bytes) on public.sar_exports to authenticated;

-- data_breaches: Client Admins of the company (not support sessions); AbsorbHR admins read all.
create policy data_breaches_select on public.data_breaches for select to authenticated
  using ((tenant_id = app.current_tenant_id() and app.is_client_admin() and app.support_tenant_id() is null)
         or app.is_platform_admin());
create policy data_breaches_insert on public.data_breaches for insert to authenticated
  with check (tenant_id = app.current_tenant_id() and app.is_client_admin() and app.support_tenant_id() is null
              and created_by = auth.uid());
create policy data_breaches_update on public.data_breaches for update to authenticated
  using (tenant_id = app.current_tenant_id() and app.is_client_admin() and app.support_tenant_id() is null)
  with check (tenant_id = app.current_tenant_id() and app.is_client_admin() and app.support_tenant_id() is null);
revoke all on public.data_breaches from anon, authenticated;
grant select, insert on public.data_breaches to authenticated;
grant update (title, discovered_at, occurred_at, description, data_types, people_affected, special_category,
  risk_level, ico_reportable, decision_reason, ico_reported_at, ico_reference, individuals_informed_at,
  actions_taken, status) on public.data_breaches to authenticated;

create trigger touch before update on public.data_breaches for each row execute function app.touch_updated_at();
create trigger audit after insert or update or delete on public.data_breaches for each row execute function app.audit_row();
create trigger audit after insert or update or delete on public.sar_exports for each row execute function app.audit_row();

revoke execute on function app.user_of, app.hr_users, app.enqueue_email from public, anon, authenticated;
revoke execute on function public.retention_due, public.set_retention_hold, public.anonymise_employee, public.sar_data
  from public, anon;
grant execute on function public.retention_due, public.set_retention_hold, public.anonymise_employee, public.sar_data
  to authenticated;

-- -----------------------------------------------------------------------------
-- Scheduled jobs
-- -----------------------------------------------------------------------------
create function app.daily_housekeeping() returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  u uuid;
begin
  -- Right-to-work permissions expiring within 30 days (latest check per active employee) -> HR.
  for r in
    select distinct on (c.employee_id) c.id, c.tenant_id, c.employee_id, c.expiry_date
    from public.right_to_work_checks c join public.employees e on e.id = c.employee_id
    where e.status <> 'leaver' and e.anonymised_at is null
    order by c.employee_id, c.checked_on desc
  loop
    if r.expiry_date is not null and r.expiry_date <= current_date + 30 then
      for u in select app.hr_users(r.tenant_id) loop
        perform app.enqueue_email(r.tenant_id, u, 'rtw_expiring', '/employees/' || r.employee_id,
          'rtw:' || r.id || ':' || u);
      end loop;
    end if;
  end loop;

  -- Leavers whose retention period has ended -> HR, once per person.
  for r in
    select e.id, e.tenant_id from public.employees e join public.tenant_settings s on s.tenant_id = e.tenant_id
    where e.status = 'leaver' and e.anonymised_at is null and e.retention_hold_reason is null
      and e.end_date is not null and (e.end_date + make_interval(years => s.retention_years))::date <= current_date
  loop
    for u in select app.hr_users(r.tenant_id) loop
      perform app.enqueue_email(r.tenant_id, u, 'retention_due', '/privacy-tools', 'retention:' || r.id || ':' || u);
    end loop;
  end loop;

  -- Uploads started but never finished (older than a day).
  insert into public.cleanup_queue (kind, bucket, path)
    select 'storage', 'employee-documents', storage_path from public.documents
    where status = 'uploading' and created_at < now() - interval '1 day' and storage_path is not null;
  delete from public.documents where status = 'uploading' and created_at < now() - interval '1 day';

  -- Expired SAR exports: delete the file, keep the record.
  insert into public.cleanup_queue (kind, bucket, path)
    select 'storage', 'sar-exports', storage_path from public.sar_exports
    where expires_at < now() and storage_path is not null;
  update public.sar_exports set status = 'expired', storage_path = null where expires_at < now() and status <> 'expired';

  -- Old email records (they hold no personal detail beyond the recipient, but keep it short).
  delete from public.email_outbox where status <> 'queued' and created_at < now() - interval '90 days';
end $$;
revoke all on function app.daily_housekeeping from public, anon, authenticated;

-- Asks the web server to send queued email and process the clean-up queue.
-- Does nothing until both Vault secrets 'app_base_url' and 'cron_secret' exist.
create function app.ping_dispatcher() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret');
begin
  if v_url is null or v_secret is null then return; end if;
  if not exists (select 1 from public.email_outbox where status = 'queued')
     and not exists (select 1 from public.cleanup_queue) then
    return;
  end if;
  perform net.http_post(
    url := v_url || '/api/cron/dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb);
end $$;
revoke all on function app.ping_dispatcher from public, anon, authenticated;

select cron.schedule('daily-housekeeping', '43 2 * * *', $$select app.daily_housekeeping()$$);
select cron.schedule('dispatch-email', '*/5 * * * *', $$select app.ping_dispatcher()$$);
