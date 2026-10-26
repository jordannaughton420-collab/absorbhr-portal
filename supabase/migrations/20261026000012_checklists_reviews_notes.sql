-- =============================================================================
-- AbsorbHR Portal — Phase 4, part 1: onboarding/offboarding checklists,
-- performance reviews and 1-to-1 notes.
--
-- Decisions (26 Oct 2026, AbsorbHR):
--   * Review scoring is chosen per company: written feedback only, or a 1–5 scale
--     with the company's own labels.
--   * 1-to-1 notes are shared with the employee by default; a manager can mark a
--     note private (author + HR only). Private notes remain disclosable under SAR.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Checklists
-- -----------------------------------------------------------------------------
create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default app.current_tenant_id() references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('onboarding', 'offboarding')),
  name text not null check (length(trim(name)) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (tenant_id, id)
);

create table public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  template_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 200),
  description text check (length(description) <= 1000),
  assignee text not null check (assignee in ('hr', 'manager', 'employee')),
  due_offset_days integer not null default 0 check (due_offset_days between -90 and 365),
  position integer not null default 0,
  foreign key (tenant_id, template_id) references public.checklist_templates (tenant_id, id) on delete cascade
);

create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  employee_id uuid not null,
  template_id uuid,
  kind text not null check (kind in ('onboarding', 'offboarding')),
  title text not null check (length(trim(title)) between 1 and 200),
  anchor_date date not null,             -- start date (onboarding) or leaving date (offboarding)
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  checklist_id uuid not null,
  employee_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 200),
  description text check (length(description) <= 1000),
  assignee text not null check (assignee in ('hr', 'manager', 'employee')),
  due_date date,
  position integer not null default 0,
  completed_at timestamptz,
  completed_by uuid,
  foreign key (tenant_id, checklist_id) references public.checklists (tenant_id, id) on delete cascade
);
create index checklist_items_checklist_idx on public.checklist_items (checklist_id, position);
create index checklist_items_open_idx on public.checklist_items (tenant_id, assignee) where completed_at is null;

-- Default templates for every company (existing and new).
create function app.seed_tenant_checklists(p_tenant uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_on uuid;
  v_off uuid;
begin
  if exists (select 1 from public.checklist_templates where tenant_id = p_tenant) then return; end if;
  insert into public.checklist_templates (tenant_id, kind, name) values (p_tenant, 'onboarding', 'Standard onboarding') returning id into v_on;
  insert into public.checklist_template_items (tenant_id, template_id, title, assignee, due_offset_days, position) values
    (p_tenant, v_on, 'Check right to work before the first day', 'hr', -7, 1),
    (p_tenant, v_on, 'Send contract / written statement of particulars (day one right)', 'hr', -7, 2),
    (p_tenant, v_on, 'Set up portal access and payroll details', 'hr', -3, 3),
    (p_tenant, v_on, 'Prepare equipment, uniform and workspace', 'manager', -1, 4),
    (p_tenant, v_on, 'Welcome, introductions and health & safety induction', 'manager', 0, 5),
    (p_tenant, v_on, 'Add emergency contacts and personal details', 'employee', 7, 6),
    (p_tenant, v_on, 'Read and confirm company policies', 'employee', 14, 7),
    (p_tenant, v_on, 'Schedule probation review meetings', 'manager', 14, 8);
  insert into public.checklist_templates (tenant_id, kind, name) values (p_tenant, 'offboarding', 'Standard offboarding') returning id into v_off;
  insert into public.checklist_template_items (tenant_id, template_id, title, assignee, due_offset_days, position) values
    (p_tenant, v_off, 'Confirm resignation / notice in writing', 'hr', -28, 1),
    (p_tenant, v_off, 'Plan handover of work', 'manager', -14, 2),
    (p_tenant, v_off, 'Calculate final pay and outstanding holiday', 'hr', -7, 3),
    (p_tenant, v_off, 'Offer an exit interview', 'hr', -5, 4),
    (p_tenant, v_off, 'Collect equipment, keys and uniform', 'manager', 0, 5),
    (p_tenant, v_off, 'Remove portal and system access', 'hr', 0, 6);
end $$;

create or replace function app.on_tenant_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.seed_tenant_leave(new.id);
  perform app.seed_tenant_checklists(new.id);
  return null;
end $$;
select app.seed_tenant_checklists(id) from public.tenants;

-- Who may tick off an item: HR any; the direct manager their items; the employee their own items.
create function app.checklist_item_allowed(p_item public.checklist_items) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    app.hr_access(p_item.tenant_id)
    or (p_item.assignee = 'manager' and app.is_manager_of(p_item.employee_id))
    or (p_item.assignee = 'employee' and app.is_self(p_item.employee_id)),
    false)
$$;

create function public.start_checklist(p_employee uuid, p_template uuid, p_anchor date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tpl public.checklist_templates;
  v_tenant uuid := (select tenant_id from public.employees where id = p_employee);
  v_id uuid;
begin
  select * into v_tpl from public.checklist_templates where id = p_template and tenant_id = v_tenant and active;
  if v_tpl is null or app.hr_access(v_tenant) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.checklists (tenant_id, employee_id, template_id, kind, title, anchor_date)
  values (v_tenant, p_employee, p_template, v_tpl.kind, v_tpl.name, p_anchor)
  returning id into v_id;
  insert into public.checklist_items (tenant_id, checklist_id, employee_id, title, description, assignee, due_date, position)
  select v_tenant, v_id, p_employee, i.title, i.description, i.assignee, p_anchor + i.due_offset_days, i.position
  from public.checklist_template_items i where i.template_id = p_template;
  return v_id;
end $$;

create function public.set_checklist_item(p_item uuid, p_done boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.checklist_items;
begin
  select * into v_item from public.checklist_items where id = p_item for update;
  if v_item is null or app.checklist_item_allowed(v_item) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.checklist_items
    set completed_at = case when p_done then now() end, completed_by = case when p_done then auth.uid() end
    where id = p_item;
end $$;

-- -----------------------------------------------------------------------------
-- Performance reviews
-- -----------------------------------------------------------------------------
alter table public.tenant_settings
  add column review_rating_scale boolean not null default false,
  add column review_rating_labels text[] not null default
    array['Below expectations', 'Partly meets expectations', 'Meets expectations', 'Exceeds expectations', 'Outstanding']
    check (cardinality(review_rating_labels) = 5);

create table public.review_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default app.current_tenant_id() references public.tenants (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  period_start date not null,
  period_end date not null,
  self_due date,
  manager_due date,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (period_end >= period_start),
  unique (tenant_id, id)
);

create table public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  employee_id uuid not null,
  cycle_id uuid,
  reviewer_id uuid,                        -- employee id of the reviewing manager
  title text not null check (length(trim(title)) between 1 and 160),
  status text not null default 'self_assessment'
    check (status in ('self_assessment', 'manager_review', 'discussion', 'completed')),
  self_assessment text check (length(self_assessment) <= 20000),
  self_submitted_at timestamptz,
  manager_assessment text check (length(manager_assessment) <= 20000),
  rating smallint check (rating between 1 and 5),
  objectives text check (length(objectives) <= 20000),
  manager_submitted_at timestamptz,
  employee_comments text check (length(employee_comments) <= 5000),
  employee_signed_at timestamptz,
  manager_signed_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade,
  foreign key (tenant_id, cycle_id) references public.review_cycles (tenant_id, id) on delete set null (cycle_id)
);
create index reviews_employee_idx on public.performance_reviews (employee_id, created_at desc);
create unique index reviews_one_per_cycle on public.performance_reviews (cycle_id, employee_id) where cycle_id is not null;

-- Reviewer = HR or the employee's direct line manager (never the employee themself).
create function app.review_manage(p_review public.performance_reviews) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(not app.is_self(p_review.employee_id)
    and (app.hr_access(p_review.tenant_id) or app.is_manager_of(p_review.employee_id)), false)
$$;

create function public.start_review(p_employee uuid, p_title text, p_cycle uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_emp public.employees;
  v_id uuid;
begin
  select * into v_emp from public.employees where id = p_employee;
  if v_emp is null or app.is_self(p_employee)
     or not (app.hr_access(v_emp.tenant_id) or app.is_manager_of(p_employee)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.performance_reviews (tenant_id, employee_id, cycle_id, reviewer_id, title)
  values (v_emp.tenant_id, p_employee, p_cycle, v_emp.manager_id, left(trim(p_title), 160))
  returning id into v_id;
  return v_id;
end $$;

-- HR: create a review for every active employee who has a line manager.
create function public.launch_review_cycle(p_cycle uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_cycle public.review_cycles;
  v_count integer;
begin
  select * into v_cycle from public.review_cycles where id = p_cycle;
  if v_cycle is null or app.hr_access(v_cycle.tenant_id) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.performance_reviews (tenant_id, employee_id, cycle_id, reviewer_id, title)
  select e.tenant_id, e.id, v_cycle.id, e.manager_id, v_cycle.name
  from public.employees e
  where e.tenant_id = v_cycle.tenant_id and e.status = 'active' and e.manager_id is not null
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create function public.save_self_assessment(p_review uuid, p_text text, p_submit boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_r public.performance_reviews;
begin
  select * into v_r from public.performance_reviews where id = p_review for update;
  if v_r is null or not app.is_self(v_r.employee_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_r.self_submitted_at is not null then
    raise exception 'already submitted' using errcode = '22023', hint = 'locked';
  end if;
  update public.performance_reviews
    set self_assessment = nullif(trim(p_text), ''),
        self_submitted_at = case when p_submit then now() end,
        status = case when p_submit and status = 'self_assessment' then 'manager_review' else status end
    where id = p_review;
end $$;

create function public.save_manager_review(
  p_review uuid, p_assessment text, p_rating smallint, p_objectives text, p_submit boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_r public.performance_reviews;
  v_scale boolean;
begin
  select * into v_r from public.performance_reviews where id = p_review for update;
  if v_r is null or app.review_manage(v_r) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_r.manager_submitted_at is not null then
    raise exception 'already submitted' using errcode = '22023', hint = 'locked';
  end if;
  select review_rating_scale into v_scale from public.tenant_settings where tenant_id = v_r.tenant_id;
  if p_rating is not null and v_scale is not true then
    raise exception 'this company does not use ratings' using errcode = '22023';
  end if;
  update public.performance_reviews
    set manager_assessment = nullif(trim(p_assessment), ''), rating = p_rating,
        objectives = nullif(trim(p_objectives), ''),
        manager_submitted_at = case when p_submit then now() end,
        status = case when p_submit then 'discussion' else status end
    where id = p_review;
end $$;

-- Both sides sign once the manager's part is shared; the review completes when both have signed.
create function public.sign_review(p_review uuid, p_comments text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_r public.performance_reviews;
begin
  select * into v_r from public.performance_reviews where id = p_review for update;
  if v_r is null or v_r.status <> 'discussion' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if app.is_self(v_r.employee_id) then
    update public.performance_reviews
      set employee_signed_at = now(), employee_comments = nullif(trim(p_comments), '')
      where id = p_review;
  elsif app.review_manage(v_r) then
    update public.performance_reviews set manager_signed_at = now() where id = p_review;
  else
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.performance_reviews set status = 'completed'
    where id = p_review and employee_signed_at is not null and manager_signed_at is not null;
end $$;

-- What the employee sees: the manager's section only once it has been shared with them.
create function public.my_review(p_review uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_r public.performance_reviews;
  v_shared boolean;
begin
  select * into v_r from public.performance_reviews where id = p_review;
  if v_r is null or not app.is_self(v_r.employee_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_shared := v_r.status in ('discussion', 'completed');
  return jsonb_build_object(
    'id', v_r.id, 'title', v_r.title, 'status', v_r.status, 'cycle_id', v_r.cycle_id,
    'self_assessment', v_r.self_assessment, 'self_submitted_at', v_r.self_submitted_at,
    'manager_assessment', case when v_shared then v_r.manager_assessment end,
    'rating', case when v_shared then v_r.rating end,
    'objectives', case when v_shared then v_r.objectives end,
    'manager_submitted_at', v_r.manager_submitted_at,
    'employee_comments', v_r.employee_comments, 'employee_signed_at', v_r.employee_signed_at,
    'manager_signed_at', v_r.manager_signed_at, 'created_at', v_r.created_at);
end $$;

create function public.my_reviews()
returns table (id uuid, title text, status text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.title, r.status, r.created_at from public.performance_reviews r
  where r.employee_id = app.my_employee_id() order by r.created_at desc
$$;

-- -----------------------------------------------------------------------------
-- 1-to-1 notes
-- -----------------------------------------------------------------------------
create table public.one_to_one_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  employee_id uuid not null,
  author_id uuid not null default auth.uid(),
  meeting_date date not null,
  notes text not null check (length(trim(notes)) between 1 and 20000),
  actions text check (length(actions) <= 5000),
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
create index one_to_one_employee_idx on public.one_to_one_notes (employee_id, meeting_date desc);

-- -----------------------------------------------------------------------------
-- Triggers, RLS, privileges
-- -----------------------------------------------------------------------------
create trigger touch before update on public.checklist_templates for each row execute function app.touch_updated_at();
create trigger touch before update on public.review_cycles for each row execute function app.touch_updated_at();
create trigger touch before update on public.performance_reviews for each row execute function app.touch_updated_at();
create trigger touch before update on public.one_to_one_notes for each row execute function app.touch_updated_at();
create trigger audit after insert or update or delete on public.checklists for each row execute function app.audit_row('employee_id');
create trigger audit after insert or update or delete on public.checklist_items for each row execute function app.audit_row('employee_id');
create trigger audit after insert or update or delete on public.performance_reviews for each row execute function app.audit_row('employee_id');
create trigger audit after insert or update or delete on public.one_to_one_notes for each row execute function app.audit_row('employee_id');
create trigger audit after insert or update or delete on public.checklist_templates for each row execute function app.audit_row();
create trigger audit after insert or update or delete on public.review_cycles for each row execute function app.audit_row();

alter table public.checklist_templates enable row level security;
alter table public.checklist_template_items enable row level security;
alter table public.checklists enable row level security;
alter table public.checklist_items enable row level security;
alter table public.review_cycles enable row level security;
alter table public.performance_reviews enable row level security;
alter table public.one_to_one_notes enable row level security;

create policy checklist_templates_rw on public.checklist_templates for all to authenticated
  using (app.hr_access(tenant_id)) with check (app.hr_access(tenant_id));
create policy checklist_template_items_rw on public.checklist_template_items for all to authenticated
  using (app.hr_access(tenant_id)) with check (app.hr_access(tenant_id));

create policy checklists_select on public.checklists for select to authenticated
  using (app.hr_access(tenant_id) or app.is_self(employee_id) or app.is_manager_of(employee_id));
create policy checklists_delete on public.checklists for delete to authenticated using (app.hr_access(tenant_id));
create policy checklist_items_select on public.checklist_items for select to authenticated
  using (app.hr_access(tenant_id) or app.is_self(employee_id) or app.is_manager_of(employee_id));
-- HR can add, edit or remove individual tasks; ticking off goes through set_checklist_item().
create policy checklist_items_hr_write on public.checklist_items for all to authenticated
  using (app.hr_access(tenant_id)) with check (app.hr_access(tenant_id));

create policy review_cycles_select on public.review_cycles for select to authenticated using (app.member_of(tenant_id));
create policy review_cycles_write on public.review_cycles for all to authenticated
  using (app.hr_access(tenant_id)) with check (app.hr_access(tenant_id));

-- Employees read their own review only through my_review(), which hides the manager's draft.
create policy reviews_select on public.performance_reviews for select to authenticated
  using (app.review_manage(performance_reviews));

create policy notes_select on public.one_to_one_notes for select to authenticated
  using (
    author_id = (select auth.uid())
    or app.hr_access(tenant_id)
    or (not is_private and (app.is_self(employee_id) or app.is_manager_of(employee_id)))
  );
create policy notes_insert on public.one_to_one_notes for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and tenant_id = (select e.tenant_id from public.employees e where e.id = employee_id)
    and not app.is_self(employee_id)
    and (app.hr_access(tenant_id) or app.is_manager_of(employee_id))
  );
create policy notes_update on public.one_to_one_notes for update to authenticated
  using (author_id = (select auth.uid()) and (app.hr_access(tenant_id) or app.is_manager_of(employee_id)))
  with check (author_id = (select auth.uid()));
create policy notes_delete on public.one_to_one_notes for delete to authenticated
  using (author_id = (select auth.uid()) or app.hr_access(tenant_id));

revoke insert, update, delete on public.checklists from authenticated;
revoke insert, update, delete, truncate on public.performance_reviews from authenticated;
-- Notes can't be moved to another person or author: only these columns are editable.
revoke update on public.one_to_one_notes from authenticated;
grant update (meeting_date, notes, actions, is_private) on public.one_to_one_notes to authenticated;
revoke all on all tables in schema public from anon;
revoke all on all functions in schema app from public, anon;
grant execute on function app.checklist_item_allowed, app.review_manage to authenticated;
grant delete on public.checklists to authenticated;

revoke execute on function public.start_checklist, public.set_checklist_item, public.start_review,
  public.launch_review_cycle, public.save_self_assessment, public.save_manager_review, public.sign_review,
  public.my_review, public.my_reviews from public, anon;
grant execute on function public.start_checklist, public.set_checklist_item, public.start_review,
  public.launch_review_cycle, public.save_self_assessment, public.save_manager_review, public.sign_review,
  public.my_review, public.my_reviews to authenticated;
