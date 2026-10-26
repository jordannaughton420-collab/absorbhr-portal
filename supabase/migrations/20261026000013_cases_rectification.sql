-- =============================================================================
-- AbsorbHR Portal — Phase 4, part 2: disciplinary & grievance cases, and
-- employee correction (rectification) requests.
--
-- Decision (26 Oct 2026, AbsorbHR): cases are HR ONLY.
--   * Visible to MFA-verified HR in the client's own company — never to line managers,
--     the employee, other companies, or AbsorbHR support sessions.
--   * An HR user can never see a case where they are the subject.
--   * Case summaries and event details are encrypted; every opening of a case is
--     written to the audit log by the same function that decrypts it.
-- =============================================================================

create function app.case_access(p_tenant uuid, p_employee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_tenant = app.current_tenant_id() and app.is_hr()
                  and app.support_tenant_id() is null and not app.is_self(p_employee), false)
$$;

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  employee_id uuid not null,
  reference text not null check (reference ~ '^[A-Z]{3}-[0-9]{4}-[0-9]{3,}$'),
  case_type text not null check (case_type in ('disciplinary', 'grievance', 'capability', 'other')),
  status text not null default 'open' check (status in ('open', 'investigation', 'hearing', 'outcome', 'appeal', 'closed')),
  opened_on date not null default current_date,
  closed_on date,
  outcome text check (outcome in ('no_action', 'informal_action', 'first_written_warning', 'final_written_warning',
    'dismissal', 'upheld', 'partially_upheld', 'not_upheld', 'withdrawn', 'other')),
  payload bytea not null,                 -- encrypted {summary}
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (tenant_id, reference),
  unique (tenant_id, id),
  check (closed_on is null or closed_on >= opened_on),
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
create index cases_tenant_idx on public.cases (tenant_id, status);

create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  case_id uuid not null,
  event_date date not null,
  event_type text not null check (event_type in ('note', 'investigation_meeting', 'hearing', 'letter_sent',
    'outcome', 'appeal', 'other')),
  payload bytea not null,                 -- encrypted {details}
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, case_id) references public.cases (tenant_id, id) on delete cascade
);
create index case_events_case_idx on public.case_events (case_id, event_date);

create function public.open_case(p_employee uuid, p_type text, p_summary text, p_opened_on date default current_date)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := (select tenant_id from public.employees where id = p_employee);
  v_prefix text := case p_type when 'disciplinary' then 'DIS' when 'grievance' then 'GRV' when 'capability' then 'CAP' else 'OTH' end;
  v_year text := to_char(coalesce(p_opened_on, current_date), 'YYYY');
  v_n integer;
  v_id uuid;
begin
  if app.case_access(v_tenant, p_employee) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_summary, ''))) < 5 or length(p_summary) > 10000 then
    raise exception 'summary required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('case-ref-' || v_tenant::text));
  select count(*) + 1 into v_n from public.cases where tenant_id = v_tenant and reference like v_prefix || '-' || v_year || '-%';
  insert into public.cases (tenant_id, employee_id, reference, case_type, opened_on, payload)
  values (v_tenant, p_employee, v_prefix || '-' || v_year || '-' || lpad(v_n::text, 3, '0'), p_type,
    coalesce(p_opened_on, current_date), app.encrypt_json(jsonb_build_object('summary', trim(p_summary))))
  returning id into v_id;
  return v_id;
end $$;

create function public.update_case(
  p_case uuid, p_status text, p_outcome text, p_summary text, p_closed_on date
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_case public.cases;
begin
  select * into v_case from public.cases where id = p_case for update;
  if v_case is null or app.case_access(v_case.tenant_id, v_case.employee_id) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_summary, ''))) < 5 or length(p_summary) > 10000 then
    raise exception 'summary required' using errcode = '22023';
  end if;
  update public.cases
    set status = p_status, outcome = p_outcome,
        closed_on = case when p_status = 'closed' then coalesce(p_closed_on, current_date) else null end,
        payload = app.encrypt_json(jsonb_build_object('summary', trim(p_summary)))
    where id = p_case;
end $$;

create function public.add_case_event(p_case uuid, p_date date, p_type text, p_details text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_case public.cases;
  v_id uuid;
begin
  select * into v_case from public.cases where id = p_case;
  if v_case is null or app.case_access(v_case.tenant_id, v_case.employee_id) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_details, ''))) < 2 or length(p_details) > 20000 then
    raise exception 'details required' using errcode = '22023';
  end if;
  insert into public.case_events (tenant_id, case_id, event_date, event_type, payload)
  values (v_case.tenant_id, p_case, p_date, p_type, app.encrypt_json(jsonb_build_object('details', trim(p_details))))
  returning id into v_id;
  return v_id;
end $$;

-- Opening a case decrypts it and records the view in the audit log in one step.
create function public.get_case(p_case uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_case public.cases;
begin
  select * into v_case from public.cases where id = p_case;
  if v_case is null or app.case_access(v_case.tenant_id, v_case.employee_id) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform app.write_audit(v_case.tenant_id, 'view', 'cases', v_case.id, v_case.employee_id);
  return jsonb_build_object(
    'id', v_case.id, 'employee_id', v_case.employee_id, 'reference', v_case.reference, 'case_type', v_case.case_type,
    'status', v_case.status, 'opened_on', v_case.opened_on, 'closed_on', v_case.closed_on, 'outcome', v_case.outcome,
    'summary', app.decrypt_json(v_case.payload) ->> 'summary', 'created_at', v_case.created_at,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'event_date', e.event_date, 'event_type', e.event_type,
        'details', app.decrypt_json(e.payload) ->> 'details', 'created_by', e.created_by, 'created_at', e.created_at)
        order by e.event_date, e.created_at)
      from public.case_events e where e.case_id = v_case.id), '[]'::jsonb));
end $$;

-- -----------------------------------------------------------------------------
-- Case documents: stored in the documents table with category 'case_document'.
-- -----------------------------------------------------------------------------
alter table public.documents drop constraint documents_category_check;
alter table public.documents add constraint documents_category_check check (category in
  ('contract', 'letter', 'certificate', 'right_to_work', 'fit_note', 'meeting_notes', 'other', 'case_document'));
alter table public.documents add column case_id uuid references public.cases (id) on delete cascade;
alter table public.documents add constraint documents_case_link check ((category = 'case_document') = (case_id is not null));
alter table public.documents add constraint documents_case_hr_only check (category <> 'case_document' or visibility = 'hr_only');

create or replace function app.document_upload_allowed(p_employee uuid, p_category text, p_visibility text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    case
      when p_category = 'case_document' then
        p_visibility = 'hr_only' and app.case_access((select tenant_id from public.employees where id = p_employee), p_employee)
      else
        (app.hr_access((select tenant_id from public.employees where id = p_employee))
           and (p_category <> 'fit_note' or app.support_tenant_id() is null))
        or (app.is_self(p_employee)
            and p_category in ('certificate', 'fit_note', 'right_to_work', 'other')
            and p_visibility in ('hr_and_employee', 'everyone'))
        or (app.is_manager_of(p_employee)
            and p_category in ('certificate', 'meeting_notes', 'fit_note', 'other')
            and p_visibility in ('hr_and_manager', 'everyone'))
    end, false)
$$;

create or replace function app.document_visible(p_doc public.documents) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    case
      when p_doc.category = 'case_document' then app.case_access(p_doc.tenant_id, p_doc.employee_id)
      else
        (app.hr_access(p_doc.tenant_id) and (p_doc.category <> 'fit_note' or app.support_tenant_id() is null))
        or (p_doc.status = 'available' and (
             (app.is_self(p_doc.employee_id) and p_doc.visibility in ('hr_and_employee', 'everyone'))
             or (app.is_manager_of(p_doc.employee_id) and p_doc.visibility in ('hr_and_manager', 'everyone'))))
        or (p_doc.status = 'uploading' and p_doc.uploaded_by = auth.uid())
    end, false)
$$;

-- HR edits/deletes of case documents follow case access, not general HR access.
drop policy documents_update on public.documents;
drop policy documents_delete on public.documents;
create function app.document_manage(p_tenant uuid, p_employee uuid, p_category text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(case
    when p_category = 'case_document' then app.case_access(p_tenant, p_employee)
    when p_category = 'fit_note' then app.hr_access(p_tenant) and app.support_tenant_id() is null
    else app.hr_access(p_tenant)
  end, false)
$$;
create policy documents_update on public.documents for update to authenticated
  using (app.document_manage(tenant_id, employee_id, category))
  with check (app.document_manage(tenant_id, employee_id, category)
              and (category <> 'case_document' or visibility = 'hr_only'));
create policy documents_delete on public.documents for delete to authenticated
  using (app.document_manage(tenant_id, employee_id, category));

-- -----------------------------------------------------------------------------
-- Rectification (Art. 16): employees ask HR to correct something.
-- -----------------------------------------------------------------------------
create table public.rectification_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  employee_id uuid not null,
  area text not null check (area in ('personal_details', 'employment', 'pay', 'absence', 'documents', 'other')),
  details text not null check (length(trim(details)) between 5 and 2000),
  status text not null default 'open' check (status in ('open', 'resolved', 'declined')),
  resolution_note text check (length(resolution_note) <= 2000),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (status = 'open' or resolution_note is not null),
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
create index rectification_tenant_idx on public.rectification_requests (tenant_id, status, created_at);

-- -----------------------------------------------------------------------------
-- Triggers, RLS, privileges
-- -----------------------------------------------------------------------------
create trigger touch before update on public.cases for each row execute function app.touch_updated_at();
create trigger touch before update on public.rectification_requests for each row execute function app.touch_updated_at();
create trigger audit after insert or update or delete on public.cases for each row execute function app.audit_row('employee_id');
create trigger audit after insert or update or delete on public.case_events for each row execute function app.audit_row();
create trigger audit after insert or update or delete on public.rectification_requests for each row execute function app.audit_row('employee_id');

alter table public.cases enable row level security;
alter table public.case_events enable row level security;
alter table public.rectification_requests enable row level security;

-- Case list metadata (reference, type, status, dates). The summary column is encrypted.
create policy cases_select on public.cases for select to authenticated using (app.case_access(tenant_id, employee_id));
-- case_events: no policies; read via get_case() only.

create policy rect_select on public.rectification_requests for select to authenticated
  using (app.is_self(employee_id) or app.hr_access(tenant_id));
create policy rect_insert on public.rectification_requests for insert to authenticated
  with check (app.is_self(employee_id) and status = 'open'
              and tenant_id = (select e.tenant_id from public.employees e where e.id = employee_id));
create policy rect_update on public.rectification_requests for update to authenticated
  using (app.hr_access(tenant_id)) with check (app.hr_access(tenant_id));

revoke all on public.case_events from authenticated, anon;
revoke insert, update, delete, truncate on public.cases from authenticated;
revoke update on public.rectification_requests from authenticated;
grant update (status, resolution_note, resolved_by, resolved_at) on public.rectification_requests to authenticated;
revoke delete on public.rectification_requests from authenticated;
revoke all on all tables in schema public from anon;
revoke all on all functions in schema app from public, anon;
grant execute on function app.case_access, app.document_manage to authenticated;

revoke execute on function public.open_case, public.update_case, public.add_case_event, public.get_case from public, anon;
grant execute on function public.open_case, public.update_case, public.add_case_event, public.get_case to authenticated;
