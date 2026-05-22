import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { CRM_LANGUAGE_STORAGE_KEY, availableLanguages, type CrmLanguage } from "../i18n";

export function useLanguage() {
  const { i18n } = useTranslation();
  const currentLanguage: CrmLanguage = i18n.language === "ms" ? "ms" : "en";

  const setLanguage = useCallback(
    (language: CrmLanguage) => {
      window.localStorage.setItem(CRM_LANGUAGE_STORAGE_KEY, language);
      void i18n.changeLanguage(language);
    },
    [i18n]
  );

  return {
    currentLanguage,
    setLanguage,
    availableLanguages
  };
}
