"use client";

import * as React from "react";
import { ZodForm } from "@/components/forms/zod-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import {
  SICKNESS_REASONS,
  endSicknessSchema,
  exclusionSchema,
  returnToWorkSchema,
  sicknessReasonSchema,
  sicknessSchema,
} from "@/lib/validation/leave";
import {
  acknowledgeReturnToWork,
  endSickness,
  getSicknessDetails,
  recordSickness,
  saveReturnToWork,
  setExclusion,
  updateSicknessReason,
  type SicknessDetails,
} from "./actions";

function ReasonSelect(props: React.ComponentProps<typeof Select>) {
  return (
    <Select {...props}>
      <option value="">Prefer not to say / not known yet</option>
      {Object.entries(SICKNESS_REASONS).map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </Select>
  );
}

export function RecordSicknessForm({
  people,
  selfId,
}: {
  people: { id: string; name: string }[];
  selfId: string | null;
}) {
  return (
    <ZodForm
      schema={sicknessSchema}
      action={recordSickness}
      submitLabel="Save sickness record"
      resetOnSuccess
    >
      {({ errors }) => (
        <>
          {people.length > 1 ? (
            <Field name="employee_id" label="Who is off sick?" error={errors.employee_id}>
              {(p) => (
                <Select {...p} defaultValue={selfId ?? ""}>
                  <option value="" disabled>
                    Choose a person
                  </option>
                  {people.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.id === selfId ? `${x.name} (me)` : x.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <input type="hidden" name="employee_id" value={people[0]?.id ?? ""} />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="start_date" label="First day off" error={errors.start_date}>
              {(p) => (
                <Input {...p} type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              )}
            </Field>
            <Field
              name="end_date"
              label="Last day off"
              optional
              error={errors.end_date}
              hint="Leave blank if not back yet."
            >
              {(p) => <Input {...p} type="date" />}
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="half_day_start" className="size-4 accent-primary" /> Went
              home part-way through the first day
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="half_day_end" className="size-4 accent-primary" /> Back
              for the afternoon of the last day
            </label>
          </div>
          <Field
            name="reason_category"
            label="Reason"
            optional
            error={errors.reason_category}
            hint="Health information is encrypted and only seen by HR and the line manager."
          >
            {(p) => <ReasonSelect {...p} defaultValue="" />}
          </Field>
          <Field name="notes" label="Notes" optional error={errors.notes}>
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                placeholder="Only what's needed, e.g. expected return date."
              />
            )}
          </Field>
        </>
      )}
    </ZodForm>
  );
}

export function EndSicknessForm({
  absenceId,
  startDate,
}: {
  absenceId: string;
  startDate: string;
}) {
  return (
    <ZodForm schema={endSicknessSchema} action={endSickness} submitLabel="Save return date">
      {({ errors }) => (
        <>
          <input type="hidden" name="absence_id" value={absenceId} />
          <Field name="end_date" label="Last day off" error={errors.end_date} className="max-w-xs">
            {(p) => <Input {...p} type="date" min={startDate} />}
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="half_day_end" className="size-4 accent-primary" /> Came
            back for the afternoon of that day
          </label>
        </>
      )}
    </ZodForm>
  );
}

export function ExclusionForm({
  absenceId,
  current,
}: {
  absenceId: string;
  current: string | null;
}) {
  return (
    <ZodForm schema={exclusionSchema} action={setExclusion} submitLabel="Save">
      {({ errors }) => (
        <>
          <input type="hidden" name="absence_id" value={absenceId} />
          <Field
            name="basis"
            label="Exclude from Bradford Factor and absence triggers?"
            error={errors.basis}
            hint="Pregnancy-related and disability-related absence usually must not count towards triggers (Equality Act 2010). Take advice if unsure."
          >
            {(p) => (
              <Select {...p} defaultValue={current ?? "none"}>
                <option value="none">No — count it</option>
                <option value="pregnancy">Yes — pregnancy-related</option>
                <option value="disability">Yes — disability-related</option>
                <option value="other">Yes — other reason</option>
              </Select>
            )}
          </Field>
        </>
      )}
    </ZodForm>
  );
}

const YES_NO: Record<string, string> = {
  yes: "Yes",
  no: "No",
  not_asked: "Not asked",
  not_needed: "Not needed",
  yes_with_adjustments: "Yes, with adjustments",
};

// Health details are only decrypted when someone chooses to view them (each view is logged).
export function HealthDetails({
  absenceId,
  canCompleteRtw,
  isSelf,
}: {
  absenceId: string;
  canCompleteRtw: boolean;
  isSelf: boolean;
}) {
  const [data, setData] = React.useState<SicknessDetails | null>(null);
  const [error, setError] = React.useState(false);
  const [pending, start] = React.useTransition();

  const load = () =>
    start(async () => {
      const res = await getSicknessDetails(absenceId);
      if (res) setData(res);
      else setError(true);
    });

  if (!data) {
    return (
      <div className="space-y-2">
        {error && <Alert variant="error">Those details couldn&apos;t be shown.</Alert>}
        <p className="text-sm text-muted-foreground">
          The reason and return-to-work notes are health information. They&apos;re encrypted, and
          viewing them is recorded in the audit log.
        </p>
        <Button onClick={load} disabled={pending} variant="outline">
          {pending ? "Opening…" : "Show reason and return-to-work notes"}
        </Button>
      </div>
    );
  }

  const rtw = data.rtw;
  return (
    <div className="space-y-6">
      <section aria-labelledby="reason-h" className="space-y-3">
        <h3 id="reason-h" className="font-semibold">
          Reason
        </h3>
        <ZodForm
          schema={sicknessReasonSchema}
          action={updateSicknessReason}
          submitLabel="Save reason"
          onSuccess={load}
        >
          {({ errors }) => (
            <>
              <input type="hidden" name="absence_id" value={absenceId} />
              <Field name="reason_category" label="Reason" optional error={errors.reason_category}>
                {(p) => <ReasonSelect {...p} defaultValue={data.details?.reason_category ?? ""} />}
              </Field>
              <Field name="notes" label="Notes" optional error={errors.notes}>
                {(p) => <Textarea {...p} rows={2} defaultValue={data.details?.notes ?? ""} />}
              </Field>
            </>
          )}
        </ZodForm>
      </section>

      <section aria-labelledby="rtw-h" className="space-y-3">
        <h3 id="rtw-h" className="font-semibold">
          Return-to-work meeting
        </h3>
        {rtw && (
          <dl className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Meeting date</dt>
              <dd>{new Date(rtw.meeting_date).toLocaleDateString("en-GB")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fit to return</dt>
              <dd>{YES_NO[rtw.fit_to_return ?? ""] ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Seen a GP</dt>
              <dd>{YES_NO[rtw.gp_seen ?? ""] ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fit note received</dt>
              <dd>{YES_NO[rtw.fit_note_received ?? ""] ?? "—"}</dd>
            </div>
            {rtw.adjustments && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Adjustments</dt>
                <dd>{rtw.adjustments}</dd>
              </div>
            )}
            {rtw.support_offered && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Support offered</dt>
                <dd>{rtw.support_offered}</dd>
              </div>
            )}
            {rtw.notes && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Notes</dt>
                <dd className="whitespace-pre-line">{rtw.notes}</dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Employee confirmation</dt>
              <dd>
                {rtw.employee_acknowledged_at
                  ? `Confirmed ${new Date(rtw.employee_acknowledged_at).toLocaleDateString("en-GB")}`
                  : "Not yet confirmed"}
              </dd>
            </div>
          </dl>
        )}
        {isSelf && rtw && !rtw.employee_acknowledged_at && (
          <form
            action={async (fd) => {
              await acknowledgeReturnToWork(fd);
              load();
            }}
          >
            <input type="hidden" name="absence_id" value={absenceId} />
            <Button type="submit">I confirm this is an accurate record</Button>
          </form>
        )}
        {!rtw && !canCompleteRtw && (
          <p className="text-sm text-muted-foreground">Not completed yet.</p>
        )}
        {canCompleteRtw && (
          <details open={!rtw} className="rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium text-primary">
              {rtw ? "Edit the return-to-work form" : "Complete the return-to-work form"}
            </summary>
            <div className="mt-4">
              <ZodForm
                schema={returnToWorkSchema}
                action={saveReturnToWork}
                submitLabel="Save return-to-work form"
                onSuccess={load}
              >
                {({ errors }) => (
                  <>
                    <input type="hidden" name="absence_id" value={absenceId} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field name="meeting_date" label="Meeting date" error={errors.meeting_date}>
                        {(p) => (
                          <Input
                            {...p}
                            type="date"
                            defaultValue={
                              rtw?.meeting_date ?? new Date().toISOString().slice(0, 10)
                            }
                          />
                        )}
                      </Field>
                      <Field
                        name="fit_to_return"
                        label="Fit to return?"
                        error={errors.fit_to_return}
                      >
                        {(p) => (
                          <Select {...p} defaultValue={rtw?.fit_to_return ?? ""}>
                            <option value="" disabled>
                              Choose
                            </option>
                            <option value="yes">Yes</option>
                            <option value="yes_with_adjustments">Yes, with adjustments</option>
                            <option value="no">No</option>
                          </Select>
                        )}
                      </Field>
                      <Field
                        name="gp_seen"
                        label="Seen a GP or other medical professional?"
                        optional
                        error={errors.gp_seen}
                      >
                        {(p) => (
                          <Select {...p} defaultValue={rtw?.gp_seen ?? ""}>
                            <option value="">—</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                            <option value="not_asked">Not asked</option>
                          </Select>
                        )}
                      </Field>
                      <Field
                        name="fit_note_received"
                        label="Fit note received?"
                        optional
                        error={errors.fit_note_received}
                        hint="Needed for absences over 7 calendar days."
                      >
                        {(p) => (
                          <Select {...p} defaultValue={rtw?.fit_note_received ?? ""}>
                            <option value="">—</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                            <option value="not_needed">Not needed</option>
                          </Select>
                        )}
                      </Field>
                    </div>
                    <Field
                      name="adjustments"
                      label="Adjustments agreed"
                      optional
                      error={errors.adjustments}
                    >
                      {(p) => (
                        <Textarea
                          {...p}
                          rows={2}
                          defaultValue={rtw?.adjustments ?? ""}
                          placeholder="e.g. phased return, lighter duties"
                        />
                      )}
                    </Field>
                    <Field
                      name="support_offered"
                      label="Support offered"
                      optional
                      error={errors.support_offered}
                    >
                      {(p) => (
                        <Textarea
                          {...p}
                          rows={2}
                          defaultValue={rtw?.support_offered ?? ""}
                          placeholder="e.g. Employee Assistance Programme, occupational health referral"
                        />
                      )}
                    </Field>
                    <Field name="notes" label="Other notes" optional error={errors.notes}>
                      {(p) => <Textarea {...p} rows={3} defaultValue={rtw?.notes ?? ""} />}
                    </Field>
                  </>
                )}
              </ZodForm>
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
