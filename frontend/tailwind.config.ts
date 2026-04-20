import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#22C55E",
          foreground: "#FFFFFF",
          soft: "#E8F9EF",
          deep: "#16A34A"
        },
        background: {
          DEFAULT: "#F7F8FA",
          elevated: "#FCFCFD",
          tint: "#F1F5F3"
        },
        card: {
          DEFAULT: "#FFFFFF",
          strong: "#FFFFFF",
          muted: "#FAFBFC"
        },
        border: {
          DEFAULT: "#E8EDF2",
          strong: "#D8E0E8"
        },
        text: {
          DEFAULT: "#101828",
          muted: "#667085",
          soft: "#98A2B3"
        },
        ink: "#101828",
        mist: "#F1F5F3",
        sand: "#F9FAFB",
        teal: "#22C55E",
        coral: "#E76F51"
      },
      borderRadius: {
        xl: "0.5rem",
        "2xl": "0.75rem",
        "3xl": "1rem"
      },
      boxShadow: {
        soft: "0 1px 4px rgba(16, 24, 40, 0.04)",
        panel: "0 6px 18px rgba(16, 24, 40, 0.05)",
        lift: "0 12px 32px rgba(16, 24, 40, 0.08)"
      },
      spacing: {
        4.5: "1.125rem",
        5.5: "1.375rem",
        18: "4.5rem"
      },
      backgroundImage: {
        "hero-grid":
          "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,248,250,1))"
      }
    }
  },
  plugins: []
} satisfies Config;
