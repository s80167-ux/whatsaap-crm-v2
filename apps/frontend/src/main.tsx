import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { LanguageOnboarding } from "./components/LanguageOnboarding";
import { AppThemeProvider } from "./providers/theme-provider";
import { router } from "./router";
import "./i18n";
import "./styles.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppThemeProvider>
      <QueryClientProvider client={queryClient}>
        <LanguageOnboarding />
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppThemeProvider>
  </React.StrictMode>
);
