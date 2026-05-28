import { Mail, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "../components/Card";

type PublicCompliancePageProps = {
  variant: "data-deletion" | "privacy-policy" | "terms";
};

const supportEmail = "support@rezekicrm.com";
const productName = "Rezeki Dashboard";

export function PublicCompliancePage({ variant }: PublicCompliancePageProps) {
  const isDataDeletion = variant === "data-deletion";
  const isPrivacyPolicy = variant === "privacy-policy";
  const pageTitle = isDataDeletion ? "Data Deletion Instructions" : isPrivacyPolicy ? "Privacy Policy" : "Terms of Service";
  const pageDescription = isDataDeletion
    ? "Instructions for requesting removal of data connected through Facebook Login, Facebook Messenger, or other supported channel integrations."
    : isPrivacyPolicy
      ? "How Rezeki Dashboard collects, uses, protects, and manages information for CRM users and connected messaging channels."
      : "Standard terms for using the Rezeki Dashboard web application and connected messaging tools.";

  return (
    <main className="min-h-screen bg-hero-grid px-4 py-10 text-text sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{productName}</p>
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

        <Card className="space-y-8 p-6 sm:p-8" elevated>
          {isDataDeletion ? <DataDeletionContent /> : isPrivacyPolicy ? <PrivacyPolicyContent /> : <TermsContent />}
        </Card>
      </div>
    </main>
  );
}

function DataDeletionContent() {
  return (
    <>
      <Section title="How to Request Data Deletion">
        <p>
          If you connected a Facebook account, Facebook Page, or Messenger channel to {productName}, you may request deletion of personal data associated with that connection.
        </p>
        <p>
          Email us at <EmailLink /> with the subject line "Facebook Data Deletion Request". Include your name, organization name, Facebook Page name if applicable, and the email address used for your CRM account.
        </p>
      </Section>

      <Section title="What We Delete">
        <p>
          After verifying the request, we will remove or anonymize personal profile information, channel connection records, access tokens, and message data that we are legally and operationally allowed to delete.
        </p>
        <p>
          We may retain limited records when required for security, fraud prevention, legal compliance, audit history, or dispute resolution.
        </p>
      </Section>

      <Section title="Processing Time">
        <p>
          We aim to complete verified deletion requests within 30 days. If additional verification or legal review is required, we will notify you using the contact details provided in your request.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          For privacy and deletion requests, contact <EmailLink />.
        </p>
      </Section>
    </>
  );
}

function PrivacyPolicyContent() {
  return (
    <>
      <Section title="Information We Collect">
        <p>
          {productName} may collect account details, organization details, user access information, contact records, customer conversation content, and connected channel information needed to provide the CRM service.
        </p>
        <p>
          If you connect Facebook Messenger or other Meta channels, we may process Page information, permissions, identifiers, messages, and related metadata required to route conversations into your CRM workspace.
        </p>
      </Section>

      <Section title="How We Use Information">
        <p>
          We use information to operate CRM features, manage users and permissions, display customer conversations, support connected channels, provide reporting, protect accounts, and respond to support requests.
        </p>
      </Section>

      <Section title="Data Sharing">
        <p>
          We do not sell personal data. We may share limited information with infrastructure, hosting, messaging, analytics, or support providers only where needed to operate and secure the service.
        </p>
      </Section>

      <Section title="Security and Retention">
        <p>
          We use reasonable technical and organizational safeguards to protect data. We retain information for as long as needed to provide the service, meet legal obligations, resolve disputes, and maintain audit records.
        </p>
      </Section>

      <Section title="Your Choices">
        <p>
          You may request access, correction, or deletion of personal data by contacting <EmailLink />. Facebook-related deletion instructions are available on our Data Deletion page.
        </p>
      </Section>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <Section title="Use of Service">
        <p>
          {productName} provides CRM, messaging, contact management, campaign, and reporting tools for businesses. You agree to use the service only for lawful business purposes and in compliance with applicable platform rules.
        </p>
      </Section>

      <Section title="Account Responsibility">
        <p>
          You are responsible for maintaining the confidentiality of your account credentials, managing user access in your organization, and ensuring that connected channels are authorized by the relevant business owner.
        </p>
      </Section>

      <Section title="Messaging and Platform Compliance">
        <p>
          When using WhatsApp, Facebook, Instagram, email, or any other connected channel, you must follow the applicable provider policies, customer consent requirements, anti-spam rules, and local laws.
        </p>
      </Section>

      <Section title="Data and Privacy">
        <p>
          We process customer, conversation, and channel data to provide the CRM service. We use reasonable safeguards to protect data and only access connected account information needed to operate the service.
        </p>
      </Section>

      <Section title="Changes and Contact">
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
    <a className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-hover" href={`mailto:${supportEmail}`}>
      <Mail className="h-3.5 w-3.5" aria-hidden="true" />
      {supportEmail}
    </a>
  );
}
