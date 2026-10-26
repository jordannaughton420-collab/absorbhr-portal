"use client";

import * as React from "react";
import { ZodForm } from "@/components/forms/zod-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import {
  CONTRACT_TYPES,
  EMPLOYMENT_STATUSES,
  RTW_CHECK_TYPES,
  RTW_STATUSES,
  emergencyContactSchema,
  employeeSchema,
  personalSchema,
  rtwSchema,
  salarySchema,
} from "@/lib/validation/employee";
import {
  addEmergencyContact,
  addRtwCheck,
  addSalary,
  createEmployee,
  inviteToPortal,
  savePersonal,
  updateEmployee,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

type Option = { id: string; name: string };
type Values = Record<string, string | number | null | undefined>;

const v = (values: Values | undefined, key: string) => (values?.[key] ?? "") as string | number;
const grid = "grid gap-4 sm:grid-cols-2";

export function EmployeeForm({
  employee,
  departments,
  locations,
  managers,
}: {
  employee?: Values & { id: string };
  departments: Option[];
  locations: Option[];
  managers: Option[];
}) {
  const [contract, setContract] = React.useState(String(v(employee, "contract_type") || "permanent"));
  const [status, setStatus] = React.useState(String(v(employee, "status") || "active"));

  return (
    <ZodForm
      schema={employeeSchema}
      action={employee ? updateEmployee : createEmployee}
      submitLabel={employee ? "Save employment details" : "Create employee"}
    >
      {({ errors }) => (
        <>
          {employee && <input type="hidden" name="id" value={employee.id} />}
          <fieldset className={grid}>
            <legend className="sr-only">Name</legend>
            <Field name="first_name" label="First name" error={errors.first_name}>
              {(p) => <Input {...p} defaultValue={v(employee, "first_name")} autoComplete="off" />}
            </Field>
            <Field name="last_name" label="Last name" error={errors.last_name}>
              {(p) => <Input {...p} defaultValue={v(employee, "last_name")} autoComplete="off" />}
            </Field>
            <Field name="preferred_name" label="Preferred name" optional error={errors.preferred_name}>
              {(p) => <Input {...p} defaultValue={v(employee, "preferred_name")} />}
            </Field>
            <Field
              name="work_email"
              label="Work email"
              optional
              error={errors.work_email}
              hint="Needed if this person will sign in to the portal."
            >
              {(p) => <Input {...p} type="email" defaultValue={v(employee, "work_email")} />}
            </Field>
          </fieldset>

          <fieldset className={grid}>
            <legend className="sr-only">Role</legend>
            <Field name="job_title" label="Job title" optional error={errors.job_title}>
              {(p) => <Input {...p} defaultValue={v(employee, "job_title")} />}
            </Field>
            <Field name="employee_number" label="Employee number" optional error={errors.employee_number}>
              {(p) => <Input {...p} defaultValue={v(employee, "employee_number")} />}
            </Field>
            <Field name="department_id" label="Department" optional error={errors.department_id}>
              {(p) => (
                <Select {...p} defaultValue={v(employee, "department_id")}>
                  <option value="">— None —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field name="location_id" label="Location" optional error={errors.location_id}>
              {(p) => (
                <Select {...p} defaultValue={v(employee, "location_id")}>
                  <option value="">— None —</option>
                  {locations.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field name="manager_id" label="Line manager" optional error={errors.manager_id}>
              {(p) => (
                <Select {...p} defaultValue={v(employee, "manager_id")}>
                  <option value="">— None —</option>
                  {managers
                    .filter((m) => m.id !== employee?.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
          </fieldset>

          <fieldset className={grid}>
            <legend className="sr-only">Contract</legend>
            <Field name="start_date" label="Start date" error={errors.start_date}>
              {(p) => <Input {...p} type="date" defaultValue={v(employee, "start_date")} />}
            </Field>
            <Field
              name="continuous_service_date"
              label="Continuous service date"
              optional
              error={errors.continuous_service_date}
              hint="Only if different from the start date (e.g. TUPE transfer)."
            >
              {(p) => <Input {...p} type="date" defaultValue={v(employee, "continuous_service_date")} />}
            </Field>
            <Field name="contract_type" label="Contract type" error={errors.contract_type}>
              {(p) => (
                <Select {...p} value={contract} onChange={(e) => setContract(e.target.value)}>
                  {Object.entries(CONTRACT_TYPES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {contract === "fixed_term" && (
              <Field name="fixed_term_end_date" label="Fixed-term end date" error={errors.fixed_term_end_date}>
                {(p) => <Input {...p} type="date" defaultValue={v(employee, "fixed_term_end_date")} />}
              </Field>
            )}
            <Field name="probation_end_date" label="Probation end date" optional error={errors.probation_end_date}>
              {(p) => <Input {...p} type="date" defaultValue={v(employee, "probation_end_date")} />}
            </Field>
            <Field name="weekly_hours" label="Contracted hours per week" optional error={errors.weekly_hours}>
              {(p) => <Input {...p} type="number" step="0.25" min="0" max="100" defaultValue={v(employee, "weekly_hours")} />}
            </Field>
            <Field
              name="days_per_week"
              label="Days worked per week"
              optional
              error={errors.days_per_week}
              hint="Used to pro-rata holiday in Phase 2."
            >
              {(p) => <Input {...p} type="number" step="0.5" min="0" max="7" defaultValue={v(employee, "days_per_week")} />}
            </Field>
            <Field name="status" label="Status" error={errors.status}>
              {(p) => (
                <Select {...p} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {Object.entries(EMPLOYMENT_STATUSES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {status === "leaver" && (
              <Field name="end_date" label="Leaving date" error={errors.end_date}>
                {(p) => <Input {...p} type="date" defaultValue={v(employee, "end_date")} />}
              </Field>
            )}
          </fieldset>
        </>
      )}
    </ZodForm>
  );
}

export function PersonalForm({ employeeId, values }: { employeeId: string; values?: Values }) {
  return (
    <ZodForm schema={personalSchema} action={savePersonal} submitLabel="Save personal details">
      {({ errors }) => (
        <>
          <input type="hidden" name="employee_id" value={employeeId} />
          <p className="text-sm text-muted-foreground">All fields are optional. Only HR and you can see these details.</p>
          <div className={grid}>
            <Field name="personal_email" label="Personal email" optional error={errors.personal_email}>
              {(p) => <Input {...p} type="email" autoComplete="email" defaultValue={v(values, "personal_email")} />}
            </Field>
            <Field name="personal_phone" label="Personal phone" optional error={errors.personal_phone}>
              {(p) => <Input {...p} type="tel" autoComplete="tel" defaultValue={v(values, "personal_phone")} />}
            </Field>
            <Field name="address_line1" label="Address line 1" optional error={errors.address_line1}>
              {(p) => <Input {...p} autoComplete="address-line1" defaultValue={v(values, "address_line1")} />}
            </Field>
            <Field name="address_line2" label="Address line 2" optional error={errors.address_line2}>
              {(p) => <Input {...p} autoComplete="address-line2" defaultValue={v(values, "address_line2")} />}
            </Field>
            <Field name="town" label="Town or city" optional error={errors.town}>
              {(p) => <Input {...p} autoComplete="address-level2" defaultValue={v(values, "town")} />}
            </Field>
            <Field name="postcode" label="Postcode" optional error={errors.postcode}>
              {(p) => <Input {...p} autoComplete="postal-code" defaultValue={v(values, "postcode")} />}
            </Field>
            <Field
              name="date_of_birth"
              label="Date of birth"
              optional
              error={errors.date_of_birth}
              hint="Used only for age-related legal rights, such as minimum wage rates."
            >
              {(p) => <Input {...p} type="date" autoComplete="bday" defaultValue={v(values, "date_of_birth")} />}
            </Field>
          </div>
        </>
      )}
    </ZodForm>
  );
}

export function EmergencyContactForm({ employeeId }: { employeeId: string }) {
  return (
    <ZodForm schema={emergencyContactSchema} action={addEmergencyContact} submitLabel="Add contact" resetOnSuccess>
      {({ errors }) => (
        <>
          <input type="hidden" name="employee_id" value={employeeId} />
          <div className={grid}>
            <Field name="name" label="Name" error={errors.name}>
              {(p) => <Input {...p} />}
            </Field>
            <Field name="relationship" label="Relationship" optional error={errors.relationship}>
              {(p) => <Input {...p} placeholder="e.g. Partner" />}
            </Field>
            <Field name="phone" label="Phone" error={errors.phone}>
              {(p) => <Input {...p} type="tel" />}
            </Field>
            <Field name="alt_phone" label="Other phone" optional error={errors.alt_phone}>
              {(p) => <Input {...p} type="tel" />}
            </Field>
          </div>
        </>
      )}
    </ZodForm>
  );
}

export function SalaryForm({ employeeId }: { employeeId: string }) {
  return (
    <ZodForm schema={salarySchema} action={addSalary} submitLabel="Record salary change" resetOnSuccess>
      {({ errors }) => (
        <>
          <input type="hidden" name="employee_id" value={employeeId} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="effective_date" label="Effective from" error={errors.effective_date}>
              {(p) => <Input {...p} type="date" />}
            </Field>
            <Field name="amount" label="Amount (£)" error={errors.amount}>
              {(p) => <Input {...p} type="number" step="0.01" min="0" />}
            </Field>
            <Field name="pay_basis" label="Basis" error={errors.pay_basis}>
              {(p) => (
                <Select {...p} defaultValue="annual">
                  <option value="annual">Per year</option>
                  <option value="hourly">Per hour</option>
                </Select>
              )}
            </Field>
          </div>
          <Field name="reason" label="Reason" optional error={errors.reason}>
            {(p) => <Input {...p} placeholder="e.g. Annual pay review" />}
          </Field>
        </>
      )}
    </ZodForm>
  );
}

export function RtwForm({ employeeId }: { employeeId: string }) {
  const [status, setStatus] = React.useState("verified");
  return (
    <ZodForm schema={rtwSchema} action={addRtwCheck} submitLabel="Record check" resetOnSuccess>
      {({ errors }) => (
        <>
          <input type="hidden" name="employee_id" value={employeeId} />
          <div className={grid}>
            <Field name="check_type" label="Type of check" error={errors.check_type}>
              {(p) => (
                <Select {...p} defaultValue="manual_document">
                  {Object.entries(RTW_CHECK_TYPES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field name="checked_on" label="Date checked" error={errors.checked_on}>
              {(p) => <Input {...p} type="date" />}
            </Field>
            <Field name="status" label="Outcome" error={errors.status}>
              {(p) => (
                <Select {...p} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {Object.entries(RTW_STATUSES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              name="expiry_date"
              label="Permission expires"
              optional={status !== "time_limited"}
              error={errors.expiry_date}
            >
              {(p) => <Input {...p} type="date" />}
            </Field>
            <Field
              name="follow_up_date"
              label="Follow-up check due"
              optional
              error={errors.follow_up_date}
              hint="Usually before the permission expires."
            >
              {(p) => <Input {...p} type="date" />}
            </Field>
          </div>
          <Field name="notes" label="Notes" optional error={errors.notes}>
            {(p) => <Textarea {...p} rows={2} />}
          </Field>
        </>
      )}
    </ZodForm>
  );
}

export function InviteButton({ employeeId }: { employeeId: string }) {
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-2">
      {result && <Alert variant={result.ok ? "success" : "error"}>{result.text}</Alert>}
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const fd = new FormData();
            fd.set("employee_id", employeeId);
            const res = await inviteToPortal(fd);
            setResult(res.ok ? { ok: true, text: res.message ?? "Invitation sent." } : { ok: false, text: res.error });
          })
        }
      >
        {pending ? "Sending…" : "Invite to portal"}
      </Button>
    </div>
  );
}
