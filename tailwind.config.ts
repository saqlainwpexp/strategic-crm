import type { Config } from "tailwindcss";

// Theme colours come from CSS variables set by the white-label branding (src/lib/theme.ts),
// stored as "r g b" triplets so opacity modifiers like `bg-brand/40` keep working.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class"],
  content: ["./src/pages/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}", "./src/app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: v("brand-50"),
          100: v("brand-100"),
          200: v("brand-200"),
          300: v("brand-300"),
          400: v("brand-400"),
          500: v("brand-500"),
          600: v("brand-600"),
          700: v("brand-700"),
          800: v("brand-800"),
          900: v("brand-900"),
          DEFAULT: v("brand-500"),
          fg: v("brand-fg"),
        },
        ink: {
          DEFAULT: v("ink"),
          soft: v("ink-soft"),
          muted: v("ink-muted"),
        },
        page: v("page"),
        soft: v("soft"),
        card: "#FFFFFF",
        header: {
          DEFAULT: v("header"),
          fg: v("header-fg"),
          cta: v("header-cta"),
          "cta-fg": v("header-cta-fg"),
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
    },
  },
  plugins: [],
};

export default config;
