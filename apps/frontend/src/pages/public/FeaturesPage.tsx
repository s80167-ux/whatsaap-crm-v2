import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PublicCTA } from "../../components/public/PublicCTA";
import { PublicSection } from "../../components/public/PublicSection";
import { PublicVisualShowcase } from "../../components/public/PublicVisualShowcase";

type FeatureCategory = {
  title: string;
  description: string;
  items: string[];
};

function translatedArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function FeaturesPage() {
  const { t } = useTranslation();
  const categories = translatedArray<FeatureCategory>(t("public.featuresPage.categories", { returnObjects: true }));

  return (
    <>
      <PublicSection className="bg-white/95" eyebrow={t("public.featuresPage.eyebrow")} title={t("public.featuresPage.title")} description={t("public.featuresPage.description")}>
        <PublicVisualShowcase
          title={t("public.featuresPage.title")}
          description={t("public.featuresPage.description")}
          image="dashboard"
          highlights={categories.slice(0, 4).map((category) => category.title)}
        />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <article key={category.title} className="public-glow-card rounded-3xl border border-[#d9e1ef] bg-[#f8fbff] p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-[#071f52]">{category.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#66708d]">{category.description}</p>
              <ul className="mt-5 space-y-3">
                {category.items.map((item) => (
                  <li key={item} className="flex gap-3 text-sm text-[#42516f]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0751d8]" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </PublicSection>
      <PublicCTA title={t("public.featuresPage.cta.title")} description={t("public.featuresPage.cta.description")} />
    </>
  );
}
