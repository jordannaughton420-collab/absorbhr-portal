#!/usr/bin/env node
// Creates (or re-creates) the demo company on the live portal: "Brightwater Bakery Ltd (Demo)",
// made-up staff, holiday, policies, reviews, a case and data-protection examples, plus four
// logins on Gmail "+" addresses of one inbox. The logins have no password: each one uses
// "Forgot password" on the site to choose its own.
//
// Usage: NODE_USE_ENV_PROXY=1 node scripts/seed-demo-company.mjs someone@gmail.com [--dry-run]
// --dry-run runs everything inside one transaction and rolls it back, so nothing is kept.
// Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF (the project to put the demo in).

import { readFileSync } from "node:fs";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
const dryRun = process.argv.includes("--dry-run");
const gmail = (process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "").trim().toLowerCase();
const match = gmail.match(/^([a-z0-9.]+)@(gmail\.com|googlemail\.com)$/);
if (!token || !ref || !match) {
  console.error(
    "Usage: node scripts/seed-demo-company.mjs someone@gmail.com (needs SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF)",
  );
  process.exit(1);
}

const login = (role) => `${match[1]}+${role}@${match[2]}`;
const emails = {
  ADMIN: login("admin"),
  HR: login("hr"),
  MANAGER: login("manager"),
  EMPLOYEE: login("employee"),
};

// The Brightwater demo scripts written for the test site, pointed at the demo company and logins.
const replacements = [
  ["'Brightwater Bakery Ltd'", "'Brightwater Bakery Ltd (Demo)'"],
  ["brightwater.admin@example.com", emails.ADMIN],
  ["brightwater.hr@example.com", emails.HR],
  ["brightwater.manager@example.com", emails.MANAGER],
  ["brightwater.employee@example.com", emails.EMPLOYEE],
];
const load = (file) =>
  replacements.reduce((sql, [from, to]) => sql.replaceAll(from, to), readFileSync(file, "utf8"));

let company = readFileSync("supabase/demo_company.sql", "utf8");
for (const [key, value] of Object.entries(emails))
  company = company.replaceAll(`{{${key}}}`, value);

const steps = [
  ["company, staff and logins", company],
  ["policies and AbsorbHR templates", load("supabase/seed_policies.sql")],
  ["holiday and sickness", load("supabase/seed_absence.sql")],
  ["checklists, reviews, 1-to-1s, case", load("supabase/seed_people.sql")],
  ["leavers and breach log", load("supabase/seed_gdpr.sql")],
];

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`);
  return body;
}

for (const [label, sql] of steps)
  if (/brightwater\.\w+@example\.com/.test(sql))
    throw new Error(`unreplaced demo login in ${label}`);

if (dryRun) {
  const check = `select (select count(*) from public.employees e join public.tenants t on t.id = e.tenant_id
      where t.name = 'Brightwater Bakery Ltd (Demo)') as employees,
    (select count(*) from public.leave_requests l join public.tenants t on t.id = l.tenant_id
      where t.name = 'Brightwater Bakery Ltd (Demo)') as leave_requests,
    (select count(*) from auth.users where email in (${Object.values(emails)
      .map((e) => `'${e}'`)
      .join(", ")})) as logins`;
  const rows = await runSql(
    `begin;\n${steps.map(([, sql]) => sql).join("\n;\n")}\n;\n${check};\nrollback;`,
  );
  console.log("dry run OK (rolled back):", JSON.stringify(rows));
  process.exit(0);
}

for (const [label, sql] of steps) {
  await runSql(sql);
  console.log(`done: ${label}`);
}
console.log("Demo logins (each sets its own password via Forgot password):");
for (const [role, email] of Object.entries(emails)) console.log(`  ${role.padEnd(8)} ${email}`);
