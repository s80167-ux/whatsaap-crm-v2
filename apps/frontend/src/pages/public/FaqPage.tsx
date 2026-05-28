import { useTranslation } from "react-i18next";
import { PublicCTA } from "../../components/public/PublicCTA";
import { PublicSection } from "../../components/public/PublicSection";
import { PublicVisualShowcase } from "../../components/public/PublicVisualShowcase";

type FaqItem = {
  question: string;
  answer: string;
};

function translatedArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function FaqPage() {
  const { t } = useTranslation();
  const faqs = translatedArray<FaqItem>(t("public.faqPage.items", { returnObjects: true }));

  return (
    <>
      <PublicSection className="bg-white/95" eyebrow={t("public.faqPage.eyebrow")} title={t("public.faqPage.title")} description={t("public.faqPage.description")}>
        <PublicVisualShowcase
          title={t("public.faqPage.title")}
          description={t("public.faqPage.description")}
          image="campaign"
          highlights={faqs.slice(0, 3).map((faq) => faq.question)}
        />
        <div className="mx-auto max-w-4xl space-y-4">
          {faqs.map((faq) => (
            <article key={faq.question} className="public-glow-card rounded-3xl border border-[#d9e1ef] bg-[#f8fbff] p-6">
              <h2 className="text-base font-semibold text-[#071f52]">{faq.question}</h2>
              <p className="mt-2 text-sm leading-6 text-[#66708d]">{faq.answer}</p>
            </article>
          ))}
        </div>
      </PublicSection>
      <PublicCTA title={t("public.faqPage.cta.title")} description={t("public.faqPage.cta.description")} />
    </>
  );
}
