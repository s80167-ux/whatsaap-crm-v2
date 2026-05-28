import { ArrowRight, BarChart3, CheckCircle2, MessageCircle, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { PublicCTA } from "../../components/public/PublicCTA";
import { PublicSection } from "../../components/public/PublicSection";
import { PublicVisualShowcase } from "../../components/public/PublicVisualShowcase";

type CardItem = {
  title: string;
  description: string;
};

type StepItem = {
  title: string;
  description: string;
};

function translatedArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function LandingPage() {
  const { t } = useTranslation();
  const painPoints = translatedArray<CardItem>(t("public.landing.pain.cards", { returnObjects: true }));
  const solutions = translatedArray<CardItem>(t("public.landing.solution.cards", { returnObjects: true }));
  const steps = translatedArray<StepItem>(t("public.landing.how.steps", { returnObjects: true }));
  const suitable = translatedArray<string>(t("public.landing.suitable.items", { returnObjects: true }));

  return (
    <>
      <section className="overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(7,81,216,0.16),_transparent_34%),linear-gradient(135deg,#f4f8ff_0%,#ffffff_52%,#eef4ff_100%)] px-4 pb-16 pt-12 sm:px-6 lg:px-8 lg:pb-20">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <span className="inline-flex rounded-full border border-[#b9c7df] bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#0646bd] shadow-sm">
              {t("public.landing.hero.badge")}
            </span>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-[#071f52] sm:text-5xl lg:text-6xl">
              {t("public.landing.hero.title")}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-[#66708d] sm:text-lg">{t("public.landing.hero.subtitle")}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/demo"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#071f52] px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-[#021f62]/15 transition hover:bg-[#0646bd]"
              >
                {t("public.landing.hero.primaryCta")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-full border border-[#b9c7df] bg-white/90 px-6 py-3 text-sm font-semibold text-[#071f52] transition hover:border-[#9db9f2] hover:bg-[#eef4ff]"
              >
                {t("public.landing.hero.secondaryCta")}
              </Link>
            </div>
          </div>

          <div className="public-float rounded-[2rem] border border-white bg-white/90 p-4 shadow-2xl shadow-[#021f62]/10 backdrop-blur">
            <div className="rounded-[1.5rem] border border-[#d9e1ef] bg-[#071f52] p-4 text-white">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs text-[#d9e1ef]">{t("public.landing.preview.label")}</p>
                  <h2 className="mt-1 text-lg font-semibold">{t("public.landing.preview.title")}</h2>
                </div>
                <BarChart3 className="h-6 w-6 text-[#9db9f2]" aria-hidden="true" />
              </div>
              <div className="grid gap-3 py-4 sm:grid-cols-2">
                {["totalLeads", "followUpToday", "campaignReady", "closedWon"].map((key) => (
                  <div key={key} className="rounded-2xl bg-white/10 p-4">
                    <p className="text-xs text-[#d9e1ef]">{t(`public.landing.preview.${key}.label`)}</p>
                    <p className="mt-2 text-2xl font-semibold">{t(`public.landing.preview.${key}.value`)}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-3 rounded-2xl bg-white/95 p-4 text-[#071f52]">
                {["Aisyah Bundle", "Katering Dapur Ibu", "Agent Hartanah KL"].map((name, index) => (
                  <div key={name} className="flex items-center justify-between rounded-xl bg-[#f8fbff] p-3">
                    <div>
                      <p className="text-sm font-semibold">{name}</p>
                      <p className="text-xs text-[#66708d]">{t(`public.landing.preview.rows.${index}`)}</p>
                    </div>
                    <span className="rounded-full bg-[#dbeafe] px-3 py-1 text-xs font-semibold text-[#0646bd]">
                      {t("public.landing.preview.status")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <PublicSection>
        <PublicVisualShowcase
          title={t("public.landing.solution.title")}
          description={t("public.landing.hero.subtitle")}
          image="campaign"
          highlights={solutions.slice(0, 4).map((solution) => solution.title)}
        />
      </PublicSection>

      <PublicSection title={t("public.landing.pain.title")}>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {painPoints.map((item) => (
            <article key={item.title} className="public-glow-card rounded-3xl border border-[#d9e1ef] bg-white/95 p-5 shadow-sm">
              <MessageCircle className="h-5 w-5 text-[#d94242]" aria-hidden="true" />
              <h3 className="mt-4 text-sm font-semibold text-[#071f52]">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#66708d]">{item.description}</p>
            </article>
          ))}
        </div>
      </PublicSection>

      <PublicSection className="bg-white/95" title={t("public.landing.solution.title")}>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {solutions.map((item) => (
            <article key={item.title} className="public-glow-card rounded-3xl border border-[#d9e1ef] bg-[#eef4ff]/70 p-6">
              <CheckCircle2 className="h-5 w-5 text-[#0751d8]" aria-hidden="true" />
              <h3 className="mt-4 text-base font-semibold text-[#071f52]">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#66708d]">{item.description}</p>
            </article>
          ))}
        </div>
      </PublicSection>

      <PublicSection title={t("public.landing.how.title")}>
        <div className="grid gap-4 md:grid-cols-5">
          {steps.map((step, index) => (
            <article key={step.title} className="public-glow-card rounded-3xl border border-[#d9e1ef] bg-white/95 p-5 shadow-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#071f52] text-sm font-semibold text-white">{index + 1}</span>
              <h3 className="mt-4 text-sm font-semibold text-[#071f52]">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#66708d]">{step.description}</p>
            </article>
          ))}
        </div>
      </PublicSection>

      <PublicSection className="bg-white/95" title={t("public.landing.suitable.title")}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suitable.map((item) => (
            <div key={item} className="public-glow-card flex items-center gap-3 rounded-2xl border border-[#d9e1ef] bg-[#f8fbff] p-4 text-sm font-semibold text-[#071f52]">
              <Users className="h-4 w-4 text-[#0751d8]" aria-hidden="true" />
              {item}
            </div>
          ))}
        </div>
      </PublicSection>

      <PublicCTA title={t("public.landing.finalCta.title")} description={t("public.landing.finalCta.description")} />
    </>
  );
}
