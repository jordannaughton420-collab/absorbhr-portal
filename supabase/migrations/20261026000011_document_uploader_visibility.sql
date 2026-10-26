-- Fix (caught by supabase/tests/05_documents_policies.sql): "uploaders can see what they uploaded"
-- let an HR manager see their own uploads without MFA. The uploader exception is now limited to
-- files still being uploaded (so the upload can be finished); after that, the normal rules apply.
create or replace function app.document_visible(p_doc public.documents) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (app.hr_access(p_doc.tenant_id) and (p_doc.category <> 'fit_note' or app.support_tenant_id() is null))
    or (p_doc.status = 'available' and (
         (app.is_self(p_doc.employee_id) and p_doc.visibility in ('hr_and_employee', 'everyone'))
         or (app.is_manager_of(p_doc.employee_id) and p_doc.visibility in ('hr_and_manager', 'everyone'))))
    or (p_doc.status = 'uploading' and p_doc.uploaded_by = auth.uid()),
    false)
$$;
