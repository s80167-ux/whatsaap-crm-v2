import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: "rgb(var(--background) / <alpha-value>)",
          elevated: "rgb(var(--card) / <alpha-value>)",
          tint: "rgb(var(--muted) / <alpha-value>)"
        },
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        text: {
          DEFAULT: "rgb(var(--foreground) / <alpha-value>)",
          muted: "rgb(var(--muted-foreground) / <alpha-value>)",
          soft: "rgb(var(--muted-foreground) / 0.78)"
        },
        card: {
          DEFAULT: "rgb(var(--card) / <alpha-value>)",
          foreground: "rgb(var(--card-foreground) / <alpha-value>)"
        },
        border: "rgb(var(--border) / <alpha-value>)",
        muted: {
          DEFAULT: "rgb(var(--muted) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)"
        },
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
          soft: "rgb(var(--primary) / 0.12)",
          deep: "rgb(var(--primary) / 0.9)"
        },
        secondary: {
          DEFAULT: "rgb(var(--secondary) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
          soft: "rgb(var(--secondary) / 0.7)"
        },
        success: {
          DEFAULT: "rgb(var(--success) / <alpha-value>)",
          foreground: "rgb(var(--success-foreground) / <alpha-value>)"
        },
        warning: {
          DEFAULT: "rgb(var(--warning) / <alpha-value>)",
          foreground: "rgb(var(--warning-foreground) / <alpha-value>)"
        },
        destructive: {
          DEFAULT: "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-foreground) / <alpha-value>)"
        },
        sidebar: {
          DEFAULT: "rgb(var(--sidebar) / <alpha-value>)",
          foreground: "rgb(var(--sidebar-foreground) / <alpha-value>)"
        },
        topbar: {
          DEFAULT: "rgb(var(--topbar) / <alpha-value>)",
          foreground: "rgb(var(--topbar-foreground) / <alpha-value>)"
        },
        input: "rgb(var(--input) / <alpha-value>)",
        ring: "rgb(var(--ring) / <alpha-value>)",
        coral: "rgb(var(--destructive) / <alpha-value>)"
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "0.95rem",
        "3xl": "1.25rem"
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        panel: "var(--shadow-panel)",
        lift: "var(--shadow-lift)"
      },
      spacing: {
        4.5: "1.125rem",
        5.5: "1.375rem",
        18: "4.5rem"
      },
      backgroundImage: {
        "hero-grid": "var(--app-background)",
        "app-orb": "var(--app-orb)"
      }
    }
  },
  plugins: []
} satisfies Config;
