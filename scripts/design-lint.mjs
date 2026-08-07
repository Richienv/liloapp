#!/usr/bin/env node
/**
 * The design system, checked mechanically.
 *
 * WHY THIS EXISTS
 *
 * The redesign has been verified with ad-hoc greps — one per rule, retyped
 * every time, and only over the files someone remembered to check. That found
 * real problems, but it is not a measure: it cannot say whether the app is
 * better or worse than it was an hour ago, and a rule nobody greps for is a
 * rule that quietly stops applying.
 *
 * WHAT IT CANNOT DO
 *
 * Read this before trusting a clean run. Every genuinely damaging defect this
 * redesign has produced was invisible to a grep:
 *
 *   - a booking screen quoting the pre-tax price and charging the tax-inclusive one
 *   - `text-copy` deleted by tailwind-merge, so a component silently kept 14px
 *   - a safety step with five separate reds on it, every class a valid token
 *   - a pay button enabled before an hour was chosen
 *   - fabricated ratings and host counts, all perfectly styled
 *
 * A clean run means no BANNED CLASS is present. It does not mean the page
 * implements the design. Only reading the screen does that.
 *
 * Usage:
 *   node scripts/design-lint.mjs           # summary
 *   node scripts/design-lint.mjs --verbose # every hit with line numbers
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const VERBOSE = process.argv.includes("--verbose");

/**
 * Each rule is a thing the brief states outright. The `why` is printed on a
 * hit, because a rule without its reason gets worked around rather than
 * followed.
 */
const RULES = [
  {
    id: "gradient",
    why: "The brief's first rule: delete every gradient. Exceptions are scrims over photos and marquee edge fades — mark those with an eslint-style comment above.",
    re: /\b(bg-gradient-to-|bg-\[linear-gradient)|linear-gradient\(/,
  },
  {
    id: "legacy-accent",
    why: "#4A90E2 and the navy/purple ramp are the pre-redesign accent. The accent is #2563eb, via bg-brand.",
    re: /#4A90E2|#1e40af|#6b21a8/i,
  },
  {
    id: "cool-grey",
    why: "Tailwind's greys are cool; the design's are warm. Use text-ink / border-hairline / bg-surface-*.",
    re: /\b(text|bg|border)-(gray|slate|zinc|neutral|stone)-\d/,
  },
  {
    id: "dead-token",
    why: "A token name with digits after it is not a class — it resolves to nothing and renders as nothing. Usually left by a find-and-replace over Tailwind's numbered scale.",
    // This found `bg-surface-tint0` in both status-dot switches on the host
    // dashboard, in the DEFAULT branch — so any unrecognised status rendered an
    // invisible dot. It survived seven commits and a full audit, because it
    // type-checks, it builds, and it looks entirely normal in the source.
    re: /\b(bg|text|border|ring|from|via|to)-(canvas|surface|ink|hairline|brand|positive|caution|destructive)[a-z-]*\d+\b/,
  },
  {
    id: "off-palette",
    why: "Tailwind's colour families are not the design's. Accent is bg-brand; states are text-positive / text-caution / text-destructive-emphasis on their -tint and -line.",
    // Deliberately narrower than "any colour": `bg-brand` resolves to #2563eb,
    // which IS blue-600, so those render identically today and are a token
    // problem rather than a visual one. The greens and yellows are the visual
    // ones — `positive` is #166534 on #f0fdf4, nothing like green-500.
    re: /\b(bg|text|border|ring)-(blue|red|green|yellow|amber|emerald|purple|indigo|pink|orange|rose|teal|cyan|violet|lime|sky|fuchsia)-\d{2,3}\b/,
  },
  {
    id: "shadow",
    why: "Hairlines, not shadows. A card is a border and a radius.",
    re: /\bshadow-(sm|md|lg|xl|2xl)\b/,
  },
  {
    id: "white-surface",
    why: "The page background is bg-canvas (#faf9f6), never pure white. A card is bg-surface.",
    re: /\bbg-white\b/,
  },
  {
    id: "anda",
    why: "One language: Bahasa Indonesia, 'kamu'. Never 'Anda'.",
    re: /\bAnda\b/,
  },
  {
    id: "raw-hex",
    why: "Colours come from tokens so they can change in one place.",
    re: /["'`][^"'`]*#[0-9a-fA-F]{6}\b/,
  },
];

/**
 * Rules a file can opt out of, for the cases the brief itself allows.
 *
 * Global, and every match is accumulated. It used to be a single non-global
 * match, which read only the FIRST marker in a file — so a file needing two
 * different exemptions could declare one and silently fail on the other, with
 * no hint that its second marker was being ignored. The CTA section hit exactly
 * that: a `gradient` marker for its photo scrim, and no way to also allow the
 * white button sitting on its blue panel.
 */
const ALLOW_MARKER = /design-lint-allow:\s*([a-z-,\s]+)/g;

/**
 * Comments are not markup. A hex in a sentence explaining WHY a panel is
 * #171717 is documentation; the same hex in a className is the violation.
 * Stripping comments first is what keeps the signal worth reading — without
 * it, the best-commented files look like the worst offenders.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/./g, " "));
}

const files = execSync(
  "git ls-files 'app/**/*.tsx' 'app/**/*.ts' 'components/**/*.tsx' 'components/**/*.ts'",
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);

const counts = new Map(RULES.map((r) => [r.id, 0]));
const dirty = new Map();

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const allowed = new Set(
    [...raw.matchAll(ALLOW_MARKER)]
      .flatMap((m) => m[1].split(","))
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const source = stripComments(raw);
  const lines = source.split("\n");

  for (const rule of RULES) {
    if (allowed.has(rule.id)) continue;
    lines.forEach((line, i) => {
      if (!rule.re.test(line)) return;
      counts.set(rule.id, counts.get(rule.id) + 1);
      if (!dirty.has(file)) dirty.set(file, []);
      dirty.get(file).push({ rule: rule.id, line: i + 1, text: line.trim().slice(0, 110) });
    });
  }
}

const total = [...counts.values()].reduce((a, b) => a + b, 0);

console.log(`\nscanned ${files.length} files\n`);
for (const rule of RULES) {
  const n = counts.get(rule.id);
  console.log(`  ${n === 0 ? "ok  " : "FAIL"}  ${String(n).padStart(4)}  ${rule.id}`);
  if (n > 0) console.log(`              ${rule.why}`);
}

if (VERBOSE && dirty.size > 0) {
  console.log("\n--- hits ---");
  for (const [file, hits] of [...dirty].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${file}  (${hits.length})`);
    for (const h of hits) console.log(`  ${String(h.line).padStart(5)}  ${h.rule}: ${h.text}`);
  }
} else if (dirty.size > 0) {
  console.log("\n--- worst files ---");
  for (const [file, hits] of [...dirty].sort((a, b) => b[1].length - a[1].length).slice(0, 15)) {
    console.log(`  ${String(hits.length).padStart(4)}  ${file}`);
  }
  console.log("\n  (--verbose for line numbers)");
}

console.log(
  `\n${total} violation${total === 1 ? "" : "s"} across ${dirty.size} file${dirty.size === 1 ? "" : "s"}.`,
);
console.log(
  "A clean run means no banned class is present. It does not mean the page\n" +
    "implements the design — only reading the screen does that.\n",
);

process.exit(total > 0 ? 1 : 0);
