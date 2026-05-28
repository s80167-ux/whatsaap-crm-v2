import { Mail, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/Card";
import { PRODUCT_NAME, SUPPORT_EMAIL } from "../constants/publicBrand";

type PublicCompliancePageProps = {
  variant: "data-deletion" | "privacy-policy" | "terms";
};

export function PublicCompliancePage({ variant }: PublicCompliancePageProps) {
  const { t } = useTranslation();
  const isDataDeletion = variant === "data-deletion";
  const isPrivacyPolicy = variant === "privacy-policy";
  const pageTitle = t(`public.legal.${variant}.title`);
  const pageDescription = t(`public.legal.${variant}.description`);

  return (
    <div className="bg-hero-grid px-4 py-10 text-text sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{PRODUCT_NAME}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {pageTitle}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">
              {pageDescription}
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-card shadow-soft">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
        </div>

        <Card className="public-glow-card space-y-8 p-6 sm:p-8" elevated>
          {isDataDeletion ? <DataDeletionContent /> : isPrivacyPolicy ? <PrivacyPolicyContent /> : <TermsContent />}
        </Card>
      </div>
    </div>
  );
}

function DataDeletionContent() {
  const { t } = useTranslation();

  return (
    <>
      <Section title={t("public.legal.data-deletion.sections.request")}>
        <p>
          If you connected a Facebook account, Facebook Page, or Messenger channel to {PRODUCT_NAME}, you may request deletion of personal data associated with that connection.
        </p>
        <p>
          Email us at <EmailLink /> with the subject line "Facebook Data Deletion Request". Include your name, organization name, Facebook Page name if applicable, and the email address used for your CRM account.
        </p>
      </Section>

      <Section title={t("public.legal.data-deletion.sections.delete")}>
        <p>
          After verifying the request, we will remove or anonymize personal profile information, channel connection records, access tokens, and message data that we are legally and operationally allowed to delete.
        </p>
        <p>
          We may retain limited records when required for security, fraud prevention, legal compliance, audit history, or dispute resolution.
        </p>
      </Section>

      <Section title={t("public.legal.data-deletion.sections.time")}>
        <p>
          We aim to complete verified deletion requests within 30 days. If additional verification or legal review is required, we will notify you using the contact details provided in your request.
        </p>
      </Section>

      <Section title={t("public.legal.data-deletion.sections.contact")}>
        <p>
          For privacy and deletion requests, contact <EmailLink />.
        </p>
      </Section>
    </>
  );
}

function PrivacyPolicyContent() {
  const { t } = useTranslation();

  return (
    <>
      <Section title={t("public.legal.privacy-policy.sections.collect")}>
        <p>
          {PRODUCT_NAME} may collect account details, organization details, user access information, contact records, customer conversation content, and connected channel information needed to provide the CRM service.
        </p>
        <p>
          If you connect Facebook Messenger or other Meta channels, we may process Page information, permissions, identifiers, messages, and related metadata required to route conversations into your CRM workspace.
        </p>
      </Section>

      <Section title={t("public.legal.privacy-policy.sections.use")}>
        <p>
          We use information to operate CRM features, manage users and permissions, display customer conversations, support connected channels, provide reporting, protect accounts, and respond to support requests.
        </p>
      </Section>

      <Section title={t("public.legal.privacy-policy.sections.sharing")}>
        <p>
          We do not sell personal data. We may share limited information with infrastructure, hosting, messaging, analytics, or support providers only where needed to operate and secure the service.
        </p>
      </Section>

      <Section title={t("public.legal.privacy-policy.sections.security")}>
        <p>
          We use reasonable technical and organizational safeguards to protect data. We retain information for as long as needed to provide the service, meet legal obligations, resolve disputes, and maintain audit records.
        </p>
      </Section>

      <Section title={t("public.legal.privacy-policy.sections.choices")}>
        <p>
          You may request access, correction, or deletion of personal data by contacting <EmailLink />. Facebook-related deletion instructions are available on our Data Deletion page.
        </p>
      </Section>
    </>
  );
}

function TermsContent() {
  const { t } = useTranslation();

  return (
    <>
      <Section title={t("public.legal.terms.sections.service")}>
        <p>
          {PRODUCT_NAME} provides CRM, messaging, contact management, campaign, and reporting tools for businesses. You agree to use the service only for lawful business purposes and in compliance with applicable platform rules.
        </p>
      </Section>

      <Section title={t("public.legal.terms.sections.account")}>
        <p>
          You are responsible for maintaining the confidentiality of your account credentials, managing user access in your organization, and ensuring that connected channels are authorized by the relevant business owner.
        </p>
      </Section>

      <Section title={t("public.legal.terms.sections.messaging")}>
        <p>
          When using WhatsApp, Facebook, Instagram, email, or any other connected channel, you must follow the applicable provider policies, customer consent requirements, anti-spam rules, and local laws.
        </p>
      </Section>

      <Section title={t("public.legal.terms.sections.privacy")}>
        <p>
          We process customer, conversation, and channel data to provide the CRM service. We use reasonable safeguards to protect data and only access connected account information needed to operate the service.
        </p>
      </Section>

      <Section title={t("public.legal.terms.sections.changes")}>
        <p>
          We may update these terms as the product changes. Questions about these terms can be sent to <EmailLink />.
        </p>
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-text-muted">{children}</div>
    </section>
  );
}

function EmailLink() {
  return (
    <a className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-hover" href={`mailto:${SUPPORT_EMAIL}`}>
      <Mail className="h-3.5 w-3.5" aria-hidden="true" />
      {SUPPORT_EMAIL}
    </a>
  );
}
