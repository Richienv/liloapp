import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * `cn`, taught the design system's scale.
 *
 * WHY THIS IS NOT JUST `twMerge(clsx(inputs))`
 *
 * tailwind-merge resolves conflicts by classifying each class into a group and
 * keeping the last one in each group. It knows Tailwind's own groups, and it
 * GUESSES at anything else. Our scale is additive — `tailwind.config.ts` adds
 * `text-copy`, `rounded-field` and friends alongside Tailwind's `text-sm` and
 * `rounded-md` rather than replacing them — so every one of our names is a class
 * tailwind-merge has to guess about, and it guesses wrong:
 *
 *   twMerge("text-sm", "text-copy text-ink")  ->  "text-sm text-ink"
 *
 * `text-copy` is GONE. tailwind-merge decided `copy` was a colour (it is not a
 * known size, and `text-*` is overwhelmingly a colour prefix), put it in the
 * text-colour group, and let `text-ink` win. The component keeps Tailwind's
 * 14px instead of the design's 13.5px, and nothing anywhere reports an error.
 *
 * The others fail differently but just as quietly:
 *
 *   twMerge("text-sm", "text-ui")             ->  "text-sm text-ui"
 *   twMerge("rounded-md", "rounded-field")    ->  "rounded-md rounded-field"
 *
 * Both classes survive, so the winner is whichever CSS rule Tailwind emitted
 * last — source order, not the caller's intent. A primitive styled `text-sm`
 * that a caller overrides with `text-ui` may or may not change size depending
 * on where the two sizes happen to sit in the generated stylesheet.
 *
 * This matters because the shadcn primitives (input, textarea, select, dialog,
 * table…) are all still written against Tailwind's scale and take a `className`
 * that callers use to opt into ours. Without the config below, every one of
 * those overrides is a coin flip, and `text-copy` specifically always loses.
 *
 * Registering the groups makes the merge do what it says:
 *
 *   cn("text-sm", "text-copy text-ink")       ->  "text-copy text-ink"
 *   cn("rounded-md", "rounded-field")         ->  "rounded-field"
 *
 * Keep these lists in step with `theme.extend.fontSize` and
 * `theme.extend.borderRadius` in tailwind.config.ts. A name in the config but
 * missing here is not a build error — it is a class that silently stops
 * overriding, which is the failure this comment exists to prevent.
 */

/** Mirrors `theme.extend.fontSize` in tailwind.config.ts. */
const FONT_SIZES = [
  "micro",
  "tiny",
  "mini",
  "meta",
  "copy",
  "ui",
  "lede",
  "title",
  "price",
  "section",
  "display",
  "heading",
  "hero",
] as const;

/**
 * Mirrors `theme.extend.borderRadius` in tailwind.config.ts.
 *
 * `lg`/`md`/`sm` are deliberately absent: the config redefines those three to
 * `var(--radius)` and its derivations, but the NAMES are Tailwind's own, so
 * tailwind-merge already groups them correctly. Only the names it has never
 * heard of need registering.
 */
const RADII = ["hair", "chip", "field", "pill", "panel", "frame"] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      // Without this, `text-copy` is classified as a colour and dropped.
      "font-size": FONT_SIZES.map((size) => `text-${size}`),
      rounded: RADII.map((radius) => `rounded-${radius}`),
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
