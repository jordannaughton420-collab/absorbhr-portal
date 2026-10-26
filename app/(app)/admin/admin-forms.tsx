"use client";

import { ZodForm } from "@/components/forms/zod-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { REGIONS, newTenantSchema, supportSessionSchema } from "@/lib/validation/settings";
import { createTenantWithAdmin, startSupportSession } from "./actions";

export function NewTenantForm() {
  return (
    <ZodForm
      schema={newTenantSchema}
      action={createTenantWithAdmin}
      submitLabel="Create client and invite admin"
      resetOnSuccess
    >
      {({ errors }) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label="Company name" error={errors.name}>
            {(p) => <Input {...p} />}
          </Field>
          <Field
            name="bank_holiday_region"
            label="Bank holidays"
            error={errors.bank_holiday_region}
          >
            {(p) => (
              <Select {...p} defaultValue="england-and-wales">
                {Object.entries(REGIONS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            name="admin_first_name"
            label="Client Admin first name"
            error={errors.admin_first_name}
          >
            {(p) => <Input {...p} />}
          </Field>
          <Field
            name="admin_last_name"
            label="Client Admin last name"
            error={errors.admin_last_name}
          >
            {(p) => <Input {...p} />}
          </Field>
          <Field
            name="admin_email"
            label="Client Admin work email"
            error={errors.admin_email}
            className="sm:col-span-2"
          >
            {(p) => <Input {...p} type="email" />}
          </Field>
        </div>
      )}
    </ZodForm>
  );
}

export function SupportSessionForm({ tenants }: { tenants: { id: string; name: string }[] }) {
  return (
    <ZodForm
      schema={supportSessionSchema}
      action={startSupportSession}
      submitLabel="Open support session"
      pendingLabel="Opening…"
    >
      {({ errors }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="tenant_id" label="Company" error={errors.tenant_id}>
              {(p) => (
                <Select {...p} defaultValue="">
                  <option value="" disabled>
                    Choose a company
                  </option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field name="minutes" label="Duration" error={errors.minutes}>
              {(p) => (
                <Select {...p} defaultValue="60">
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="120">2 hours</option>
                </Select>
              )}
            </Field>
          </div>
          <Field
            name="reason"
            label="Reason"
            error={errors.reason}
            hint="The client can see this reason. Do not include personal data."
          >
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                placeholder="e.g. Helping the HR manager set up departments (ticket 1234)"
              />
            )}
          </Field>
        </>
      )}
    </ZodForm>
  );
}
