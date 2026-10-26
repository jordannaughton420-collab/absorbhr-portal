"use client";

import { ZodForm } from "@/components/forms/zod-form";
import { Field, Input, Select } from "@/components/ui/form";
import { ASSIGNEES, startChecklistSchema, templateItemSchema } from "@/lib/validation/people";
import { addTemplateItem, startChecklist } from "./actions";

type Option = { id: string; name: string };

export function StartChecklistForm({
  people,
  templates,
}: {
  people: Option[];
  templates: (Option & { kind: string })[];
}) {
  return (
    <ZodForm schema={startChecklistSchema} action={startChecklist} submitLabel="Start checklist">
      {({ errors }) => (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="employee_id" label="Person" error={errors.employee_id}>
            {(p) => (
              <Select {...p} defaultValue="">
                <option value="" disabled>
                  Choose
                </option>
                {people.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field name="template_id" label="Checklist" error={errors.template_id}>
            {(p) => (
              <Select {...p} defaultValue="">
                <option value="" disabled>
                  Choose
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            name="anchor_date"
            label="Start or leaving date"
            error={errors.anchor_date}
            hint="Task due dates are worked out from this."
          >
            {(p) => <Input {...p} type="date" />}
          </Field>
        </div>
      )}
    </ZodForm>
  );
}

export function TemplateItemForm({ templateId }: { templateId: string }) {
  return (
    <ZodForm
      schema={templateItemSchema}
      action={addTemplateItem}
      submitLabel="Add task"
      resetOnSuccess
    >
      {({ errors }) => (
        <>
          <input type="hidden" name="template_id" value={templateId} />
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
            <Field name="title" id={`title-${templateId}`} label="Task" error={errors.title}>
              {(p) => <Input {...p} maxLength={200} />}
            </Field>
            <Field
              name="assignee"
              id={`assignee-${templateId}`}
              label="Who does it"
              error={errors.assignee}
            >
              {(p) => (
                <Select {...p} defaultValue="hr">
                  {Object.entries(ASSIGNEES).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              name="due_offset_days"
              id={`due-${templateId}`}
              label="Due (days from date)"
              error={errors.due_offset_days}
              hint="Use minus for before, e.g. -7."
            >
              {(p) => <Input {...p} type="number" defaultValue={0} min={-90} max={365} />}
            </Field>
          </div>
        </>
      )}
    </ZodForm>
  );
}
