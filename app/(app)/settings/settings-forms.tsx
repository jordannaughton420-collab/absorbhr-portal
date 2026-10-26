"use client";

import { ZodForm } from "@/components/forms/zod-form";
import { Field, Input, Select } from "@/components/ui/form";
import {
  REGIONS,
  ROLES,
  companySchema,
  locationSchema,
  nameSchema,
  roleSchema,
  securitySettingsSchema,
} from "@/lib/validation/settings";
import { addDepartment, addLocation, updateCompany, updateRole, updateSecuritySettings } from "./actions";

function RegionSelect(props: React.ComponentProps<typeof Select> & { allowNone?: boolean }) {
  const { allowNone, ...rest } = props;
  return (
    <Select {...rest}>
      {allowNone && <option value="">Same as company</option>}
      {Object.entries(REGIONS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </Select>
  );
}

export function CompanyForm({ name, region }: { name: string; region: string }) {
  return (
    <ZodForm schema={companySchema} action={updateCompany} submitLabel="Save company details">
      {({ errors }) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label="Company name" error={errors.name}>
            {(p) => <Input {...p} defaultValue={name} />}
          </Field>
          <Field name="bank_holiday_region" label="Bank holidays" error={errors.bank_holiday_region} hint="Used for holiday calculations in Phase 2.">
            {(p) => <RegionSelect {...p} defaultValue={region} />}
          </Field>
        </div>
      )}
    </ZodForm>
  );
}

function Toggle({ name, label, hint, defaultChecked }: { name: string; label: string; hint: string; defaultChecked: boolean }) {
  return (
    <div className="flex gap-3">
      <input id={`f-${name}`} name={name} type="checkbox" defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-primary" aria-describedby={`f-${name}-hint`} />
      <div>
        <label htmlFor={`f-${name}`} className="text-sm font-medium">
          {label}
        </label>
        <p id={`f-${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      </div>
    </div>
  );
}

export function SecurityForm({
  values,
}: {
  values: { session_idle_minutes: number; require_mfa_for_all: boolean; employees_can_view_own_salary: boolean; diversity_monitoring_enabled: boolean };
}) {
  return (
    <ZodForm schema={securitySettingsSchema} action={updateSecuritySettings} submitLabel="Save settings">
      {({ errors }) => (
        <>
          <Field
            name="session_idle_minutes"
            label="Sign people out after this many minutes of inactivity"
            error={errors.session_idle_minutes}
            className="max-w-xs"
          >
            {(p) => <Input {...p} type="number" min={5} max={480} defaultValue={values.session_idle_minutes} />}
          </Field>
          <Toggle
            name="require_mfa_for_all"
            label="Require two-step verification for everyone"
            hint="Admins and HR managers always need it. Turn this on to require it for line managers and employees too."
            defaultChecked={values.require_mfa_for_all}
          />
          <Toggle
            name="employees_can_view_own_salary"
            label="Let employees see their own salary history"
            hint="Off by default. Line managers never see salaries."
            defaultChecked={values.employees_can_view_own_salary}
          />
          <Toggle
            name="diversity_monitoring_enabled"
            label="Collect voluntary equality and diversity information"
            hint="Special category data. Only switch on if you have a clear purpose documented in your DPIA."
            defaultChecked={values.diversity_monitoring_enabled}
          />
        </>
      )}
    </ZodForm>
  );
}

export function AddDepartmentForm() {
  return (
    <ZodForm schema={nameSchema} action={addDepartment} submitLabel="Add department" resetOnSuccess>
      {({ errors }) => (
        <Field name="name" label="New department name" error={errors.name}>
          {(p) => <Input {...p} />}
        </Field>
      )}
    </ZodForm>
  );
}

export function AddLocationForm() {
  return (
    <ZodForm schema={locationSchema} action={addLocation} submitLabel="Add location" resetOnSuccess>
      {({ errors }) => (
        <>
          <Field name="name" label="New location name" error={errors.name}>
            {(p) => <Input {...p} />}
          </Field>
          <Field name="address" label="Business address" optional error={errors.address}>
            {(p) => <Input {...p} />}
          </Field>
          <Field name="bank_holiday_region" label="Bank holidays" optional error={errors.bank_holiday_region}>
            {(p) => <RegionSelect {...p} allowNone defaultValue="" />}
          </Field>
        </>
      )}
    </ZodForm>
  );
}

export function RoleForm({ membershipId, role, isActive, label }: { membershipId: string; role: string; isActive: boolean; label: string }) {
  return (
    <ZodForm schema={roleSchema} action={updateRole} submitLabel="Save" submitClassName="h-9 px-3">
      {({ errors }) => (
        <div className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="membership_id" value={membershipId} />
          <Field name="role" id={`role-${membershipId}`} label={`Role for ${label}`} error={errors.role} className="min-w-44">
            {(p) => (
              <Select {...p} defaultValue={role}>
                {Object.entries(ROLES).map(([value, l]) => (
                  <option key={value} value={value}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <label className="flex h-10 items-center gap-2 text-sm">
            <input name="is_active" type="checkbox" defaultChecked={isActive} className="size-4 accent-primary" />
            Can sign in
          </label>
        </div>
      )}
    </ZodForm>
  );
}
