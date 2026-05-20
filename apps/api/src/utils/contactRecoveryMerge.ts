import type { ContactRecord } from "../types/domain.js";
import { isUnknownOrEmptyName, normalizeRecoveryPhone, pickBestRecoveryName } from "./whatsappIdentity.js";

export type ContactRecoveryCandidate = {
  displayName?: string | null;
  phoneNumber?: string | null;
  profilePicUrl?: string | null;
  companyName?: string | null;
};

export function mergeContactWithoutDowngrade(
  existingContact: Pick<
    ContactRecord,
    "display_name" | "primary_phone_e164" | "primary_phone_normalized" | "primary_avatar_url" | "company_name"
  >,
  incomingCandidate: ContactRecoveryCandidate
) {
  const phone = normalizeRecoveryPhone(incomingCandidate.phoneNumber);
  const displayName = pickBestRecoveryName(incomingCandidate.displayName);
  const profilePicUrl =
    typeof incomingCandidate.profilePicUrl === "string" && incomingCandidate.profilePicUrl.trim().length > 0
      ? incomingCandidate.profilePicUrl.trim()
      : null;
  const companyName =
    typeof incomingCandidate.companyName === "string" && incomingCandidate.companyName.trim().length > 0
      ? incomingCandidate.companyName.trim()
      : null;

  return {
    display_name:
      displayName && isUnknownOrEmptyName(existingContact.display_name) ? displayName : existingContact.display_name,
    primary_phone_e164:
      phone && !existingContact.primary_phone_normalized ? phone : existingContact.primary_phone_e164,
    primary_phone_normalized:
      phone && !existingContact.primary_phone_normalized ? phone : existingContact.primary_phone_normalized,
    primary_avatar_url:
      profilePicUrl && !existingContact.primary_avatar_url ? profilePicUrl : existingContact.primary_avatar_url,
    company_name:
      companyName && !existingContact.company_name ? companyName : existingContact.company_name
  };
}

export function hasRecoveryMergeChanges(
  before: Pick<ContactRecord, "display_name" | "primary_phone_normalized" | "primary_avatar_url" | "company_name">,
  after: ReturnType<typeof mergeContactWithoutDowngrade>
) {
  return (
    before.display_name !== after.display_name ||
    before.primary_phone_normalized !== after.primary_phone_normalized ||
    (before.primary_avatar_url ?? null) !== (after.primary_avatar_url ?? null) ||
    before.company_name !== after.company_name
  );
}
