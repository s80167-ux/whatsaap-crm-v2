import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { PublicSection } from "../../components/public/PublicSection";

type PricingPlan = {
  name: string;
  price: string;
  badge?: string;
  bestFor: string;
  features: string[];
};

type FaqItem = {
  question: string;
  answer: string;
};

function translatedArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function PricingPage() {
  const { t } = useTranslation();
  const plans = translatedArray<PricingPlan>(t("public.pricingPage.plans", { returnObjects: true }));
  const faqs = translatedArray<FaqItem>(t("public.pricingPage.faqs", { returnObjects: true }));

  return (
    <>
      <PublicSection className="bg-white/95" eyebrow={t("public.pricingPage.eyebrow")} title={t("public.pricingPage.title")} description={t("public.pricingPage.description")}>
        <div className="grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`public-glow-card relative rounded-3xl border p-6 shadow-sm ${
                plan.badge ? "border-[#9db9f2] bg-[#eef4ff] shadow-[#021f62]/10" : "border-[#d9e1ef] bg-white/95"
              }`}
            >
              {plan.badge ? (
                <span className="absolute right-5 top-5 rounded-full bg-[#0751d8] px-3 py-1 text-xs font-semibold text-white">{plan.badge}</span>
              ) : null}
              <h2 className="text-xl font-semibold text-[#071f52]">{plan.name}</h2>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-[#071f52]">{plan.price}</p>
              <p className="mt-3 text-sm leading-6 text-[#66708d]">{plan.bestFor}</p>
              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-3 text-sm text-[#42516f]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0751d8]" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/contact"
                className="mt-7 inline-flex w-full items-center justify-center rounded-full bg-[#071f52] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0646bd]"
              >
                {t("public.common.contactUs")}
              </Link>
            </article>
          ))}
        </div>
        <p className="mx-auto mt-6 max-w-3xl text-center text-sm leading-6 text-[#66708d]">{t("public.pricingPage.note")}</p>
      </PublicSection>

      <PublicSection title={t("public.pricingPage.faqTitle")}>
        <div className="grid gap-4 md:grid-cols-2">
          {faqs.map((faq) => (
            <article key={faq.question} className="public-glow-card rounded-3xl border border-[#d9e1ef] bg-white/95 p-6">
              <h2 className="text-base font-semibold text-[#071f52]">{faq.question}</h2>
              <p className="mt-2 text-sm leading-6 text-[#66708d]">{faq.answer}</p>
            </article>
          ))}
        </div>
      </PublicSection>
    </>
  );
}
