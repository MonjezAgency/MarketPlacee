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
            boxShadow: {
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


