// Safety check shared by the end-to-end tests and the reset script.
// The tests sign in as made-up users and change data, so they must only ever
// run against the TEST (development) Supabase project, never production.

export const TEST_PROJECT_REF = "djdjrrziukllerhhnrix"; // development project, London
export const PRODUCTION_PROJECT_REF = "gnvmakhtgnswlmsdquai"; // live portal — never touch

export function assertTestDatabase(env = process.env) {
  const problems = [];
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const ref = env.SUPABASE_PROJECT_REF;

  if ([url, ref ?? ""].some((v) => v.includes(PRODUCTION_PROJECT_REF)))
    problems.push("the settings point at the LIVE database");
  else if (url !== `https://${TEST_PROJECT_REF}.supabase.co`)
    problems.push("NEXT_PUBLIC_SUPABASE_URL is not the test project");
  if (ref && ref !== TEST_PROJECT_REF)
    problems.push("SUPABASE_PROJECT_REF is not the test project");
  if (!env.SEED_PASSWORD || env.SEED_PASSWORD.length < 12)
    problems.push("SEED_PASSWORD (at least 12 characters) is missing from .env.local");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) problems.push("SUPABASE_SERVICE_ROLE_KEY is missing");

  if (problems.length)
    throw new Error(
      `Stopped before doing anything: ${problems.join("; ")}.\n` +
        "End-to-end tests only run against the test database.",
    );
}
