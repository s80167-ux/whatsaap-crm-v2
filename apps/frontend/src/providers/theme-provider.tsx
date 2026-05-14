import { ThemeProvider } from "next-themes";
import type { PropsWithChildren } from "react";

export const APP_THEMES = ["light", "dark", "midnight", "ocean", "glass", "system"] as const;

export type AppTheme = (typeof APP_THEMES)[number];

export function AppThemeProvider({ children }: PropsWithChildren) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="whatsapp-crm-theme"
      themes={["light", "dark", "midnight", "ocean", "glass"]}
    >
      {children}
    </ThemeProvider>
  );
}