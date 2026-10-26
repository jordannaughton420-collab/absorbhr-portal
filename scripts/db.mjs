#!/usr/bin/env node
// Runs SQL against the hosted Supabase project through the Supabase Management API
// (HTTPS only — works where direct Postgres connections are blocked).
//
// Usage:
//   node scripts/db.mjs query "select 1"        run one SQL string
//   node scripts/db.mjs file path/to/file.sql   run a SQL file
//   node scripts/db.mjs migrate                 apply new files in supabase/migrations
//   node scripts/db.mjs seed                    run supabase/seed.sql + seed_absence.sql
//   node scripts/db.mjs test                    run every supabase/tests/*.sql (pgTAP)
//   node scripts/db.mjs types                   regenerate lib/database.types.ts
//
// Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF (or NEXT_PUBLIC_SUPABASE_URL).

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref =
  process.env.SUPABASE_PROJECT_REF ??
  process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

if (!token || !ref) {
  console.error("Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF.");
  process.exit(1);
}

export async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`);
  return body;
}

const sqlString = (s) => `'${s.replaceAll("'", "''")}'`;

async function migrate() {
  await runSql(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations
      (version text primary key, statements text[], name text);`);
  const applied = new Set(
    (await runSql("select version from supabase_migrations.schema_migrations")).map(
      (r) => r.version,
    ),
  );
  const dir = "supabase/migrations";
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const [version, ...rest] = basename(f, ".sql").split("_");
    if (applied.has(version)) continue;
    const sql = readFileSync(join(dir, f), "utf8");
    // Migration and its bookkeeping row commit together or not at all.
    await runSql(`begin;\n${sql}\n;insert into supabase_migrations.schema_migrations(version, name, statements)
      values (${sqlString(version)}, ${sqlString(rest.join("_"))}, array[${sqlString(sql)}]);\ncommit;`);
    console.log(`applied ${f}`);
  }
  console.log("migrations up to date");
}

async function types() {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/types/typescript?included_schemas=public`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await res.json();
  if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`);
  writeFileSync("lib/database.types.ts", body.types);
  console.log("wrote lib/database.types.ts");
}

async function seed() {
  const password = process.env.SEED_PASSWORD ?? "";
  if (password.length < 12) throw new Error("Set SEED_PASSWORD (at least 12 characters).");
  const sql = readFileSync("supabase/seed.sql", "utf8").replace(
    "{{SEED_PASSWORD}}",
    password.replaceAll("'", "''"),
  );
  await runSql(sql);
  await runSql(readFileSync("supabase/seed_absence.sql", "utf8"));
  await runSql(readFileSync("supabase/seed_policies.sql", "utf8"));
  console.log("seeded fake demo data");
}

async function test() {
  const dir = "supabase/tests";
  const setup = readFileSync(join(dir, "_setup.sql"), "utf8");
  let failed = 0;
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("_"))
    .sort()) {
    const rows = await runSql(`${setup}\n${readFileSync(join(dir, f), "utf8")}`);
    const lines = rows.flatMap((r) => Object.values(r)).map(String);
    const bad = lines.filter((l) => l.startsWith("not ok") || l.startsWith("# Looks like"));
    failed += bad.length ? 1 : 0;
    console.log(
      `${bad.length ? "FAIL" : "ok  "} ${f} (${lines.filter((l) => /^ok /.test(l)).length} passed)`,
    );
    for (const l of bad) console.log("     " + l);
  }
  if (failed) process.exit(1);
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === "query") console.log(JSON.stringify(await runSql(arg), null, 2));
  else if (cmd === "file")
    console.log(JSON.stringify(await runSql(readFileSync(arg, "utf8")), null, 2));
  else if (cmd === "migrate") await migrate();
  else if (cmd === "seed") await seed();
  else if (cmd === "test") await test();
  else if (cmd === "types") await types();
  else {
    console.error("Unknown command. See the comment at the top of scripts/db.mjs.");
    process.exit(1);
  }
} catch (e) {
  console.error(`Database error: ${e.message}`);
  process.exit(1);
}
