import "server-only";
import { createHash } from "node:crypto";

// Allowed upload types (decided by AbsorbHR, 26 Oct 2026): PDF, Word, JPEG, PNG, HEIC — max 10 MB.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const FILE_TYPES: Record<string, { label: string; check: (b: Buffer) => boolean }> = {
  "application/pdf": {
    label: "PDF",
    check: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
  },
  "image/jpeg": { label: "JPEG", check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": {
    label: "PNG",
    check: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  "image/heic": { label: "HEIC", check: (b) => isHeif(b) },
  "image/heif": { label: "HEIF", check: (b) => isHeif(b) },
  // .docx is a ZIP containing word/document.xml. Macro-enabled .docm files are rejected (different content type).
  [DOCX]: {
    label: "Word",
    check: (b) =>
      b[0] === 0x50 &&
      b[1] === 0x4b &&
      b[2] === 0x03 &&
      b[3] === 0x04 &&
      b.includes(Buffer.from("word/")) &&
      !b.includes(Buffer.from("vbaProject.bin")),
  },
};

function isHeif(b: Buffer) {
  const brand = b.subarray(4, 12).toString("latin1");
  return [
    "ftypheic",
    "ftypheix",
    "ftyphevc",
    "ftypmif1",
    "ftypmsf1",
    "ftypheim",
    "ftypheis",
  ].includes(brand);
}

/** True when the file's actual bytes match the type it claims to be. */
export function contentMatchesType(bytes: Buffer, mime: string) {
  return Boolean(FILE_TYPES[mime]?.check(bytes));
}

export function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Keeps only a safe, readable base name (no paths, control characters or odd symbols). */
export function safeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._ ()-]+/gu, "_")
    .replace(/_+/g, "_")
    .trim();
  return (cleaned || "file").slice(-120);
}
