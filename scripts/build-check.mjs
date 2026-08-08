#!/usr/bin/env node
/**
 * `next build`, runnable without real credentials.
 *
 * WHY
 *
 * `npm run build` fails on a fresh clone with no .env — not because anything is
 * broken, but because `@supabase/ssr` throws when NEXT_PUBLIC_SUPABASE_URL is
 * undefined, and prerendering a page that constructs a client hits that at
 * build time. The failure looks exactly like a real one:
 *
 *   Error: @supabase/ssr: Your project's URL and API key are required
 *   > Export encountered errors on following paths:
 *       /notifications/page: /notifications
 *       /protected/page: /protected
 *
 * The practical effect is that a whole class of change goes unverified
 * locally — you get `tsc` and nothing else, and `tsc` cannot see a page that
 * throws during render. That gap was real for most of this redesign: the local
 * build had been failing so long it was being read as expected.
 *
 * WHAT THIS DOES NOT DO
 *
 * The placeholders are syntactically valid and point at nothing. Every page
 * COMPILES and every page that prerenders RENDERS, which is what this is for.
 * No query runs, so a build that passes here says nothing about whether the
 * data layer works. For that there is no substitute for a real booking through
 * a real checkout.
 *
 * The values never touch disk — no .env is written, so there is nothing to
 * accidentally commit and nothing to shadow a real .env you already have.
 *
 * Usage:  npm run build:check
 */

import { spawnSync } from "node:child_process";

/**
 * A well-formed anon JWT for a project named `placeholder`. It has to parse,
 * because the client validates its shape before it ever makes a request; it
 * does not have to be valid, because it never makes one.
 */
const PLACEHOLDER_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24ifQ." +
  "placeholder-signature-not-valid";

/** Real values win. This only fills gaps, so it is safe to run with a real .env present. */
const FALLBACKS = {
  NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: PLACEHOLDER_JWT,
  SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_JWT,
};

const env = { ...process.env };
const filled = [];

for (const [key, value] of Object.entries(FALLBACKS)) {
  if (!env[key]) {
    env[key] = value;
    filled.push(key);
  }
}

if (filled.length > 0) {
  console.log(`\nbuild:check — placeholders for ${filled.join(", ")}`);
  console.log("These point at nothing. A pass means every page compiles and renders,");
  console.log("NOT that any query works.\n");
} else {
  console.log("\nbuild:check — real env present, using it.\n");
}

const result = spawnSync("npx", ["next", "build"], { stdio: "inherit", env });
process.exit(result.status ?? 1);
