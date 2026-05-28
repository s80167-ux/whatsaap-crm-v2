import { Globe2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../hooks/useLanguage";

const publicRoutes = ["/", "/features", "/pricing", "/demo", "/faq", "/contact", "/login", "/privacy-policy", "/terms", "/data-deletion"];

export function LanguageOnboarding() {
  const { t } = useTranslation();
  const { availableLanguages, isFirstTimeLanguageSetup, setLanguage } = useLanguage();
  const isPublicRoute =
    typeof window !== "undefined" &&
    publicRoutes.some((route) => window.location.pathname === route);

  if (!isFirstTimeLanguageSetup || isPublicRoute) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-background/75 px-4 backdrop-blur-md">
      <div className="app-card w-full max-w-lg border border-primary/15 p-6 shadow-[0_24px_80px_rgb(15_23_42_/_0.3)]">
        <div className="flex items-center gap-3 text-primary">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10">
            <Globe2 size={20} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("onboarding.language.badge")}</p>
            <h2 className="mt-1 text-xl font-semibold text-text">{t("onboarding.language.title")}</h2>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-text-muted">{t("onboarding.language.description")}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {availableLanguages.map((language) => (
            <button
              key={language.value}
              type="button"
              className="rounded-2xl border border-border bg-card px-4 py-4 text-left transition hover:border-primary/30 hover:bg-primary/5"
              onClick={() => setLanguage(language.value)}
            >
              <p className="text-base font-semibold text-text">{t(language.labelKey)}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-text-soft">{language.value}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
