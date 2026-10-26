-- =============================================================================
-- AbsorbHR Portal — Phase 3, part 1: secure employee documents
--
-- Decisions (26 Oct 2026, AbsorbHR): HR, the employee and their DIRECT line manager
-- can upload. PDF, Word (.docx), JPEG, PNG, HEIC up to 10 MB.
--
-- How files are protected:
--   * Private storage buckets with NO storage policies, so browsers can never read
--     or list files directly. All file access goes through the server, which first
--     checks this table under RLS and then issues a single-use signed URL
--     (upload) or a 60-second signed URL (download).
--   * Each document has a visibility level saying who besides HR may see it.
--   * Fit notes are health data: never visible to AbsorbHR support sessions.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('employee-documents', 'employee-documents', false, 10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('policy-documents', 'policy-documents', false, 10485760,
    array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  employee_id uuid not null,
  category text not null check (category in
    ('contract', 'letter', 'certificate', 'right_to_work', 'fit_note', 'meeting_notes', 'other')),
  title text not null check (length(trim(title)) between 1 and 200),
  file_name text not null check (length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes integer check (size_bytes between 1 and 10485760),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  -- Who, besides HR, can see it.
  visibility text not null check (visibility in ('hr_only', 'hr_and_manager', 'hr_and_employee', 'everyone')),
  status text not null default 'uploading' check (status in ('uploading', 'available')),
  storage_path text not null unique,
  uploaded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (storage_path = tenant_id::text || '/' || employee_id::text || '/' || id::text),
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
create index documents_employee_idx on public.documents (employee_id, created_at desc);
comment on table public.documents is 'Metadata for files in the private employee-documents bucket. File access only via server-issued signed URLs.';

-- Who may upload which kinds of document with which visibility.
create function app.document_upload_allowed(
  p_employee uuid, p_category text, p_visibility text
) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    -- HR (own company with MFA, or a support session for non-health documents): anything.
    (app.hr_access((select tenant_id from public.employees where id = p_employee))
       and (p_category <> 'fit_note' or app.support_tenant_id() is null))
    -- The employee: their own certificates, fit notes, right-to-work and other documents.
    or (app.is_self(p_employee)
        and p_category in ('certificate', 'fit_note', 'right_to_work', 'other')
        and p_visibility in ('hr_and_employee', 'everyone'))
    -- Direct line manager: certificates, meeting notes, fit notes, other.
    or (app.is_manager_of(p_employee)
        and p_category in ('certificate', 'meeting_notes', 'fit_note', 'other')
        and p_visibility in ('hr_and_manager', 'everyone')),
    false)
$$;

create function app.document_visible(p_doc public.documents) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (app.hr_access(p_doc.tenant_id) and (p_doc.category <> 'fit_note' or app.support_tenant_id() is null))
    or (p_doc.status = 'available' and (
         (app.is_self(p_doc.employee_id) and p_doc.visibility in ('hr_and_employee', 'everyone'))
         or (app.is_manager_of(p_doc.employee_id) and p_doc.visibility in ('hr_and_manager', 'everyone'))))
    or p_doc.uploaded_by = auth.uid(),
    false)
$$;

create trigger touch before update on public.documents for each row execute function app.touch_updated_at();
create trigger audit after insert or update or delete on public.documents for each row execute function app.audit_row('employee_id');

alter table public.documents enable row level security;

create policy documents_select on public.documents for select to authenticated
  using (app.document_visible(documents));
create policy documents_insert on public.documents for insert to authenticated
  with check (
    tenant_id = (select e.tenant_id from public.employees e where e.id = employee_id)
    and status = 'uploading'
    and uploaded_by = auth.uid()
    and app.document_upload_allowed(employee_id, category, visibility)
  );
-- HR can recategorise, rename or change who can see a document (not move it or mark it uploaded).
create policy documents_update on public.documents for update to authenticated
  using (app.hr_access(tenant_id) and (category <> 'fit_note' or app.support_tenant_id() is null))
  with check (app.hr_access(tenant_id) and (category <> 'fit_note' or app.support_tenant_id() is null));
create policy documents_delete on public.documents for delete to authenticated
  using (app.hr_access(tenant_id) and (category <> 'fit_note' or app.support_tenant_id() is null));

-- Columns that only the server (after verifying the uploaded file) may set.
revoke update on public.documents from authenticated;
grant update (title, category, visibility) on public.documents to authenticated;

revoke all on all tables in schema public from anon;
revoke all on all functions in schema app from public, anon;
grant execute on function app.document_upload_allowed, app.document_visible to authenticated;
