import { useTranslation } from "react-i18next";
import { Select } from "./Input";
import { useLanguage } from "../hooks/useLanguage";
import type { CrmLanguage } from "../i18n";

type LanguageSwitcherProps = {
  className?: string;
  compact?: boolean;
};

export function LanguageSwitcher({ className = "", compact = false }: LanguageSwitcherProps) {
  const { t } = useTranslation();
  const { currentLanguage, setLanguage, availableLanguages } = useLanguage();

  return (
    <label className={`inline-flex shrink-0 items-center gap-2 ${className}`}>
      {!compact ? <span className="text-xs font-semibold text-text-muted">{t("settings.language")}</span> : null}
      <Select
        value={currentLanguage}
        aria-label={t("settings.language")}
        className={compact ? "h-9 w-[10rem] max-w-[44vw] px-2.5 pr-8 text-xs" : "h-10 min-w-[10rem] px-3 pr-8 text-sm"}
        onChange={(event) => setLanguage(event.target.value as CrmLanguage)}
      >
        {availableLanguages.map((language) => (
          <option key={language.value} value={language.value}>
            {t(language.labelKey)}
          </option>
        ))}
      </Select>
    </label>
  );
}
