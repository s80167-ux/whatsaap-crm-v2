import { Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import brandLogoMobile from "../../../asset/rezeki_dashboard_logo_mobile_transparent.png";
import { FOOTER_COPYRIGHT, PRODUCT_NAME, SUPPORT_EMAIL } from "../../constants/publicBrand";

const productLinks = [
  { to: "/features", key: "features" },
  { to: "/pricing", key: "pricing" },
  { to: "/demo", key: "demo" },
  { to: "/faq", key: "faq" }
];

const companyLinks = [
  { to: "/contact", key: "contact" },
  { to: "/privacy-policy", key: "privacy" },
  { to: "/terms", key: "terms" },
  { to: "/data-deletion", key: "dataDeletion" }
];

export function PublicFooter() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-white/70 bg-white/90 px-4 py-10 shadow-[0_-10px_35px_rgba(2,31,98,0.05)] sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Link to="/" className="inline-flex items-center gap-3">
            <span className="public-logo-mark flex h-16 w-[13.5rem] items-center overflow-hidden">
              <img src={brandLogoMobile} alt={PRODUCT_NAME} className="h-full w-full object-contain" />
            </span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-[#66708d]">{t("public.footer.description")}</p>
          <a className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#0751d8] hover:text-[#0646bd]" href={`mailto:${SUPPORT_EMAIL}`}>
            <Mail className="h-4 w-4" aria-hidden="true" />
            {SUPPORT_EMAIL}
          </a>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-[#071f52]">{t("public.footer.product")}</h2>
          <ul className="mt-4 space-y-3">
            {productLinks.map((link) => (
              <li key={link.to}>
                <Link className="text-sm text-[#66708d] hover:text-[#0751d8]" to={link.to}>
                  {t(`public.footer.links.${link.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-[#071f52]">{t("public.footer.company")}</h2>
          <ul className="mt-4 space-y-3">
            {companyLinks.map((link) => (
              <li key={link.to}>
                <Link className="text-sm text-[#66708d] hover:text-[#0751d8]" to={link.to}>
                  {t(`public.footer.links.${link.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-8 max-w-6xl border-t border-[#d9e1ef] pt-6 text-sm text-[#66708d]">{FOOTER_COPYRIGHT}</div>
    </footer>
  );
}
