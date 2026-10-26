"use client";

import { ZodForm } from "@/components/forms/zod-form";
import { Field, Input, Textarea } from "@/components/ui/form";
import { noteSchema } from "@/lib/validation/people";
import { addNote } from "@/app/(app)/employees/notes-actions";

export function NoteForm({ employeeId }: { employeeId: string }) {
  return (
    <ZodForm schema={noteSchema} action={addNote} submitLabel="Save notes" resetOnSuccess>
      {({ errors }) => (
        <>
          <input type="hidden" name="employee_id" value={employeeId} />
          <Field
            name="meeting_date"
            id="note-meeting_date"
            label="Meeting date"
            error={errors.meeting_date}
            className="max-w-xs"
          >
            {(p) => (
              <Input {...p} type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            )}
          </Field>
          <Field name="notes" id="note-notes" label="What you discussed" error={errors.notes}>
            {(p) => <Textarea {...p} rows={4} />}
          </Field>
          <Field
            name="actions"
            id="note-actions"
            label="Agreed actions"
            optional
            error={errors.actions}
          >
            {(p) => <Textarea {...p} rows={2} />}
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="is_private" className="mt-0.5 size-4 accent-primary" />
            <span>
              Private — only me and HR
              <span className="block text-xs text-muted-foreground">
                The employee won&apos;t see it in the portal, but it can still be disclosed if they
                make a Subject Access Request.
              </span>
            </span>
          </label>
        </>
      )}
    </ZodForm>
  );
}
