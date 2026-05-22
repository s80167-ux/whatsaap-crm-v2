import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { CRM_LANGUAGE_STORAGE_KEY, availableLanguages, isCrmLanguage, type CrmLanguage } from "../i18n";

export function useLanguage() {
  const { i18n } = useTranslation();
  const currentLanguage: CrmLanguage = i18n.language === "ms" ? "ms" : "en";
  const isFirstTimeLanguageSetup =
    typeof window !== "undefined" && !isCrmLanguage(window.localStorage.getItem(CRM_LANGUAGE_STORAGE_KEY));

  const setLanguage = useCallback(
    (language: CrmLanguage) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CRM_LANGUAGE_STORAGE_KEY, language);
      }
      void i18n.changeLanguage(language);
    },
    [i18n]
  );

  return {
    currentLanguage,
    setLanguage,
    availableLanguages,
    isFirstTimeLanguageSetup
  };
}
