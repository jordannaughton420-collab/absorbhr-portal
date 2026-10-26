-- =============================================================================
-- AbsorbHR Portal — Phase 1, part 3: special-category data, privacy notices,
-- rate limiting.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Column encryption key, generated inside the database and held in Supabase Vault.
-- It never appears in source code, environment variables or the browser.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'pii_encryption_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'pii_encryption_key',
      'Encrypts special-category columns (health, diversity, case notes). Do not delete: data becomes unreadable.'
    );
  end if;
end $$;

create function app.pii_key() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'pii_encryption_key'
$$;

create function app.encrypt_json(p_data jsonb) returns bytea
language sql security definer set search_path = '' as $$
  select extensions.pgp_sym_encrypt(p_data::text, app.pii_key(), 'cipher-algo=aes256')
$$;

create function app.decrypt_json(p_data bytea) returns jsonb
language sql stable security definer set search_path = '' as $$
  select extensions.pgp_sym_decrypt(p_data, app.pii_key())::jsonb
$$;

-- Special category data may only be decrypted by the employee themself or MFA-verified HR
-- in their own company. AbsorbHR support sessions are deliberately NOT included.
create function app.special_category_access(p_employee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_self(p_employee) or exists (
    select 1 from public.employees e
    where e.id = p_employee and e.tenant_id = app.current_tenant_id() and app.is_hr()
  )
$$;

-- -----------------------------------------------------------------------------
-- Voluntary equality & diversity monitoring (special category, Art. 9 UK GDPR).
-- Off unless the company switches it on. Every answer optional.
-- -----------------------------------------------------------------------------
alter table public.tenant_settings
  add column diversity_monitoring_enabled boolean not null default false;

create table public.employee_sensitive (
  employee_id uuid primary key,
  tenant_id uuid not null,
  payload bytea not null,                         -- pgcrypto AES-256 encrypted JSON
  updated_at timestamptz not null default now(),
  updated_by uuid,
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
comment on table public.employee_sensitive is 'Encrypted special-category data. No direct access: use get_/set_employee_sensitive().';

alter table public.employee_sensitive enable row level security;
-- Intentionally no policies: direct table access is denied to every API role.
revoke all on public.employee_sensitive from anon, authenticated;

create trigger audit after insert or update or delete on public.employee_sensitive
  for each row execute function app.audit_row('employee_id');

create function public.get_employee_sensitive(p_employee uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.employee_sensitive;
begin
  if not app.special_category_access(p_employee) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_row from public.employee_sensitive where employee_id = p_employee;
  perform app.write_audit(
    (select tenant_id from public.employees where id = p_employee),
    'view', 'employee_sensitive', p_employee, p_employee);
  return case when v_row is null then null else app.decrypt_json(v_row.payload) end;
end $$;

create function public.set_employee_sensitive(p_employee uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := (select tenant_id from public.employees where id = p_employee);
  v_allowed_keys text[] := array['ethnicity', 'disability', 'religion_or_belief', 'sexual_orientation', 'gender_identity'];
  v_key text;
begin
  if not app.special_category_access(p_employee) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not coalesce((select diversity_monitoring_enabled from public.tenant_settings where tenant_id = v_tenant), false) then
    raise exception 'diversity monitoring is not enabled for this company' using errcode = '22023';
  end if;
  if jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid data' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_data) loop
    if v_key <> all (v_allowed_keys) or jsonb_typeof(p_data -> v_key) <> 'string'
       or length(p_data ->> v_key) > 100 then
      raise exception 'invalid field' using errcode = '22023';
    end if;
  end loop;

  if p_data = '{}'::jsonb then
    delete from public.employee_sensitive where employee_id = p_employee;    -- consent withdrawn
  else
    insert into public.employee_sensitive (employee_id, tenant_id, payload, updated_by)
    values (p_employee, v_tenant, app.encrypt_json(p_data), auth.uid())
    on conflict (employee_id) do update
      set payload = excluded.payload, updated_at = now(), updated_by = auth.uid();
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Privacy notices (versioned) and employee acknowledgements
-- tenant_id null = AbsorbHR default notice used when a company has not published its own.
-- -----------------------------------------------------------------------------
create table public.privacy_notices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  version integer not null check (version > 0),
  title text not null check (length(trim(title)) between 1 and 200),
  body text not null check (length(body) between 1 and 100000),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique nulls not distinct (tenant_id, version)
);

create table public.privacy_notice_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  notice_id uuid not null references public.privacy_notices (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  unique (notice_id, user_id)
);
create index privacy_ack_tenant_idx on public.privacy_notice_acknowledgements (tenant_id, notice_id);

create trigger touch before update on public.privacy_notices for each row execute function app.touch_updated_at();
create trigger audit after insert or update or delete on public.privacy_notices for each row execute function app.audit_row();

alter table public.privacy_notices enable row level security;
alter table public.privacy_notice_acknowledgements enable row level security;

create policy privacy_notices_select on public.privacy_notices for select to authenticated
  using (
    (published_at is not null and (tenant_id is null or app.member_of(tenant_id)))
    or app.hr_access(tenant_id)
    or (select app.is_platform_admin())
  );
-- Published versions are frozen; changes require a new version.
create policy privacy_notices_insert on public.privacy_notices for insert to authenticated
  with check (app.hr_access(tenant_id) or (tenant_id is null and (select app.is_platform_admin())));
create policy privacy_notices_update on public.privacy_notices for update to authenticated
  using (published_at is null and (app.hr_access(tenant_id) or (tenant_id is null and (select app.is_platform_admin()))))
  with check (app.hr_access(tenant_id) or (tenant_id is null and (select app.is_platform_admin())));

create policy privacy_ack_select on public.privacy_notice_acknowledgements for select to authenticated
  using (user_id = (select auth.uid()) or app.hr_access(tenant_id));
revoke insert, update, delete on public.privacy_notice_acknowledgements from authenticated;

-- Latest published notice that applies to the caller.
create function public.current_privacy_notice()
returns table (id uuid, version integer, title text, body text, published_at timestamptz, acknowledged_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select n.id, n.version, n.title, n.body, n.published_at, a.acknowledged_at
  from public.privacy_notices n
  left join public.privacy_notice_acknowledgements a on a.notice_id = n.id and a.user_id = auth.uid()
  where n.published_at is not null
    and (n.tenant_id = app.current_tenant_id() or n.tenant_id is null)
  order by (n.tenant_id is null), n.version desc
  limit 1
$$;

create function public.acknowledge_privacy_notice(p_notice uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := app.current_tenant_id();
begin
  if v_tenant is null or not exists (
    select 1 from public.privacy_notices
    where id = p_notice and published_at is not null and (tenant_id = v_tenant or tenant_id is null)
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.privacy_notice_acknowledgements (tenant_id, notice_id, user_id)
  values (v_tenant, p_notice, auth.uid())
  on conflict (notice_id, user_id) do nothing;
  perform app.write_audit(v_tenant, 'acknowledge', 'privacy_notices', p_notice, app.my_employee_id());
end $$;

-- -----------------------------------------------------------------------------
-- Rate limiting (fixed window). Buckets are salted hashes computed by the server,
-- so no IP addresses or emails are stored. Only the server (service role) may call it.
-- -----------------------------------------------------------------------------
create table app.rate_limits (
  bucket text primary key check (length(bucket) <= 128),
  window_start timestamptz not null,
  hits integer not null
);

create function public.rate_limit_hit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_hits integer;
begin
  insert into app.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;

  -- Opportunistic cleanup of stale buckets.
  if random() < 0.01 then
    delete from app.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_max;
end $$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on app.rate_limits from public, anon, authenticated;
revoke all on all functions in schema app from public, anon;
revoke execute on function app.pii_key, app.encrypt_json, app.decrypt_json from authenticated, service_role;
grant execute on function app.special_category_access to authenticated;

revoke execute on function public.get_employee_sensitive, public.set_employee_sensitive,
  public.current_privacy_notice, public.acknowledge_privacy_notice, public.rate_limit_hit from public, anon;
grant execute on function public.get_employee_sensitive, public.set_employee_sensitive,
  public.current_privacy_notice, public.acknowledge_privacy_notice to authenticated;
revoke execute on function public.rate_limit_hit from authenticated;
grant execute on function public.rate_limit_hit to service_role;
