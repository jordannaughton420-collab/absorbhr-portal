import "server-only";
import { zipSync, strToU8 } from "fflate";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type SarData = Record<string, Json>;

const SECTION_TITLES: Record<string, string> = {
  employment_record: "Employment record",
  portal_account: "Portal account",
  personal_details: "Personal details",
  emergency_contacts: "Emergency contacts",
  employment_history: "Employment history",
  salary_history: "Salary history",
  right_to_work_checks: "Right-to-work checks",
  equality_monitoring: "Equality monitoring (voluntary)",
  leave_requests: "Holiday and leave",
  leave_adjustments: "Holiday adjustments",
  sickness: "Sickness absence",
  documents: "Documents",
  policy_acknowledgements: "Policies read",
  privacy_notice_acknowledgements: "Privacy notices read",
  checklists: "Onboarding and offboarding",
  performance_reviews: "Performance reviews",
  one_to_one_notes: "1-to-1 notes",
  cases: "Disciplinary and grievance cases",
  correction_requests: "Correction requests",
  who_accessed_this_record: "Who has accessed or changed this record",
};

// Fields that are internal identifiers and mean nothing to the reader.
const HIDDEN = /(^|_)(id|by|storage_path|payload|author_id|tenant_id)$/;

const label = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

// Standard PDF fonts only cover basic Latin characters.
const pdfSafe = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");

function formatValue(v: Json): string {
  if (v === null || v === "") return "-";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v.length === 10 ? `${v}T12:00:00Z` : v);
    if (!Number.isNaN(d.getTime()))
      return v.length === 10
        ? d.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "Europe/London",
          })
        : d.toLocaleString("en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Europe/London",
          });
  }
  if (Array.isArray(v))
    return v.map((x) => (typeof x === "object" && x ? JSON.stringify(x) : String(x))).join(", ");
  if (typeof v === "object")
    return Object.entries(v)
      .map(([k, x]) => `${label(k)}: ${formatValue(x)}`)
      .join("; ");
  return String(v);
}

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([595, 842]); // A4
    this.y = 800;
  }
  line(
    text: string,
    opts: {
      size?: number;
      bold?: boolean;
      indent?: number;
      colour?: [number, number, number];
    } = {},
  ) {
    const size = opts.size ?? 9.5;
    const font = opts.bold ? this.bold : this.font;
    const x = 48 + (opts.indent ?? 0);
    const width = 595 - 48 - x;
    for (const para of pdfSafe(text).split("\n")) {
      let current = "";
      const words = para.split(" ");
      const flush = () => {
        if (this.y < 56) this.newPage();
        this.page.drawText(current, {
          x,
          y: this.y,
          size,
          font,
          color: rgb(...(opts.colour ?? [0.1, 0.1, 0.1])),
        });
        this.y -= size * 1.45;
        current = "";
      };
      for (const w of words) {
        const next = current ? `${current} ${w}` : w;
        if (font.widthOfTextAtSize(next, size) > width && current) {
          flush();
          current = w;
        } else current = next;
      }
      flush();
    }
  }
  gap(n = 6) {
    this.y -= n;
  }
}

async function summaryPdf(
  data: SarData,
  meta: { name: string; company: string; received: string; generated: string },
) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Subject access request - ${pdfSafe(meta.name)}`);
  const w = new Writer(
    doc,
    await doc.embedFont(StandardFonts.Helvetica),
    await doc.embedFont(StandardFonts.HelveticaBold),
  );
  w.line("Personal data held about you", { size: 18, bold: true, colour: [0.34, 0, 0.5] });
  w.gap();
  w.line(`${meta.name} - ${meta.company}`, { size: 11, bold: true });
  w.line(`Request received ${meta.received}. Prepared ${meta.generated}.`);
  w.line(
    "This summary lists the personal data the company holds about you in the AbsorbHR Portal. The full data is in data.json, and copies of your documents are in the documents folder. Internal reference numbers are left out of this summary.",
  );
  w.gap(10);
  for (const [key, title] of Object.entries(SECTION_TITLES)) {
    const value = data[key];
    w.line(title, { size: 12, bold: true, colour: [0.34, 0, 0.5] });
    const rows = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
    if (!rows.length) w.line("None held.", { indent: 8 });
    rows.forEach((row, i) => {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        if (rows.length > 1) w.line(`${i + 1}.`, { bold: true, indent: 4 });
        for (const [k, v] of Object.entries(row)) {
          if (HIDDEN.test(k) && k !== "id") continue;
          if (k === "id" || v === null || v === "") continue;
          w.line(`${label(k)}: ${formatValue(v)}`, { indent: 12 });
        }
      } else w.line(formatValue(row), { indent: 8 });
    });
    w.gap(10);
  }
  return doc.save();
}

export async function buildSarZip(
  data: SarData,
  files: { name: string; bytes: Uint8Array }[],
  meta: { name: string; company: string; received: string; generated: string },
) {
  const pdf = await summaryPdf(data, meta);
  const readme = [
    "Subject Access Request export",
    "",
    "summary.pdf   A readable summary of all personal data held.",
    "data.json     The same data in a machine-readable format (data portability).",
    "documents/    Copies of documents held on your record.",
    "",
    "Before sending: HR must check this export. Records about other people (for example witnesses",
    "in a case) may need to be redacted under the Data Protection Act 2018, Schedule 2.",
  ].join("\n");
  const entries: Record<string, Uint8Array> = {
    "README.txt": strToU8(readme),
    "summary.pdf": pdf,
    "data.json": strToU8(JSON.stringify(data, null, 2)),
  };
  const used = new Set<string>();
  for (const f of files) {
    let name = f.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "document";
    while (used.has(name)) name = `copy-${name}`;
    used.add(name);
    entries[`documents/${name}`] = f.bytes;
  }
  return zipSync(entries, { level: 6 });
}
