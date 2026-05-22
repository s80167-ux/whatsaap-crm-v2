export type FriendlySmtpError = {
  errorCode: string;
  friendlyMessage: string;
  title: string;
  explanation: string;
  nextActions: string[];
};

function getErrorText(error: unknown) {
  if (error instanceof Error) {
    const extra = [
      "code" in error && typeof error.code === "string" ? error.code : null,
      "response" in error && typeof error.response === "string" ? error.response : null,
      "responseCode" in error && typeof error.responseCode === "number" ? String(error.responseCode) : null
    ]
      .filter(Boolean)
      .join(" ");

    return `${error.message} ${extra}`.trim();
  }

  return String(error ?? "");
}

export function normalizeGmailAppPassword(value: string) {
  return value.replace(/\s+/g, "");
}

export function mapFriendlySmtpError(error: unknown): FriendlySmtpError {
  const message = getErrorText(error);
  const lower = message.toLowerCase();

  if (lower.includes("534-5.7.9") || lower.includes("invalidsecondfactor") || lower.includes("application-specific password required")) {
    return {
      errorCode: "GMAIL_APP_PASSWORD_REQUIRED",
      friendlyMessage:
        "Gmail requires an App Password. Your normal Gmail password will not work. Please enable 2-Step Verification and create a 16-character App Password.",
      title: "Gmail App Password required",
      explanation: "Gmail rejected the login because normal Gmail passwords cannot be used for SMTP.",
      nextActions: ["Enable 2-Step Verification", "Create a Gmail App Password", "Paste the 16-character App Password into CRM"]
    };
  }

  if (lower.includes("535") || lower.includes("eauth") || lower.includes("authentication failed") || lower.includes("invalid login")) {
    return {
      errorCode: "SMTP_AUTH_FAILED",
      friendlyMessage: "SMTP login failed. Please check your email address, username and App Password.",
      title: "SMTP login failed",
      explanation: "The SMTP provider did not accept the username and password combination.",
      nextActions: ["Check the email address", "Check the SMTP username", "Paste the latest App Password or mailbox password"]
    };
  }

  if (lower.includes("etimedout") || lower.includes("econnection") || lower.includes("enotfound") || lower.includes("econnrefused") || lower.includes("econnreset") || lower.includes("timeout")) {
    return {
      errorCode: "SMTP_CONNECTION_FAILED",
      friendlyMessage: "CRM cannot connect to the SMTP server. Please check SMTP host, port and internet/server access.",
      title: "Cannot connect to SMTP server",
      explanation: "CRM could not reach the mail server using the selected host and port.",
      nextActions: ["Check the SMTP host spelling", "Try port 587 with STARTTLS or port 465 with SSL", "Confirm the provider allows SMTP access"]
    };
  }

  if (lower.includes("self signed certificate") || lower.includes("certificate") || lower.includes("tls") || lower.includes("ssl")) {
    return {
      errorCode: "SMTP_TLS_FAILED",
      friendlyMessage: "TLS/SSL connection failed. Please check whether your provider uses STARTTLS on port 587 or SSL on port 465.",
      title: "TLS/SSL connection failed",
      explanation: "The selected security setting does not match what the SMTP provider expects.",
      nextActions: ["Use STARTTLS with port 587", "Use SSL with port 465", "Check your provider SMTP documentation"]
    };
  }

  if (lower.includes("from address rejected") || lower.includes("sender address rejected")) {
    return {
      errorCode: "SMTP_FROM_REJECTED",
      friendlyMessage:
        "The SMTP provider rejected the From Email. Please use the same email address as the SMTP username or an approved sender address.",
      title: "From Email was rejected",
      explanation: "The provider does not allow this account to send using the selected From Email.",
      nextActions: ["Use the same address as the SMTP username", "Verify the sender address with your provider", "Try again after saving the approved sender"]
    };
  }

  return {
    errorCode: "SMTP_UNKNOWN_ERROR",
    friendlyMessage: "Unable to verify SMTP settings. Please check the provider settings and try again.",
    title: "SMTP test failed",
    explanation: "The provider returned an error that CRM could not safely classify.",
    nextActions: ["Check the SMTP host, port and security", "Check the username and password", "Try the provider recommended SMTP settings"]
  };
}
