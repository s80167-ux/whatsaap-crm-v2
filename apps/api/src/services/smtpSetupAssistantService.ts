import { promises as dns } from "node:dns";
import nodemailer from "nodemailer";
import { AppError } from "../lib/errors.js";

type SmtpSecurity = "STARTTLS" | "SSL" | "NONE";

export type SmtpConfigSuggestion = {
  smtpHost: string;
  smtpPort: number;
  security: SmtpSecurity;
  smtpUsername: string;
};

type DetectionResult = {
  domain: string;
  detectedProvider: string;
  providerLabel: string;
  confidence: number;
  suggestedConfig: SmtpConfigSuggestion | null;
  alternativeConfigs: SmtpConfigSuggestion[];
  notes: string[];
  unsupported: boolean;
};

type TestConfigInput = SmtpConfigSuggestion & {
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string | null;
  toEmail: string;
  sendEmail?: boolean;
};

const MICROSOFT_UNSUPPORTED_MESSAGE =
  "Microsoft Outlook / Microsoft 365 is not supported in this MVP. Please use Gmail App Password or a Custom SMTP provider.";

function validateEmailAddress(email: string, fieldName: string) {
  const trimmed = email.trim().toLowerCase();
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);

  if (!isValid) {
    throw new AppError(`${fieldName} must be a valid email address`, 400, "invalid_email_address");
  }

  return trimmed;
}

function getDomain(email: string) {
  const [, domain] = email.split("@");
  return domain.toLowerCase();
}

function genericConfigs(domain: string, username: string): SmtpConfigSuggestion[] {
  return [
    { smtpHost: `smtp.${domain}`, smtpPort: 587, security: "STARTTLS", smtpUsername: username },
    { smtpHost: `mail.${domain}`, smtpPort: 587, security: "STARTTLS", smtpUsername: username },
    { smtpHost: `smtp.${domain}`, smtpPort: 465, security: "SSL", smtpUsername: username },
    { smtpHost: `mail.${domain}`, smtpPort: 465, security: "SSL", smtpUsername: username }
  ];
}

function hasAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function detectFromMx(input: { email: string; domain: string; mxHosts: string[] }): DetectionResult {
  const mxText = input.mxHosts.join(" ");
  const fallback = genericConfigs(input.domain, input.email);

  if (hasAny(mxText, ["protection.outlook.com", "outlook.com", "office365", "microsoft"])) {
    return {
      domain: input.domain,
      detectedProvider: "microsoft_unsupported",
      providerLabel: "Microsoft Outlook / Microsoft 365",
      confidence: 0.95,
      suggestedConfig: null,
      alternativeConfigs: [],
      notes: [MICROSOFT_UNSUPPORTED_MESSAGE],
      unsupported: true
    };
  }

  if (hasAny(mxText, ["google.com", "googlemail.com", "aspmx.l.google"])) {
    return {
      domain: input.domain,
      detectedProvider: "google_workspace",
      providerLabel: input.domain === "gmail.com" ? "Gmail" : "Google Workspace",
      confidence: 0.95,
      suggestedConfig: { smtpHost: "smtp.gmail.com", smtpPort: 587, security: "STARTTLS", smtpUsername: input.email },
      alternativeConfigs: [],
      notes: ["Use Gmail App Password instead of your normal Google password."],
      unsupported: false
    };
  }

  if (hasAny(mxText, ["zoho"])) {
    return {
      domain: input.domain,
      detectedProvider: "zoho",
      providerLabel: "Zoho Mail",
      confidence: 0.9,
      suggestedConfig: { smtpHost: "smtp.zoho.com", smtpPort: 587, security: "STARTTLS", smtpUsername: input.email },
      alternativeConfigs: [{ smtpHost: "smtppro.zoho.com", smtpPort: 465, security: "SSL", smtpUsername: input.email }],
      notes: ["Use the SMTP password or app password configured in Zoho Mail."],
      unsupported: false
    };
  }

  if (input.domain === "yahoo.com" || hasAny(mxText, ["yahoodns", "yahoodns.net"])) {
    return {
      domain: input.domain,
      detectedProvider: "yahoo",
      providerLabel: "Yahoo Mail",
      confidence: 0.9,
      suggestedConfig: { smtpHost: "smtp.mail.yahoo.com", smtpPort: 587, security: "STARTTLS", smtpUsername: input.email },
      alternativeConfigs: [{ smtpHost: "smtp.mail.yahoo.com", smtpPort: 465, security: "SSL", smtpUsername: input.email }],
      notes: ["Yahoo accounts usually require an app password for SMTP."],
      unsupported: false
    };
  }

  if (hasAny(mxText, ["titan.email"])) {
    return {
      domain: input.domain,
      detectedProvider: "titan",
      providerLabel: "Titan Email",
      confidence: 0.9,
      suggestedConfig: { smtpHost: "smtp.titan.email", smtpPort: 465, security: "SSL", smtpUsername: input.email },
      alternativeConfigs: [{ smtpHost: "smtp.titan.email", smtpPort: 587, security: "STARTTLS", smtpUsername: input.email }],
      notes: ["Titan commonly supports SSL on port 465 and STARTTLS on port 587."],
      unsupported: false
    };
  }

  if (hasAny(mxText, ["hostinger"])) {
    return {
      domain: input.domain,
      detectedProvider: "hostinger",
      providerLabel: "Hostinger Email",
      confidence: 0.85,
      suggestedConfig: { smtpHost: "smtp.hostinger.com", smtpPort: 465, security: "SSL", smtpUsername: input.email },
      alternativeConfigs: [{ smtpHost: "smtp.hostinger.com", smtpPort: 587, security: "STARTTLS", smtpUsername: input.email }, ...fallback],
      notes: ["Use the mailbox password or app password from Hostinger email settings."],
      unsupported: false
    };
  }

  return {
    domain: input.domain,
    detectedProvider: "generic_smtp",
    providerLabel: "Custom SMTP",
    confidence: input.mxHosts.length > 0 ? 0.45 : 0.25,
    suggestedConfig: fallback[0],
    alternativeConfigs: fallback.slice(1),
    notes: ["Provider could not be identified from MX records. Try the suggestions below or use Advanced Manual Setup."],
    unsupported: false
  };
}

function mapSmtpError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("auth") || lower.includes("invalid login") || lower.includes("username") || lower.includes("password")) {
    return { code: "AUTH_FAILED", message: "Authentication failed. Check the SMTP username and app password." };
  }

  if (lower.includes("certificate") || lower.includes("tls") || lower.includes("ssl")) {
    return { code: "TLS_FAILED", message: "TLS/SSL negotiation failed. Check the selected security mode and port." };
  }

  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("etimedout")) {
    return { code: "TIMEOUT", message: "SMTP connection timed out. Check the host, port, or firewall." };
  }

  if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("econnreset") || lower.includes("network")) {
    return { code: "CONNECTION_FAILED", message: "Could not connect to the SMTP server. Check host and port." };
  }

  return { code: "UNKNOWN_ERROR", message: "Unable to verify SMTP settings. Check the provider settings and try again." };
}

export class SmtpSetupAssistantService {
  async detect(emailInput: string): Promise<DetectionResult> {
    const email = validateEmailAddress(emailInput, "email");
    const domain = getDomain(email);

    try {
      const records = await dns.resolveMx(domain);
      const mxHosts = records
        .sort((left, right) => left.priority - right.priority)
        .map((record) => record.exchange.toLowerCase());
      return detectFromMx({ email, domain, mxHosts });
    } catch {
      const alternatives = genericConfigs(domain, email);
      return {
        domain,
        detectedProvider: "generic_smtp",
        providerLabel: "Custom SMTP",
        confidence: 0.2,
        suggestedConfig: alternatives[0],
        alternativeConfigs: alternatives.slice(1),
        notes: ["MX lookup did not return a known provider. Try the suggestions below or use Advanced Manual Setup."],
        unsupported: false
      };
    }
  }

  async testConfig(input: TestConfigInput) {
    const fromEmail = validateEmailAddress(input.fromEmail, "from_email");
    const toEmail = validateEmailAddress(input.toEmail, "to_email");

    if (!input.smtpPassword.trim()) {
      throw new AppError("SMTP password or app password is required", 400, "smtp_password_required");
    }

    const transporter = nodemailer.createTransport({
      host: input.smtpHost.trim(),
      port: input.smtpPort,
      secure: input.security === "SSL",
      requireTLS: input.security === "STARTTLS",
      ignoreTLS: input.security === "NONE",
      auth: {
        user: input.smtpUsername.trim(),
        pass: input.smtpPassword
      }
    });

    try {
      await transporter.verify();

      if (input.sendEmail !== false) {
        await transporter.sendMail({
          from: `${input.fromName.trim() || "CRM Team"} <${fromEmail}>`,
          to: toEmail,
          subject: "SMTP test email from CRM",
          html: "<p>This is a SMTP test email from the CRM email campaign MVP.</p>",
          text: "This is a SMTP test email from the CRM email campaign MVP.",
          replyTo: input.replyTo || undefined
        });
      }

      return { ok: true, message: `SMTP settings verified${input.sendEmail === false ? "." : ` and test email sent to ${toEmail}.`}` };
    } catch (error) {
      const mapped = mapSmtpError(error);
      throw new AppError(mapped.message, 400, mapped.code);
    }
  }
}
