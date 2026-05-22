import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ms from "./locales/ms.json";

export const CRM_LANGUAGE_STORAGE_KEY = "crm_language";
export const availableLanguages = [
  { value: "en", labelKey: "language.en" },
  { value: "ms", labelKey: "language.ms" }
] as const;

export type CrmLanguage = (typeof availableLanguages)[number]["value"];

function getInitialLanguage(): CrmLanguage {
  if (typeof window === "undefined") {
    return "en";
  }

  const savedLanguage = window.localStorage.getItem(CRM_LANGUAGE_STORAGE_KEY);
  return savedLanguage === "ms" || savedLanguage === "en" ? savedLanguage : "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ms: { translation: ms }
  },
  lng: getInitialLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false
  }
});

export default i18n;
