-- Published-version fields can only be set by publish_policy_version(). Postgres ignores a
-- column-level REVOKE while a table-level UPDATE grant exists, so grant only the editable columns.
-- (RLS already refuses updates to published versions; this is a second, independent guard.)
revoke update on public.policy_versions from authenticated;
grant update (body, file_path, file_name, file_mime, change_summary, requires_reacknowledgement)
  on public.policy_versions to authenticated;
