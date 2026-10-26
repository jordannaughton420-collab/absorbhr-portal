import { z } from "zod";

export const DOCUMENT_CATEGORIES = {
  contract: "Contract",
  letter: "Letter",
  certificate: "Certificate or qualification",
  right_to_work: "Right-to-work document",
  fit_note: "Fit note (health)",
  meeting_notes: "Meeting notes",
  other: "Other",
} as const;

export const DOCUMENT_VISIBILITY = {
  hr_only: "HR only",
  hr_and_manager: "HR and line manager",
  hr_and_employee: "HR and the employee",
  everyone: "HR, the employee and their line manager",
} as const;

export const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const ACCEPT_ATTRIBUTE = ".pdf,.jpg,.jpeg,.png,.heic,.heif,.docx";
export const MAX_UPLOAD_MB = 10;

/** Browsers don't always report a type (e.g. HEIC), so fall back to the file extension. */
export function mimeFor(name: string, reported: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const byExt = MIME_BY_EXTENSION[ext];
  return byExt ?? (Object.values(MIME_BY_EXTENSION).includes(reported) ? reported : "");
}

export const startUploadSchema = z.object({
  employee_id: z.uuid(),
  category: z.enum(
    Object.keys(DOCUMENT_CATEGORIES) as [keyof typeof DOCUMENT_CATEGORIES],
    "Choose a category",
  ),
  visibility: z.enum(Object.keys(DOCUMENT_VISIBILITY) as [keyof typeof DOCUMENT_VISIBILITY]),
  title: z.string().trim().min(1, "Give the document a title").max(200),
  file_name: z.string().min(1).max(255),
  mime_type: z.enum(
    Object.values(MIME_BY_EXTENSION) as [string, ...string[]],
    "That type of file isn't allowed. Use PDF, Word (.docx), JPEG, PNG or HEIC.",
  ),
  size: z
    .number()
    .int()
    .min(1, "The file is empty")
    .max(MAX_UPLOAD_MB * 1024 * 1024, `Files must be ${MAX_UPLOAD_MB} MB or smaller`),
});

export const updateDocumentSchema = z.object({
  id: z.uuid(),
  visibility: z.enum(Object.keys(DOCUMENT_VISIBILITY) as [keyof typeof DOCUMENT_VISIBILITY]),
});
