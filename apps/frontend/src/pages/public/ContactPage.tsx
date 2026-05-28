import { Mail, Send, Users } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { PublicSection } from "../../components/public/PublicSection";
import { SUPPORT_EMAIL } from "../../constants/publicBrand";

export function ContactPage() {
  const { t } = useTranslation();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitted(true);
  };

  return (
    <PublicSection className="bg-white/95" eyebrow={t("public.contactPage.eyebrow")} title={t("public.contactPage.title")} description={t("public.contactPage.description")}>
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <article className="public-glow-card rounded-3xl border border-[#d9e1ef] bg-[#f8fbff] p-6">
            <Mail className="h-5 w-5 text-[#0751d8]" aria-hidden="true" />
            <h2 className="mt-4 text-base font-semibold text-[#071f52]">{t("public.contactPage.emailTitle")}</h2>
            <a className="mt-2 inline-flex text-sm font-semibold text-[#0751d8] hover:text-[#0646bd]" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
            <p className="mt-3 text-sm leading-6 text-[#66708d]">{t("public.contactPage.responseNote")}</p>
          </article>
          <article className="public-glow-card rounded-3xl border border-[#d9e1ef] bg-[#f8fbff] p-6">
            <Users className="h-5 w-5 text-[#0751d8]" aria-hidden="true" />
            <h2 className="mt-4 text-base font-semibold text-[#071f52]">{t("public.contactPage.audienceTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-[#66708d]">{t("public.contactPage.audienceNote")}</p>
          </article>
        </div>

        <form onSubmit={handleSubmit} className="public-glow-card rounded-3xl border border-[#d9e1ef] bg-[#f8fbff] p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-[#071f52]">
              {t("public.contactPage.form.name")}
              <input className="mt-2 w-full rounded-2xl border border-[#d9e1ef] bg-white/95 px-4 py-3 text-sm outline-none transition focus:border-[#0751d8] focus:ring-4 focus:ring-[#dbeafe]" name="name" type="text" required />
            </label>
            <label className="text-sm font-semibold text-[#071f52]">
              {t("public.contactPage.form.email")}
              <input className="mt-2 w-full rounded-2xl border border-[#d9e1ef] bg-white/95 px-4 py-3 text-sm outline-none transition focus:border-[#0751d8] focus:ring-4 focus:ring-[#dbeafe]" name="email" type="email" required />
            </label>
          </div>
          <label className="mt-4 block text-sm font-semibold text-[#071f52]">
            {t("public.contactPage.form.businessName")}
            <input className="mt-2 w-full rounded-2xl border border-[#d9e1ef] bg-white/95 px-4 py-3 text-sm outline-none transition focus:border-[#0751d8] focus:ring-4 focus:ring-[#dbeafe]" name="businessName" type="text" />
          </label>
          <label className="mt-4 block text-sm font-semibold text-[#071f52]">
            {t("public.contactPage.form.message")}
            <textarea className="mt-2 min-h-36 w-full rounded-2xl border border-[#d9e1ef] bg-white/95 px-4 py-3 text-sm outline-none transition focus:border-[#0751d8] focus:ring-4 focus:ring-[#dbeafe]" name="message" required />
          </label>
          {isSubmitted ? (
            <p className="mt-4 rounded-2xl bg-[#eef4ff] p-4 text-sm font-medium text-[#0646bd]">{t("public.contactPage.success")}</p>
          ) : null}
          <button type="submit" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#071f52] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0646bd] sm:w-auto">
            <Send className="h-4 w-4" aria-hidden="true" />
            {t("public.contactPage.form.submit")}
          </button>
        </form>
      </div>
    </PublicSection>
  );
}
