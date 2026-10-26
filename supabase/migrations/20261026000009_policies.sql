-- =============================================================================
-- AbsorbHR Portal — Phase 3, part 2: policy library with read-and-acknowledge
--
-- Decisions (26 Oct 2026, AbsorbHR):
--   * When publishing a new version, HR chooses whether everyone must re-acknowledge.
--   * AbsorbHR keeps a library of TEMPLATE policies (tenant_id IS NULL) that client
--     HR teams can copy into their own library and adapt.
--
-- A policy's content is Markdown text, an attached PDF/Word file, or both.
-- Published versions are frozen; changes are made by publishing a new version.
-- =============================================================================

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,   -- null = AbsorbHR template
  title text not null check (length(trim(title)) between 1 and 200),
  category text not null default 'general' check (category in
    ('general', 'conduct', 'disciplinary_grievance', 'health_safety', 'absence_leave', 'equality',
     'data_protection', 'it_security', 'pay_benefits', 'other')),
  summary text check (length(summary) <= 500),
  audience text not null default 'all' check (audience in ('all', 'departments')),
  department_ids uuid[] not null default '{}',
  requires_acknowledgement boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  copied_from uuid references public.policies (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (audience = 'departments' or department_ids = '{}'),
  check (tenant_id is not null or audience = 'all'),
  unique (tenant_id, id)
);
create index policies_tenant_idx on public.policies (tenant_id, status);

create table public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  policy_id uuid not null references public.policies (id) on delete cascade,
  version integer not null check (version > 0),
  body text check (length(body) <= 200000),
  file_path text unique,
  file_name text check (length(file_name) <= 200),
  file_mime text,
  change_summary text check (length(change_summary) <= 500),
  requires_reacknowledgement boolean not null default true,
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (policy_id, version),
  check (body is not null or file_path is not null)
);

create table public.policy_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  policy_id uuid not null references public.policies (id) on delete cascade,
  policy_version_id uuid not null references public.policy_versions (id) on delete cascade,
  employee_id uuid not null,
  acknowledged_at timestamptz not null default now(),
  unique (policy_version_id, employee_id),
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
create index policy_ack_policy_idx on public.policy_acknowledgements (policy_id, employee_id);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
-- Is this employee in the policy's audience?
create function app.in_policy_audience(p_policy public.policies, p_employee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    where e.id = p_employee and e.tenant_id = p_policy.tenant_id and e.status <> 'leaver'
      and (p_policy.audience = 'all' or e.department_id = any (p_policy.department_ids))
  )
$$;

create function app.policy_visible(p_policy public.policies) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    case
      when p_policy.tenant_id is null then                          -- AbsorbHR template
        app.is_platform_admin() or (p_policy.status = 'published' and (app.is_hr() or app.support_tenant_id() is not null))
      else
        app.hr_access(p_policy.tenant_id)
        or (p_policy.status = 'published' and app.in_policy_audience(p_policy, app.my_employee_id()))
    end, false)
$$;

create function app.policy_manage(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(case when p_tenant is null then app.is_platform_admin() else app.hr_access(p_tenant) end, false)
$$;

-- The version an employee must have acknowledged: the latest published version that required (re)acknowledgement.
create function app.policy_required_version(p_policy uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select max(version) from public.policy_versions
  where policy_id = p_policy and published_at is not null and (requires_reacknowledgement or version = 1)
$$;

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------
-- Publish the latest draft version (or the first version) of a policy.
create function public.publish_policy_version(p_version uuid, p_require_reack boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ver public.policy_versions;
  v_policy public.policies;
begin
  select * into v_ver from public.policy_versions where id = p_version for update;
  select * into v_policy from public.policies where id = v_ver.policy_id;
  if v_ver is null or app.policy_manage(v_policy.tenant_id) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_ver.published_at is not null then
    raise exception 'already published' using errcode = '22023', hint = 'already_published';
  end if;
  if v_ver.version <> (select max(version) from public.policy_versions where policy_id = v_ver.policy_id) then
    raise exception 'only the newest version can be published' using errcode = '22023';
  end if;
  update public.policy_versions
    set published_at = now(), published_by = auth.uid(),
        requires_reacknowledgement = (v_ver.version = 1 or coalesce(p_require_reack, true))
    where id = p_version;
  update public.policies set status = 'published' where id = v_ver.policy_id and status = 'draft';
end $$;

create function public.acknowledge_policy(p_version uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ver public.policy_versions;
  v_policy public.policies;
  v_me uuid := app.my_employee_id();
begin
  select * into v_ver from public.policy_versions where id = p_version;
  select * into v_policy from public.policies where id = v_ver.policy_id;
  if v_ver is null or v_ver.published_at is null or v_policy.status <> 'published'
     or v_me is null or not app.in_policy_audience(v_policy, v_me) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_ver.version <> (select max(version) from public.policy_versions
                       where policy_id = v_policy.id and published_at is not null) then
    raise exception 'please read the latest version' using errcode = '22023', hint = 'not_latest';
  end if;
  insert into public.policy_acknowledgements (tenant_id, policy_id, policy_version_id, employee_id)
  values (v_policy.tenant_id, v_policy.id, p_version, v_me)
  on conflict (policy_version_id, employee_id) do nothing;
  perform app.write_audit(v_policy.tenant_id, 'acknowledge', 'policies', v_policy.id, v_me);
end $$;

-- Policies the caller should read, and whether they're up to date.
create function public.my_policies()
returns table (policy_id uuid, title text, category text, summary text, current_version integer,
               current_version_id uuid, requires_acknowledgement boolean, acknowledged boolean, acknowledged_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.title, p.category, p.summary, cv.version, cv.id, p.requires_acknowledgement,
    coalesce(not p.requires_acknowledgement or exists (
      select 1 from public.policy_acknowledgements a join public.policy_versions v on v.id = a.policy_version_id
      where a.policy_id = p.id and a.employee_id = app.my_employee_id() and v.version >= app.policy_required_version(p.id)), false),
    (select max(a.acknowledged_at) from public.policy_acknowledgements a where a.policy_id = p.id and a.employee_id = app.my_employee_id())
  from public.policies p
  cross join lateral (
    select v.id, v.version from public.policy_versions v
    where v.policy_id = p.id and v.published_at is not null order by v.version desc limit 1
  ) cv
  where p.tenant_id = app.current_tenant_id() and p.status = 'published'
    and app.in_policy_audience(p, app.my_employee_id())
$$;

-- HR tracker: everyone in the audience and whether they've acknowledged the required version.
create function public.policy_acknowledgement_status(p_policy uuid)
returns table (employee_id uuid, acknowledged boolean, acknowledged_at timestamptz, acknowledged_version integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_policy public.policies;
  v_required integer;
begin
  select * into v_policy from public.policies where id = p_policy;
  if v_policy is null or v_policy.tenant_id is null or app.hr_access(v_policy.tenant_id) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_required := app.policy_required_version(p_policy);
  return query
  select e.id,
    coalesce(max(v.version) >= v_required, false),
    max(a.acknowledged_at),
    max(v.version)
  from public.employees e
  left join public.policy_acknowledgements a on a.employee_id = e.id and a.policy_id = p_policy
  left join public.policy_versions v on v.id = a.policy_version_id
  where app.in_policy_audience(v_policy, e.id)
  group by e.id;
end $$;

-- Copy an AbsorbHR template into the caller's company as a draft.
create function public.copy_policy_template(p_template uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := coalesce(app.support_tenant_id(), app.current_tenant_id());
  v_tpl public.policies;
  v_ver public.policy_versions;
  v_new uuid;
begin
  select * into v_tpl from public.policies where id = p_template and tenant_id is null and status = 'published';
  if v_tpl is null or app.hr_access(v_tenant) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_ver from public.policy_versions
    where policy_id = p_template and published_at is not null order by version desc limit 1;
  insert into public.policies (tenant_id, title, category, summary, requires_acknowledgement, copied_from)
  values (v_tenant, v_tpl.title, v_tpl.category, v_tpl.summary, v_tpl.requires_acknowledgement, v_tpl.id)
  returning id into v_new;
  -- Template files are referenced, not duplicated; a client's own uploads go under their tenant folder.
  insert into public.policy_versions (tenant_id, policy_id, version, body, file_path, file_name, file_mime, change_summary)
  values (v_tenant, v_new, 1, v_ver.body, null, null, null,
    'Copied from the AbsorbHR template (version ' || v_ver.version || ')');
  return v_new;
end $$;

-- -----------------------------------------------------------------------------
-- Triggers, RLS, privileges
-- -----------------------------------------------------------------------------
create trigger touch before update on public.policies for each row execute function app.touch_updated_at();
create trigger audit after insert or update or delete on public.policies for each row execute function app.audit_row();
create trigger audit after insert or update or delete on public.policy_versions for each row execute function app.audit_row();

-- Version rows must belong to the same tenant as their policy.
create function app.policy_versions_validate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tenant_id is distinct from (select tenant_id from public.policies where id = new.policy_id) then
    raise exception 'version tenant mismatch' using errcode = '23514';
  end if;
  if new.file_path is not null and new.file_path not like coalesce(new.tenant_id::text, 'templates') || '/' || new.policy_id || '/%' then
    raise exception 'invalid file path' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger validate before insert or update on public.policy_versions
  for each row execute function app.policy_versions_validate();

alter table public.policies enable row level security;
alter table public.policy_versions enable row level security;
alter table public.policy_acknowledgements enable row level security;

create policy policies_select on public.policies for select to authenticated using (app.policy_visible(policies));
create policy policies_insert on public.policies for insert to authenticated with check (app.policy_manage(tenant_id));
create policy policies_update on public.policies for update to authenticated
  using (app.policy_manage(tenant_id)) with check (app.policy_manage(tenant_id));

create policy policy_versions_select on public.policy_versions for select to authenticated
  using (
    app.policy_manage(tenant_id)
    or (published_at is not null and app.policy_visible((select p from public.policies p where p.id = policy_id)))
  );
-- Drafts can be written by HR; published versions are frozen.
create policy policy_versions_insert on public.policy_versions for insert to authenticated
  with check (app.policy_manage(tenant_id) and published_at is null);
create policy policy_versions_update on public.policy_versions for update to authenticated
  using (app.policy_manage(tenant_id) and published_at is null)
  with check (app.policy_manage(tenant_id) and published_at is null);
create policy policy_versions_delete on public.policy_versions for delete to authenticated
  using (app.policy_manage(tenant_id) and published_at is null);

create policy policy_ack_select on public.policy_acknowledgements for select to authenticated
  using (app.hr_access(tenant_id) or app.is_self(employee_id));

revoke delete on public.policies from authenticated;
revoke insert, update, delete, truncate on public.policy_acknowledgements from authenticated;
revoke update (published_at, published_by) on public.policy_versions from authenticated;
revoke all on all tables in schema public from anon;
revoke all on all functions in schema app from public, anon;
grant execute on function app.in_policy_audience, app.policy_visible, app.policy_manage, app.policy_required_version to authenticated;

revoke execute on function public.publish_policy_version, public.acknowledge_policy, public.my_policies,
  public.policy_acknowledgement_status, public.copy_policy_template from public, anon;
grant execute on function public.publish_policy_version, public.acknowledge_policy, public.my_policies,
  public.policy_acknowledgement_status, public.copy_policy_template to authenticated;
