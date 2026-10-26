-- =============================================================================
-- DEMO CONTENT — AbsorbHR template library and Brightwater Bakery policies.
-- Template wording is an OUTLINE for AbsorbHR's consultants to complete. It is not
-- legal advice and must be reviewed before any client relies on it.
-- Safe to re-run: replaces demo policies only.
-- =============================================================================
do $$
declare
  v_bw uuid := (select id from public.tenants where name = 'Brightwater Bakery Ltd');
  v_prod uuid;
  v_id uuid;
  v_v1 uuid;
  r record;
  i int := 0;
begin
  delete from public.policies where tenant_id is null and title like '[TEMPLATE]%';
  delete from public.policies where tenant_id = v_bw;
  select id into v_prod from public.departments where tenant_id = v_bw and name = 'Production';

  -- ---------------------------------------------------------------- AbsorbHR templates
  insert into public.policies (tenant_id, title, category, summary, status)
  values (null, '[TEMPLATE] Sickness absence policy', 'absence_leave', 'Reporting sickness, fit notes, sick pay, return-to-work meetings and support.', 'published')
  returning id into v_id;
  insert into public.policy_versions (tenant_id, policy_id, version, body, published_at) values (null, v_id, 1,
$t$**AbsorbHR template — complete the [bracketed] sections and review with your AbsorbHR consultant before publishing. This outline is not legal advice.**

## 1. Purpose
This policy explains what to do if you are too ill to work, what pay you will receive and how [Company name] will support you back to work.

## 2. Reporting sickness
- Contact [your line manager] by phone before [time] on your first day of absence.
- Tell us why you are absent and when you expect to return. You can also record it in the HR portal.
- Keep us updated [every X days] while you are off.

## 3. Evidence
- For absences of up to 7 calendar days you can self-certify.
- From day 8 you need a fit note from a doctor or other healthcare professional.

## 4. Sick pay
- Statutory Sick Pay (SSP) is paid when you qualify.
- [Company sick pay scheme details, if any.]

## 5. Return to work
- Your manager will hold a return-to-work conversation after every absence.
- We will consider reasonable adjustments, especially where a health condition may be a disability.

## 6. Monitoring
- We monitor absence to support staff and manage the business fairly. [Describe any triggers.]
- Pregnancy-related and disability-related absence is treated separately.

## 7. Confidentiality
Health information is special category data. It is stored securely and only seen by those who need it.
$t$, now());

  insert into public.policies (tenant_id, title, category, summary, status)
  values (null, '[TEMPLATE] Disciplinary procedure', 'disciplinary_grievance', 'Fair, ACAS-compliant process for dealing with conduct issues.', 'published')
  returning id into v_id;
  insert into public.policy_versions (tenant_id, policy_id, version, body, published_at) values (null, v_id, 1,
$t$**AbsorbHR template — based on the principles of the ACAS Code of Practice on disciplinary and grievance procedures. Review with your AbsorbHR consultant before publishing. This outline is not legal advice.**

## 1. Principles
- Issues are dealt with promptly, consistently and fairly.
- You will be told of the allegations and given the evidence before any meeting.
- You have the right to be accompanied by a colleague or trade union representative.
- No disciplinary action is taken until the case has been investigated.
- You have the right to appeal any disciplinary sanction.

## 2. Informal action
Minor issues are normally dealt with informally by your line manager.

## 3. Formal procedure
- **Investigation** by someone not involved.
- **Invitation** to a disciplinary hearing in writing, with [X] days' notice.
- **Hearing** and decision, confirmed in writing.
- **Possible outcomes:** no action, first written warning, final written warning, dismissal [and alternatives].

## 4. Gross misconduct
Examples include [theft, violence, serious breach of health and safety]. Gross misconduct may result in dismissal without notice.

## 5. Appeals
Appeal in writing within [X] days to [role]. The appeal will be heard by someone not previously involved where possible.
$t$, now());

  insert into public.policies (tenant_id, title, category, summary, status)
  values (null, '[TEMPLATE] Data protection policy for staff', 'data_protection', 'How staff must handle personal data under UK GDPR.', 'published')
  returning id into v_id;
  insert into public.policy_versions (tenant_id, policy_id, version, body, published_at) values (null, v_id, 1,
$t$**AbsorbHR template — review with your AbsorbHR consultant before publishing. This outline is not legal advice.**

## 1. Why this matters
[Company name] handles personal data about customers, suppliers and staff. UK GDPR and the Data Protection Act 2018 set rules we must all follow.

## 2. Your responsibilities
- Only access personal data you need for your job.
- Keep data secure: lock screens, use strong passwords and never share log-ins.
- Don't take personal data off-site or onto personal devices unless authorised.
- Don't keep data longer than needed.

## 3. Reporting a breach
If personal data is lost, sent to the wrong person or accessed without permission, tell [Data protection lead] **immediately**. Some breaches must be reported to the ICO within 72 hours.

## 4. Requests from individuals
Pass any request to see, correct or delete personal data to [Data protection lead] straight away.
$t$, now());

  -- ---------------------------------------------------------------- Brightwater policies
  if v_bw is null then return; end if;

  insert into public.policies (tenant_id, title, category, summary, status)
  values (v_bw, 'Code of conduct', 'conduct', 'How we treat each other, our customers and our bakery.', 'published')
  returning id into v_id;
  insert into public.policy_versions (tenant_id, policy_id, version, body, published_at) values (v_bw, v_id, 1,
$t$## Our values
- **Be kind** — treat colleagues and customers with respect.
- **Be safe** — follow food safety and health and safety rules every shift.
- **Be honest** — report mistakes early so we can fix them together.

## Expected behaviour
- Arrive on time and ready to work.
- Wear the correct uniform and protective equipment.
- No bullying, harassment or discrimination of any kind.

## Raising concerns
Speak to your manager, HR, or use our grievance procedure.
$t$, now() - interval '60 days') returning id into v_v1;
  -- Most of Brightwater have confirmed it.
  for r in select e.id from public.employees e where e.tenant_id = v_bw and e.status = 'active' order by e.last_name loop
    i := i + 1;
    if i % 4 <> 0 then
      insert into public.policy_acknowledgements (tenant_id, policy_id, policy_version_id, employee_id, acknowledged_at)
      values (v_bw, v_id, v_v1, r.id, now() - (i || ' days')::interval);
    end if;
  end loop;

  insert into public.policies (tenant_id, title, category, summary, status, audience, department_ids)
  values (v_bw, 'Food hygiene and allergen safety', 'health_safety', 'Mandatory for everyone working in Production.', 'published', 'departments', array[v_prod])
  returning id into v_id;
  insert into public.policy_versions (tenant_id, policy_id, version, body, published_at) values (v_bw, v_id, 1,
$t$## Before every shift
- Wash hands for 20 seconds and wear a clean apron and hair covering.
- Report any illness, especially stomach upsets, before starting work.

## Allergens
- Follow the colour-coded equipment system for the 14 major allergens.
- Never change a recipe without updating the allergen sheet.
$t$, now() - interval '20 days');

  insert into public.policies (tenant_id, title, category, summary, status, requires_acknowledgement)
  values (v_bw, 'How to book holiday', 'absence_leave', 'Booking, approval and our Christmas shutdown.', 'published', false)
  returning id into v_id;
  insert into public.policy_versions (tenant_id, policy_id, version, body, published_at, change_summary) values
    (v_bw, v_id, 1, $t$## Booking holiday
Request holiday in the HR portal at least two weeks ahead. Your line manager will approve or decline it.$t$, now() - interval '90 days', null),
    (v_bw, v_id, 2, $t$## Booking holiday
Request holiday in the HR portal at least two weeks ahead. Your line manager will approve or decline it.

## Christmas
The bakery stays open over Christmas. Holiday in December is shared fairly across the team.$t$, now() - interval '10 days', 'Added the Christmas section');
end $$;
