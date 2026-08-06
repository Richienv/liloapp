import { describe, expect, it } from "vitest";

import tailwindConfig from "@/tailwind.config";
import { cn } from "@/lib/utils";

/**
 * These tests exist because `cn()` fails SILENTLY.
 *
 * tailwind-merge keeps the last class in each conflict group and guesses the
 * group for any name it does not recognise. Our scale is additive — it adds
 * `text-copy` and `rounded-field` alongside Tailwind's `text-sm` and
 * `rounded-md` rather than replacing them — so every one of our names is a
 * guess, and the wrong guess produces no error, no warning, and no visual clue
 * beyond a component being one and a half pixels off.
 *
 * The worst case is not a duplicate class. It is `text-copy` being classified
 * as a text COLOUR and deleted outright by a `text-ink` sitting next to it.
 *
 * So the important test here is not the handful of hand-written cases below —
 * it is `derives every scale name from tailwind.config.ts`. Adding a size to
 * the config and forgetting to register it in lib/utils.ts is not a build
 * error; it is a class that quietly stops overriding. That test is the only
 * thing that turns it into a failure someone sees.
 */

const FONT_SIZES = Object.keys(
  (tailwindConfig.theme?.extend?.fontSize ?? {}) as Record<string, unknown>,
);

const RADII = Object.keys(
  (tailwindConfig.theme?.extend?.borderRadius ?? {}) as Record<string, unknown>,
);

/** Names the config redefines but did not invent — tailwind-merge knows these already. */
const TAILWIND_OWN_RADII = new Set(["none", "sm", "md", "lg", "xl", "2xl", "3xl", "full"]);

describe("cn — the design scale is registered", () => {
  it("reads a non-empty scale out of the config", () => {
    // Guards the two tests below: if the config shape ever changes, they would
    // both pass vacuously over an empty list.
    expect(FONT_SIZES.length).toBeGreaterThan(0);
    expect(RADII.length).toBeGreaterThan(0);
  });

  it.each(FONT_SIZES)("text-%s overrides a Tailwind font size", (name) => {
    expect(cn("text-sm", `text-${name}`)).toBe(`text-${name}`);
  });

  it.each(FONT_SIZES)("text-%s survives next to a text colour", (name) => {
    // The original bug: twMerge("text-sm", "text-copy text-ink") === "text-sm text-ink".
    // The size was classified as a colour and dropped by the colour beside it.
    expect(cn("text-sm", `text-${name} text-ink`)).toBe(`text-${name} text-ink`);
  });

  it.each(RADII.filter((r) => !TAILWIND_OWN_RADII.has(r)))(
    "rounded-%s overrides a Tailwind radius",
    (name) => {
      expect(cn("rounded-md", `rounded-${name}`)).toBe(`rounded-${name}`);
    },
  );
});

describe("cn — nothing that already worked was broken", () => {
  it("still merges text colours as colours", () => {
    expect(cn("text-red-500", "text-ink")).toBe("text-ink");
    expect(cn("text-ink", "text-ink-soft")).toBe("text-ink-soft");
  });

  it("still merges design sizes against each other", () => {
    expect(cn("text-copy", "text-title")).toBe("text-title");
    expect(cn("rounded-field", "rounded-panel")).toBe("rounded-panel");
  });

  it("keeps a size and a colour together — they are not in conflict", () => {
    expect(cn("text-copy text-ink")).toBe("text-copy text-ink");
  });

  it("still merges the ordinary Tailwind groups", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("flex", "hidden")).toBe("hidden");
  });

  it("still takes clsx conditionals", () => {
    expect(cn("text-copy", false && "text-title", undefined, "text-ink")).toBe(
      "text-copy text-ink",
    );
  });
});
