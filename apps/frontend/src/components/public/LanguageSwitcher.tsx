import { useLanguage } from "../../hooks/useLanguage";
import type { CrmLanguage } from "../../i18n";

const languages: Array<{ value: CrmLanguage; label: string; ariaLabel: string }> = [
  { value: "ms", label: "BM", ariaLabel: "Tukar bahasa ke Bahasa Melayu" },
  { value: "en", label: "EN", ariaLabel: "Switch language to English" }
];

type LanguageSwitcherProps = {
  className?: string;
};

export function LanguageSwitcher({ className = "" }: LanguageSwitcherProps) {
  const { currentLanguage, setLanguage } = useLanguage();

  return (
    <div className={`inline-flex rounded-full border border-[#d9e1ef] bg-white p-1 shadow-sm ${className}`}>
      {languages.map((language) => {
        const isActive = currentLanguage === language.value;

        return (
          <button
            key={language.value}
            type="button"
            aria-label={language.ariaLabel}
            aria-pressed={isActive}
            onClick={() => setLanguage(language.value)}
            className={`min-w-11 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              isActive ? "bg-[#0751d8] text-white shadow-sm" : "text-[#66708d] hover:bg-[#f4f8ff] hover:text-[#071f52]"
            }`}
          >
            {language.label}
          </button>
        );
      })}
    </div>
  );
}
