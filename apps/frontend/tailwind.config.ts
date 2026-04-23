import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0057A8",
          foreground: "#FFFFFF",
          soft: "#EAF3FF",
          deep: "#003F7F"
        },
        secondary: {
          DEFAULT: "#001F3B",
          soft: "#E7EEF6",
          deep: "#001427"
        },
        accent: {
          DEFAULT: "#2DBE60",
          soft: "#E7F9EE",
          deep: "#23954B"
        },
        background: {
          DEFAULT: "#F5F7FA",
          elevated: "#FFFFFF",
          tint: "#F1F5F9"
        },
        card: {
          DEFAULT: "#FFFFFF",
          strong: "#FFFFFF",
          muted: "#FAFBFC"
        },
        border: {
          DEFAULT: "#E8EDF3",
          strong: "#CBD5E1"
        },
        text: {
          DEFAULT: "#07111F",
          muted: "#5D6B82",
          soft: "#91A0B5"
        },
        ink: "#001F3B",
        mist: "#F1F5F9",
        sand: "#FFF5E6",
        teal: "#2DBE60",
        coral: "#FF4D4F"
      },
      borderRadius: {
        xl: "0.375rem",
        "2xl": "0.5rem",
        "3xl": "0.75rem"
      },
      boxShadow: {
        soft: "0 1px 2px rgba(1, 19, 39, 0.04)",
        panel: "0 10px 28px rgba(1, 19, 39, 0.06)",
        lift: "0 18px 42px rgba(1, 19, 39, 0.10)"
      },
      spacing: {
        4.5: "1.125rem",
        5.5: "1.375rem",
        18: "4.5rem"
      },
      backgroundImage: {
        "hero-grid":
          "linear-gradient(180deg, #FFFFFF 0%, #F5F7FA 42%, #F1F5F9 100%)"
      }
    }
  },
  plugins: []
} satisfies Config;
