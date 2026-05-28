import { Menu, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink } from "react-router-dom";
import brandLogoMobile from "../../../asset/rezeki_dashboard_logo_mobile_transparent.png";
import { PRODUCT_NAME } from "../../constants/publicBrand";
import { LanguageSwitcher } from "./LanguageSwitcher";

const navLinks = [
  { to: "/features", key: "features" },
  { to: "/pricing", key: "pricing" },
  { to: "/demo", key: "demo" },
  { to: "/faq", key: "faq" },
  { to: "/contact", key: "contact" }
];

export function PublicNavbar() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const closeMenu = () => setIsOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/70 bg-white/85 shadow-[0_16px_42px_rgba(2,31,98,0.10)] backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 sm:px-6 lg:px-8" aria-label={t("public.nav.aria")}>
        <Link to="/" className="flex items-center gap-3" onClick={closeMenu}>
          <span className="public-logo-mark flex h-11 w-[9.75rem] items-center overflow-hidden sm:h-12 sm:w-[10.75rem]">
            <img src={brandLogoMobile} alt={PRODUCT_NAME} className="h-full w-full object-contain" />
          </span>
        </Link>

        <div className="hidden items-center gap-7 lg:flex">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `text-sm font-medium transition ${isActive ? "text-[#0751d8]" : "text-[#66708d] hover:text-[#071f52]"}`
              }
            >
              {t(`public.nav.${link.key}`)}
            </NavLink>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <LanguageSwitcher />
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-full border border-[#d9e1ef] px-4 py-2 text-sm font-semibold text-[#071f52] transition hover:border-[#9db9f2] hover:bg-[#eef4ff] hover:text-[#0751d8]"
          >
            {t("public.nav.login")}
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d9e1ef] text-[#071f52] lg:hidden"
          aria-label={isOpen ? t("public.nav.closeMenu") : t("public.nav.openMenu")}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          {isOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </nav>

      {isOpen ? (
        <div className="border-t border-[#d9e1ef] bg-white px-4 py-4 shadow-xl shadow-[#021f62]/10 lg:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-2">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={closeMenu}
                className={({ isActive }) =>
                  `rounded-xl px-3 py-3 text-sm font-semibold transition ${isActive ? "bg-[#eef4ff] text-[#0751d8] shadow-sm" : "text-[#071f52] hover:bg-[#f4f8ff]"}`
                }
              >
                {t(`public.nav.${link.key}`)}
              </NavLink>
            ))}
            <div className="flex items-center justify-between gap-3 px-3 py-3">
              <span className="text-sm font-semibold text-[#071f52]">{t("public.nav.language")}</span>
              <LanguageSwitcher />
            </div>
            <Link
              to="/login"
              onClick={closeMenu}
              className="mt-2 inline-flex items-center justify-center rounded-full bg-[#0751d8] px-4 py-3 text-sm font-semibold text-white"
            >
              {t("public.nav.login")}
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
