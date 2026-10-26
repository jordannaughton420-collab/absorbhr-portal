#!/usr/bin/env node
// Uploads a few FAKE demo documents (tiny generated PDFs) for the demo employee, using the
// service-role key exactly as the app's server does. Development project only.
//
// Usage: NODE_USE_ENV_PROXY=1 node scripts/seed-documents.mjs

import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

// A minimal, valid one-page PDF showing a line of text.
function pdf(text) {
  const stream = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const { data: emp } = await admin
  .from("employees")
  .select("id, tenant_id, user_id")
  .eq("work_email", "brightwater.employee@example.com")
  .single();
const { data: hr } = await admin
  .from("employees")
  .select("user_id")
  .eq("work_email", "brightwater.hr@example.com")
  .single();

const old = await admin.from("documents").select("id, storage_path").eq("employee_id", emp.id);
if (old.data?.length) {
  await admin.storage.from("employee-documents").remove(old.data.map((d) => d.storage_path));
  await admin
    .from("documents")
    .delete()
    .in(
      "id",
      old.data.map((d) => d.id),
    );
}

const docs = [
  {
    title: "Contract of employment",
    category: "contract",
    visibility: "hr_and_employee",
    by: hr.user_id,
    text: "DEMO - Contract of employment - Jamie Crumb (fake)",
  },
  {
    title: "Food Hygiene Level 2 certificate",
    category: "certificate",
    visibility: "everyone",
    by: emp.user_id,
    text: "DEMO - Food Hygiene Level 2 certificate (fake)",
  },
  {
    title: "Probation review notes",
    category: "meeting_notes",
    visibility: "hr_only",
    by: hr.user_id,
    text: "DEMO - Probation review notes (fake)",
  },
];
for (const d of docs) {
  const id = randomUUID();
  const path = `${emp.tenant_id}/${emp.id}/${id}`;
  const bytes = pdf(d.text);
  const up = await admin.storage
    .from("employee-documents")
    .upload(path, bytes, { contentType: "application/pdf" });
  if (up.error) throw up.error;
  const ins = await admin.from("documents").insert({
    id,
    tenant_id: emp.tenant_id,
    employee_id: emp.id,
    category: d.category,
    title: d.title,
    file_name: `${d.title.replace(/\s+/g, "-").toLowerCase()}.pdf`,
    mime_type: "application/pdf",
    size_bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    visibility: d.visibility,
    status: "available",
    storage_path: path,
    uploaded_by: d.by,
  });
  if (ins.error) throw ins.error;
  console.log(`uploaded: ${d.title}`);
}
