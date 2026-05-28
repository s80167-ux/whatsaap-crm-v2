import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

type PublicCTAProps = {
  title: string;
  description: string;
};

export function PublicCTA({ title, description }: PublicCTAProps) {
  const { t } = useTranslation();

  return (
    <section className="px-4 py-14 sm:px-6 lg:px-8">
      <div className="public-glow-card mx-auto max-w-6xl rounded-[2rem] border border-white/70 bg-[radial-gradient(circle_at_top_left,rgba(90,142,255,0.38),transparent_22rem),linear-gradient(135deg,#071f52,#0751d8)] p-8 text-white shadow-[0_30px_90px_rgba(2,31,98,0.28)] sm:p-10 lg:flex lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-[#d9e1ef] sm:text-base">{description}</p>
        </div>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row lg:mt-0">
          <Link
            to="/demo"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#0751d8] shadow-lg shadow-[#021f62]/20 transition hover:bg-[#eef4ff]"
          >
            {t("public.common.tryDemo")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            to="/contact"
            className="inline-flex items-center justify-center rounded-full border border-white/25 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            {t("public.common.contactUs")}
          </Link>
        </div>
      </div>
    </section>
  );
}
