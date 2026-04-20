import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#FF7A1A",
          foreground: "#FFFFFF",
          soft: "#FFF0E4",
          deep: "#E26100"
        },
        secondary: {
          DEFAULT: "#2F80ED",
          soft: "#EAF3FF",
          deep: "#1E66C8"
        },
        accent: {
          DEFAULT: "#2DBE60",
          soft: "#E7F9EE",
          deep: "#23954B"
        },
        background: {
          DEFAULT: "#F8FAFC",
          elevated: "#FCFDFE",
          tint: "#F3F7FB"
        },
        card: {
          DEFAULT: "#FFFFFF",
          strong: "#FFFFFF",
          muted: "#FAFBFC"
        },
        border: {
          DEFAULT: "#E4EBF3",
          strong: "#D1DBE8"
        },
        text: {
          DEFAULT: "#142033",
          muted: "#62748A",
          soft: "#94A3B8"
        },
        ink: "#142033",
        mist: "#F3F7FB",
        sand: "#FFF7F0",
        teal: "#2DBE60",
        coral: "#FF7A1A"
      },
      borderRadius: {
        xl: "0.5rem",
        "2xl": "0.75rem",
        "3xl": "1rem"
      },
      boxShadow: {
        soft: "0 1px 4px rgba(20, 32, 51, 0.05)",
        panel: "0 8px 24px rgba(20, 32, 51, 0.07)",
        lift: "0 16px 36px rgba(20, 32, 51, 0.10)"
      },
      spacing: {
        4.5: "1.125rem",
        5.5: "1.375rem",
        18: "4.5rem"
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(circle at top left, rgba(255,122,26,0.18), transparent 32%), radial-gradient(circle at right, rgba(47,128,237,0.16), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,1))"
      }
    }
  },
  plugins: []
} satisfies Config;
