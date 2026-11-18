#!/usr/bin/env node
// Downloads every file from every Supabase storage bucket into a folder, for the nightly backup
// (.github/workflows/backup-nightly.yml). Uses the service-role key, so it sees all tenants' files.
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
  console.error(
    "Usage: node scripts/backup-storage.mjs <folder> (needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)",
  );
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// Storage lists one folder level at a time; entries without an id are sub-folders.
async function listAll(bucket, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) files.push(path);
      else files.push(...(await listAll(bucket, path)));
    }
    if (data.length < 1000) return files;
  }
}

const { data: buckets, error } = await admin.storage.listBuckets();
if (error) throw new Error(`list buckets: ${error.message}`);

let count = 0;
let bytes = 0;
for (const bucket of buckets) {
  for (const path of await listAll(bucket.id)) {
    if (path.split("/").includes(".."))
      throw new Error(`Refusing unsafe path ${bucket.id}/${path}`);
    const { data, error } = await admin.storage.from(bucket.id).download(path);
    if (error) throw new Error(`${bucket.id}/${path}: ${error.message}`);
    const target = join(out, bucket.id, path);
    mkdirSync(dirname(target), { recursive: true });
    const buf = Buffer.from(await data.arrayBuffer());
    writeFileSync(target, buf);
    count += 1;
    bytes += buf.length;
  }
}
console.log(
  `downloaded ${count} files (${(bytes / 1048576).toFixed(1)} MB) from ${buckets.length} buckets`,
);
