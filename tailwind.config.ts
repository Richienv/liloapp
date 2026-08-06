import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          // --destructive (hsl(0 84.2% 60.2%)) is tuned as a solid fill behind
          // white text; as body copy on a white card it only reaches ~3.8:1,
          // under the WCAG AA 4.5:1 floor. `emphasis` is the text-weight red and
          // `subtle` the tint used behind it. Literal values rather than CSS
          // vars because app/globals.css defines no matching custom properties.
          emphasis: "hsl(0 74% 38%)",
          subtle: "hsl(0 86% 97%)",
        },
        // Success had no token at all, which is how a red error and a green
        // confirmation both ended up rendering as plain black text.
        success: {
          DEFAULT: "hsl(142 71% 45%)",
          foreground: "hsl(0 0% 100%)",
          emphasis: "hsl(142 72% 26%)",
          subtle: "hsl(138 76% 97%)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // ---------------------------------------------------------------
        // Redesign palette.
        //
        // Deliberately NOT plumbed through the shadcn `--foo` CSS variables
        // above. Those are HSL triplets tuned for a white-canvas, dark-mode-
        // capable theme; these are the exact hex values the design specifies,
        // and a round trip through HSL is where a hairline drifts from #e7e5e0
        // to something a shade off. The two systems coexist: shadcn primitives
        // keep their vars, redesigned surfaces use these.
        //
        // Names avoid every key already taken above (`accent`, `border`,
        // `muted`, `success`...) so nothing existing changes meaning.
        // ---------------------------------------------------------------

        /** The page. Never pure white — that is the whole point of the warm canvas. */
        canvas: "#faf9f6",

        /** Card and panel fills, warm-tinted rather than grey. */
        surface: {
          DEFAULT: "#ffffff",
          raised: "#fdfcfa", // row hover
          sunken: "#f7f6f3", // inset wells
          tint: "#f2f1ee", // brand-side proof panel, quiet fills
          deep: "#eceae5", // pressed / selected quiet fill
        },

        /**
         * Text, darkest to lightest. The design's contrast comes from this
         * ramp, not from shadows — flat grey-on-grey was the audit's finding.
         */
        ink: {
          DEFAULT: "#171717",
          body: "#404040",
          muted: "#525252",
          soft: "#737373",
          faint: "#8a8880",
          ghost: "#a3a19a",
        },

        /** Hairlines. `1px solid`, never a shadow. */
        hairline: {
          DEFAULT: "#e7e5e0", // card and panel edges
          soft: "#f0efeb", // dividers inside a card
          input: "#dedbd4", // field borders and secondary buttons
          strong: "#c7c5be", // the rare emphasised edge
        },

        /**
         * The one accent. At most once per section — if two things on a screen
         * are blue, one of them is wrong.
         */
        brand: {
          DEFAULT: "#2563eb",
          hover: "#1d4ed8",
          deep: "#1e40af",
          tint: "#eff6ff",
          wash: "#f7faff",
          line: "#bfdbfe",
          "line-strong": "#93c5fd",
        },

        /** Confirmed / paid / verified. Text weight, on a tint, with a line. */
        positive: {
          DEFAULT: "#166534",
          tint: "#f0fdf4",
          line: "#bbf7d0",
        },

        /** Pending / needs attention. */
        caution: {
          DEFAULT: "#b45309",
          strong: "#92400e",
          tint: "#fffbeb",
          line: "#fde68a",
          dot: "#f59e0b",
        },

        /** Failed / cancelled. */
        critical: {
          DEFAULT: "#dc2626",
        },
      },
      borderRadius: {
        // `--radius` is 9px, so the shadcn scale resolves to 9 / 7 / 5 — which
        // is exactly the design's three most-used radii. Existing primitives
        // pick up the new geometry without a single class change.
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        hair: "2px", // chat tails, tiny markers
        chip: "3px", // status chips, meta tags
        field: "8px", // inputs and selects
        pill: "11px", // buttons that sit inside a field row
        panel: "12px", // cards
        frame: "14px", // the outermost container on a page
      },
      fontFamily: {
        // Wired to the next/font variables declared in app/layout.tsx.
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-playfair)", "ui-serif", "Georgia", "serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // An additive scale. Tailwind's own `text-sm`/`text-base`/... are left
        // untouched so nothing rendered today shifts; redesigned surfaces opt
        // in by name. Line height and tracking travel with the size because in
        // this design they are not independent choices — 12px at .1em tracking
        // is a label, 12px at normal tracking is body copy set too small.
        micro: ["10px", { lineHeight: "1.4", letterSpacing: "0.1em" }],
        tiny: ["11px", { lineHeight: "1.45", letterSpacing: "0.08em" }],
        mini: ["12px", { lineHeight: "1.5" }],
        meta: ["12.5px", { lineHeight: "1.5" }],
        copy: ["13.5px", { lineHeight: "1.55" }],
        ui: ["14px", { lineHeight: "1.5", letterSpacing: "-0.01em" }],
        lede: ["15px", { lineHeight: "1.6", letterSpacing: "-0.01em" }],
        title: ["19px", { lineHeight: "1.3", letterSpacing: "-0.015em" }],
        price: ["22px", { lineHeight: "1.2", letterSpacing: "-0.015em" }],
        section: ["26px", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
        display: ["34px", { lineHeight: "1.15", letterSpacing: "-0.025em" }],
        heading: ["clamp(28px,4.2vw,46px)", { lineHeight: "1.08", letterSpacing: "-0.025em" }],
        hero: ["clamp(40px,7.2vw,86px)", { lineHeight: "1.02", letterSpacing: "-0.03em" }],
      },
      boxShadow: {
        /**
         * The grid-hairline fix. A bordered cell inside a grid double-draws its
         * edge against its neighbour, producing a 2px line that reads as a
         * rendering bug. A half-pixel spread ring overlaps instead of stacking,
         * so every seam in a grid is 1px whether one cell owns it or two do.
         */
        cell: "0 0 0 .5px #e7e5e0",
        /** Same idea for a standalone element that must not affect layout. */
        hairline: "0 0 0 1px #e7e5e0",
        /** The only real shadow in the system: a rail lifting off the page. */
        rail: "-24px 0 60px rgba(23,23,23,.14)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

export default config;
