-- =============================================================================
-- 0017 · More everyday admin jobs the assistant can suggest (still only on the person's Confirm,
-- still carried out with that person's own permissions):
--   end_sickness, complete_checklist_task, adjust_holiday, invite_to_portal, mark_leaver,
--   change_role, add_department, add_location, start_review, publish_policy.
-- Kept out on purpose: sickness reasons, cases, pay, right-to-work, diversity, GDPR tools, breaches.
-- =============================================================================
alter table public.assistant_actions drop constraint assistant_actions_kind_check;
alter table public.assistant_actions add constraint assistant_actions_kind_check check (kind in (
  'request_leave', 'cancel_leave', 'decide_leave', 'record_sickness', 'create_employee',
  'update_employee', 'start_checklist', 'remember',
  'create_shift', 'cancel_shift', 'post_open_shift', 'add_to_shift_group', 'remove_from_shift_group',
  'end_sickness', 'complete_checklist_task', 'adjust_holiday', 'invite_to_portal', 'mark_leaver',
  'change_role', 'add_department', 'add_location', 'start_review', 'publish_policy'
));
