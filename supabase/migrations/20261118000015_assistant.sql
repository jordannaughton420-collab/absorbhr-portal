-- =============================================================================
-- 0015 · AI assistant: one per company, off until the company turns it on.
--
-- The assistant never changes HR records itself. It records a *suggested* action;
-- the person who asked must confirm it, and the change then runs with that person's
-- own permissions (the same database rules as the normal forms). Every suggestion
-- and every decision is written to the append-only audit log by trigger.
--
-- What is stored:
--   assistant_conversations / assistant_messages  each person's own chats (only they can read them)
--   assistant_actions                             suggested changes and what happened to them
--   assistant_memories                            company notes the assistant should remember
-- Chats are deleted after the company's chat retention period (default 6 years).
-- =============================================================================

alter table public.tenant_settings
  add column assistant_enabled boolean not null default false,
  add column assistant_chat_retention_months smallint not null default 72
    check (assistant_chat_retention_months between 1 and 72);

comment on column public.tenant_settings.assistant_chat_retention_months is
  'How long assistant chats are kept after their last message. Default 72 months (6 years), the company may shorten it.';

-- Only the company's own Client Admin may switch the assistant on or off or change how long chats
-- are kept (switching it on sends staff names and dates to the AI provider). Not AbsorbHR support.
create function app.assistant_settings_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.assistant_enabled is distinct from old.assistant_enabled
      or new.assistant_chat_retention_months is distinct from old.assistant_chat_retention_months)
     and auth.uid() is not null
     and not (new.tenant_id = app.current_tenant_id() and app.is_client_admin()) then
    raise exception 'only the company''s Client Admin can change assistant settings' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger assistant_settings_guard before update on public.tenant_settings
  for each row execute function app.assistant_settings_guard();

-- True when the signed-in person's own company has the assistant switched on.
-- Never true in an AbsorbHR support session: support staff are not members of the company.
create function app.assistant_on(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_tenant is not null and p_tenant = app.current_tenant_id() and exists (
    select 1 from public.tenant_settings s where s.tenant_id = p_tenant and s.assistant_enabled
  ), false)
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New chat' check (length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assistant_conversations_user_idx on public.assistant_conversations (user_id, updated_at desc);
create index assistant_conversations_tenant_idx on public.assistant_conversations (tenant_id, updated_at);
comment on table public.assistant_conversations is 'A person''s chats with the assistant. Readable only by that person.';

create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null references public.assistant_conversations (id) on delete cascade,
  seq bigint generated always as identity,
  role text not null check (role in ('user', 'assistant')),
  -- The exact blocks exchanged with the model, kept unchanged so later turns can replay them.
  content jsonb not null check (jsonb_typeof(content) = 'array' and pg_column_size(content) <= 200000),
  -- What the person sees in the chat (their message, or the assistant's reply text).
  display_text text check (length(display_text) <= 20000),
  created_at timestamptz not null default now()
);
create index assistant_messages_conversation_idx on public.assistant_messages (conversation_id, seq);

create table public.assistant_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null references public.assistant_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  tool_use_id text not null check (length(tool_use_id) <= 200),
  kind text not null check (kind in (
    'request_leave', 'cancel_leave', 'decide_leave', 'record_sickness', 'create_employee',
    'update_employee', 'start_checklist', 'remember'
  )),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 8000),
  summary text not null check (length(summary) between 1 and 2000),
  subject_employee_id uuid references public.employees (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'cancelled', 'expired')),
  result_message text check (length(result_message) <= 500),
  result_entity_id uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index assistant_actions_conversation_idx on public.assistant_actions (conversation_id, created_at);
create index assistant_actions_subject_idx on public.assistant_actions (subject_employee_id);
create index assistant_actions_pending_idx on public.assistant_actions (created_at) where status = 'pending';
comment on table public.assistant_actions is
  'Changes the assistant suggested. Nothing here is carried out until the person confirms it.';

create table public.assistant_memories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  note text not null check (length(trim(note)) between 3 and 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assistant_memories_tenant_idx on public.assistant_memories (tenant_id, created_at);
comment on table public.assistant_memories is
  'Company notes the assistant reads before answering. Saved only after a person confirms. Not for personal data.';

create trigger touch before update on public.assistant_memories
  for each row execute function app.touch_updated_at();

-- The permanent record: every suggestion, decision and note is in the append-only audit log.
create trigger audit after insert or update or delete on public.assistant_actions
  for each row execute function app.audit_row('subject_employee_id');
create trigger audit after insert or update or delete on public.assistant_memories
  for each row execute function app.audit_row();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.assistant_actions enable row level security;
alter table public.assistant_memories enable row level security;

-- Conversations: your own, in your own company, while the assistant is switched on.
-- You can read and delete your own chats even after it is switched off.
create policy assistant_conversations_select on public.assistant_conversations for select to authenticated
  using (user_id = auth.uid() and tenant_id = app.current_tenant_id());
create policy assistant_conversations_insert on public.assistant_conversations for insert to authenticated
  with check (user_id = auth.uid() and app.assistant_on(tenant_id));
create policy assistant_conversations_update on public.assistant_conversations for update to authenticated
  using (user_id = auth.uid() and app.assistant_on(tenant_id))
  with check (user_id = auth.uid() and app.assistant_on(tenant_id));
create policy assistant_conversations_delete on public.assistant_conversations for delete to authenticated
  using (user_id = auth.uid() and tenant_id = app.current_tenant_id());

-- Messages: only in your own conversations. No editing; deleting the chat deletes them.
create policy assistant_messages_select on public.assistant_messages for select to authenticated
  using (exists (select 1 from public.assistant_conversations c
                 where c.id = assistant_messages.conversation_id and c.user_id = auth.uid()
                   and c.tenant_id = assistant_messages.tenant_id and c.tenant_id = app.current_tenant_id()));
create policy assistant_messages_insert on public.assistant_messages for insert to authenticated
  with check (app.assistant_on(tenant_id) and exists (
    select 1 from public.assistant_conversations c
    where c.id = assistant_messages.conversation_id and c.user_id = auth.uid()
      and c.tenant_id = assistant_messages.tenant_id));

-- Suggested actions: your own only. Status changes go through the functions below.
create policy assistant_actions_select on public.assistant_actions for select to authenticated
  using (user_id = auth.uid() and tenant_id = app.current_tenant_id());
create policy assistant_actions_insert on public.assistant_actions for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and app.assistant_on(tenant_id) and exists (
    select 1 from public.assistant_conversations c
    where c.id = assistant_actions.conversation_id and c.user_id = auth.uid()
      and c.tenant_id = assistant_actions.tenant_id));

-- Company notes: everyone in the company can read them (the assistant uses them for everyone).
-- Anyone may add one through a confirmed suggestion; the author or a Client Admin may change or remove it.
create policy assistant_memories_select on public.assistant_memories for select to authenticated
  using (tenant_id = app.current_tenant_id());
create policy assistant_memories_insert on public.assistant_memories for insert to authenticated
  with check (created_by = auth.uid() and app.assistant_on(tenant_id));
create policy assistant_memories_update on public.assistant_memories for update to authenticated
  using (tenant_id = app.current_tenant_id() and (created_by = auth.uid() or app.is_client_admin()))
  with check (tenant_id = app.current_tenant_id());
create policy assistant_memories_delete on public.assistant_memories for delete to authenticated
  using (tenant_id = app.current_tenant_id() and (created_by = auth.uid() or app.is_client_admin()));

revoke all on public.assistant_conversations, public.assistant_messages,
  public.assistant_actions, public.assistant_memories from anon, authenticated;
grant select, insert, delete on public.assistant_conversations to authenticated;
grant update (title, updated_at) on public.assistant_conversations to authenticated;
grant select, insert on public.assistant_messages to authenticated;
grant select on public.assistant_actions to authenticated;
grant insert (id, tenant_id, conversation_id, user_id, tool_use_id, kind, payload, summary, subject_employee_id)
  on public.assistant_actions to authenticated;
grant select, insert, delete on public.assistant_memories to authenticated;
grant update (note) on public.assistant_memories to authenticated;

-- -----------------------------------------------------------------------------
-- Confirming a suggestion
-- -----------------------------------------------------------------------------
-- Step 1: the person who asked claims a pending suggestion (once only, within 24 hours).
-- Returns the action so the server can carry it out with that person's own permissions.
create function public.assistant_claim_action(p_action uuid) returns public.assistant_actions
language plpgsql security definer set search_path = '' as $$
declare
  v public.assistant_actions;
begin
  update public.assistant_actions a
     set status = 'running', decided_at = now()
   where a.id = p_action and a.user_id = auth.uid() and a.status = 'pending'
     and a.tenant_id = app.current_tenant_id() and app.assistant_on(a.tenant_id)
     and a.created_at > now() - interval '24 hours'
  returning a.* into v;
  if v.id is null then
    raise exception 'not available' using errcode = '22023', hint = 'not_pending';
  end if;
  return v;
end $$;

-- Step 2: record the outcome.
create function public.assistant_finish_action(
  p_action uuid, p_ok boolean, p_message text default null, p_entity uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.assistant_actions a
     set status = case when p_ok then 'done' else 'failed' end,
         result_message = left(p_message, 500),
         result_entity_id = p_entity
   where a.id = p_action and a.user_id = auth.uid() and a.status = 'running';
  if not found then
    raise exception 'not running' using errcode = '22023';
  end if;
end $$;

-- Saying no: the person who asked cancels a pending suggestion.
create function public.assistant_cancel_action(p_action uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.assistant_actions a
     set status = 'cancelled', decided_at = now()
   where a.id = p_action and a.user_id = auth.uid() and a.status = 'pending'
     and a.tenant_id = app.current_tenant_id();
  if not found then
    raise exception 'not available' using errcode = '22023', hint = 'not_pending';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- GDPR: subject access export and erasure
-- -----------------------------------------------------------------------------
-- Assistant data about one employee, for the Subject Access Request export.
-- Same permission as sar_data(): HR with MFA in the same company, not about themselves.
create function public.assistant_sar_data(p_employee uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_emp public.employees;
begin
  select * into v_emp from public.employees where id = p_employee;
  if v_emp is null or app.case_access(v_emp.tenant_id, p_employee) is not true then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'assistant_chats', coalesce((
      select jsonb_agg(jsonb_build_object(
        'started', c.created_at, 'title', c.title,
        'messages', coalesce((select jsonb_agg(jsonb_build_object('when', m.created_at, 'from', m.role, 'text', m.display_text)
                                                order by m.seq)
                              from public.assistant_messages m
                              where m.conversation_id = c.id and m.display_text is not null), '[]'::jsonb))
        order by c.created_at)
      from public.assistant_conversations c
      where v_emp.user_id is not null and c.user_id = v_emp.user_id and c.tenant_id = v_emp.tenant_id), '[]'::jsonb),
    'assistant_suggestions_about_this_person', coalesce((
      select jsonb_agg(jsonb_build_object('when', a.created_at, 'suggested', a.summary, 'outcome', a.status,
        'decided', a.decided_at) order by a.created_at)
      from public.assistant_actions a where a.subject_employee_id = p_employee), '[]'::jsonb)
  );
end $$;

-- When an employee is anonymised, remove what assistant suggestions said about them.
-- (Their own chats go when their login is deleted: the foreign key cascades.)
create function app.assistant_on_anonymise() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.assistant_actions
     set payload = '{}'::jsonb, summary = 'Removed: the employee''s record was anonymised.', result_message = null
   where subject_employee_id = new.id;
  return null;
end $$;

create trigger assistant_anonymise after update of anonymised_at on public.employees
  for each row when (old.anonymised_at is null and new.anonymised_at is not null)
  execute function app.assistant_on_anonymise();

-- -----------------------------------------------------------------------------
-- Daily clean-up: chats past each company's retention period; stale suggestions expire.
-- -----------------------------------------------------------------------------
create function app.assistant_housekeeping() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.assistant_conversations c
   using public.tenant_settings s
   where s.tenant_id = c.tenant_id
     and c.updated_at < now() - make_interval(months => s.assistant_chat_retention_months);
  update public.assistant_actions set status = 'expired'
   where status = 'pending' and created_at < now() - interval '24 hours';
  -- A confirm that crashed half-way: mark it failed so it can't be run twice.
  update public.assistant_actions set status = 'failed', result_message = 'Did not finish. Please check and try again.'
   where status = 'running' and decided_at < now() - interval '1 hour';
end $$;

revoke all on function app.assistant_on, app.assistant_on_anonymise, app.assistant_housekeeping,
  app.assistant_settings_guard
  from public, anon, authenticated;
grant execute on function app.assistant_on to authenticated;
revoke execute on function public.assistant_claim_action, public.assistant_finish_action,
  public.assistant_cancel_action, public.assistant_sar_data from public, anon;
grant execute on function public.assistant_claim_action, public.assistant_finish_action,
  public.assistant_cancel_action, public.assistant_sar_data to authenticated;

select cron.schedule('assistant-housekeeping', '53 2 * * *', $$select app.assistant_housekeeping()$$);
