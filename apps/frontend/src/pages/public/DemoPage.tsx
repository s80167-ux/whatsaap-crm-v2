import { BarChart3, GitBranch, Inbox, Megaphone, PieChart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { PublicSection } from "../../components/public/PublicSection";
import { PublicVisualShowcase } from "../../components/public/PublicVisualShowcase";

type PreviewCard = {
  title: string;
  description: string;
};

function translatedArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

const previewIcons = [BarChart3, Inbox, GitBranch, Megaphone, PieChart];

export function DemoPage() {
  const { t } = useTranslation();
  const previews = translatedArray<PreviewCard>(t("public.demoPage.previews", { returnObjects: true }));

  return (
    <>
      <PublicSection className="bg-white/95" eyebrow={t("public.demoPage.eyebrow")} title={t("public.demoPage.title")} description={t("public.demoPage.description")}>
        <PublicVisualShowcase
          title={t("public.demoPage.title")}
          description={t("public.demoPage.description")}
          image="dashboard"
          highlights={previews.slice(0, 4).map((preview) => preview.title)}
        />
        <div className="public-glow-card rounded-[2rem] border border-[#d9e1ef] bg-[#071f52] p-4 shadow-2xl shadow-[#021f62]/15 sm:p-6">
          <div className="grid gap-4 md:grid-cols-4">
            {["newLeads", "pendingFollowUp", "campaignStatus", "salesPipeline"].map((key) => (
              <div key={key} className="rounded-3xl bg-white/95 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#66708d]">{t(`public.demoPage.metrics.${key}.label`)}</p>
                <p className="mt-3 text-2xl font-semibold text-[#071f52]">{t(`public.demoPage.metrics.${key}.value`)}</p>
                <p className="mt-1 text-sm text-[#0751d8]">{t(`public.demoPage.metrics.${key}.note`)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-3xl bg-white/95 p-5">
              <h2 className="text-base font-semibold text-[#071f52]">{t("public.demoPage.pipelineTitle")}</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                {["Lead", "Follow Up", "Quote", "Closed"].map((stage, index) => (
                  <div key={stage} className="rounded-2xl bg-[#f8fbff] p-4">
                    <p className="text-sm font-semibold text-[#071f52]">{stage}</p>
                    <div className="mt-4 h-2 rounded-full bg-[#d9e1ef]">
                      <div className="h-2 rounded-full bg-[#0751d8]" style={{ width: `${88 - index * 14}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl bg-white/95 p-5">
              <h2 className="text-base font-semibold text-[#071f52]">{t("public.demoPage.inboxTitle")}</h2>
              <div className="mt-4 space-y-3">
                {["Nur Aina", "Farid Auto", "Kedai Seri"].map((name) => (
                  <div key={name} className="rounded-2xl bg-[#f8fbff] p-3">
                    <p className="text-sm font-semibold text-[#071f52]">{name}</p>
                    <p className="text-xs text-[#66708d]">{t("public.demoPage.mockOnly")}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {previews.map((preview, index) => {
            const Icon = previewIcons[index] ?? BarChart3;

            return (
              <article key={preview.title} className="public-glow-card rounded-3xl border border-[#d9e1ef] bg-[#f8fbff] p-5">
                <Icon className="h-5 w-5 text-[#0751d8]" aria-hidden="true" />
                <h2 className="mt-4 text-base font-semibold text-[#071f52]">{preview.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[#66708d]">{preview.description}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/login" className="inline-flex items-center justify-center rounded-full bg-[#071f52] px-6 py-3 text-sm font-semibold text-white">
            {t("public.demoPage.loginCta")}
          </Link>
          <Link to="/contact" className="inline-flex items-center justify-center rounded-full border border-[#b9c7df] px-6 py-3 text-sm font-semibold text-[#071f52]">
            {t("public.demoPage.contactCta")}
          </Link>
        </div>
      </PublicSection>
    </>
  );
}
