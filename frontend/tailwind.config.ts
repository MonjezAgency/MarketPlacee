import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    darkMode: "class",
    theme: {
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
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                highlight: {
                    DEFAULT: "hsl(var(--highlight))",
                    foreground: "hsl(var(--highlight-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                sidebar: {
                    DEFAULT: "hsl(var(--sidebar))",
                    foreground: "hsl(var(--sidebar-foreground))",
                },
                // ── Storefront theme tokens (light/dark via CSS vars in globals.css) ──
                ink: { DEFAULT: "rgb(var(--atl-ink) / <alpha-value>)", 2: "rgb(var(--atl-ink-2) / <alpha-value>)", 3: "rgb(var(--atl-ink-3) / <alpha-value>)", 4: "rgb(var(--atl-ink-4) / <alpha-value>)" },
                heading: "rgb(var(--atl-heading) / <alpha-value>)",
                surface: { DEFAULT: "rgb(var(--atl-surface) / <alpha-value>)", 2: "rgb(var(--atl-surface-2) / <alpha-value>)", 3: "rgb(var(--atl-surface-3) / <alpha-value>)" },
                media: "rgb(var(--atl-media) / <alpha-value>)",
                line: { DEFAULT: "rgb(var(--atl-line) / <alpha-value>)", strong: "rgb(var(--atl-line-strong) / <alpha-value>)" },
                cta: { DEFAULT: "rgb(var(--atl-cta) / <alpha-value>)", hover: "rgb(var(--atl-cta-hover) / <alpha-value>)", fg: "rgb(var(--atl-cta-fg) / <alpha-value>)" },
                teal: { DEFAULT: "rgb(var(--atl-teal) / <alpha-value>)", soft: "rgb(var(--atl-teal-soft) / <alpha-value>)" },
            },
            fontFamily: {
                sans: ["var(--font-inter)", "var(--font-cairo)", "sans-serif"],
                heading: ["var(--font-poppins)", "sans-serif"],
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            // ── Atlantis design system (docs/DESIGN_SYSTEM.md) ──
            // Named type scale: use these for marketing / trust / policy pages
            // instead of arbitrary text-[Npx] values.
            fontSize: {
                "display": ["3rem", { lineHeight: "1.05", letterSpacing: "-0.025em", fontWeight: "700" }],      // 48
                "display-sm": ["2.25rem", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" }],  // 36
                "title": ["2rem", { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "700" }],         // 32
                "title-sm": ["1.625rem", { lineHeight: "1.2", letterSpacing: "-0.015em", fontWeight: "700" }],  // 26
                "subtitle": ["1.25rem", { lineHeight: "1.35", letterSpacing: "-0.01em", fontWeight: "600" }],   // 20
                "lead": ["1.125rem", { lineHeight: "1.6" }],                                                     // 18
                "body": ["0.9375rem", { lineHeight: "1.65" }],                                                   // 15
                "small": ["0.8125rem", { lineHeight: "1.5" }],                                                   // 13
                "eyebrow": ["0.75rem", { lineHeight: "1.3", letterSpacing: "0.14em", fontWeight: "600" }],      // 12
            },
            maxWidth: {
                page: "80rem",     // 1280 — page container
                content: "68rem",  // 1088 — feature sections
                prose: "42rem",    // 672 — running text
            },
            transitionTimingFunction: {
                atl: "cubic-bezier(0.22, 1, 0.36, 1)",
            },
            keyframes: {
                "atl-rise": { from: { transform: "translateY(0)" }, to: { transform: "translateY(-50%)" } },
                "atl-pulse-ring": { "0%": { transform: "scale(0.6)", opacity: "0.55" }, "100%": { transform: "scale(2.2)", opacity: "0" } },
                "atl-scan-clip": { "0%, 100%": { clipPath: "inset(58% 0 0 0)" }, "50%": { clipPath: "inset(30% 0 0 0)" } },
                "atl-scan-line": { "0%, 100%": { top: "58%" }, "50%": { top: "30%" } },
            },
            animation: {
                "atl-rise": "atl-rise 28s linear infinite",
                "atl-pulse-ring": "atl-pulse-ring 2.4s cubic-bezier(0.22, 1, 0.36, 1) infinite",
                "atl-scan-clip": "atl-scan-clip 7s cubic-bezier(0.65, 0, 0.35, 1) infinite",
                "atl-scan-line": "atl-scan-line 7s cubic-bezier(0.65, 0, 0.35, 1) infinite",
            },
            boxShadow: {
                card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.05)",
                float: "0 2px 6px rgba(15, 23, 42, 0.05), 0 24px 48px -12px rgba(15, 23, 42, 0.14)",
                premium: "0 8px 30px rgba(0, 0, 0, 0.04)",
                "premium-dark": "0 8px 30px rgba(0, 0, 0, 0.2)",
                glow: "0 0 15px hsl(var(--ring) / 0.5)",
            },
            transitionProperty: {
                'colors-shadow': 'color, background-color, border-color, text-decoration-color, fill, stroke, box-shadow',
            },
        },
    },
    plugins: [],
};
export default config;


