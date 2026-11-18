// Resets the TEST database to the made-up demo data, so every test run starts
// from the same place. Run with:  npm run test:e2e:reset
//
// Uses SEED_PASSWORD from .env.local as the password for every @example.com login,
// clears the sign-in rate limits, and forgets saved test sign-ins.

import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { assertTestDatabase, TEST_PROJECT_REF } from "./guard.mjs";

assertTestDatabase();
const env = { ...process.env, SUPABASE_PROJECT_REF: TEST_PROJECT_REF };
const db = (...args) =>
  execFileSync("node", ["scripts/db.mjs", ...args], { env, stdio: "inherit" });

db("seed");
db("query", "delete from app.rate_limits");
rmSync(new URL("./.auth", import.meta.url), { recursive: true, force: true });
console.log("Test database reset. Saved test sign-ins cleared.");
