#!/usr/bin/env node
// Downloads every file in every Supabase Storage bucket into a folder, for the nightly backup
// (.github/workflows/backup-krystal.yml). Read-only: nothing in Supabase is changed.
//
// Usage: node scripts/backup-storage.mjs <output folder>
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const out = process.argv[2];
if (!url || !key || !out) {
  console.error("Usage: node scripts/backup-storage.mjs <output folder>");
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

const PAGE = 1000;

// Storage lists one folder level at a time; folders come back with id === null.
async function* walk(bucket, prefix = "") {
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) yield* walk(bucket, path);
      else yield path;
    }
    if (data.length < PAGE) return;
  }
}

const { data: buckets, error } = await admin.storage.listBuckets();
if (error) throw new Error(error.message);

const manifest = [];
for (const { id: bucket } of buckets) {
  let count = 0;
  for await (const path of walk(bucket)) {
    if (path.split("/").some((part) => part === ".." || part === "")) {
      throw new Error(`Refusing unsafe object path: ${bucket}/${path}`);
    }
    const { data, error: dlError } = await admin.storage.from(bucket).download(path);
    if (dlError) throw new Error(`${bucket}/${path}: ${dlError.message}`);
    const file = join(out, bucket, path);
    mkdirSync(dirname(file), { recursive: true });
    const bytes = Buffer.from(await data.arrayBuffer());
    writeFileSync(file, bytes);
    manifest.push({ bucket, path, bytes: bytes.length });
    count++;
  }
  console.log(`${bucket}: ${count} files`);
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
