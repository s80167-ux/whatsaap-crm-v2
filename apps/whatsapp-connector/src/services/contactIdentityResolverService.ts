import { normalizePhoneNumber, normalizeWhatsAppJid, jidToPhone } from "../utils/phone.js";
import { WhatsAppSessionManager, type StoredContactSnapshot } from "../whatsapp/sessionManager.js";

type ResolveContactIdentityInput = {
  contactId?: string | null;
  jid?: string | null;
  lid?: string | null;
  knownPhone?: string | null;
  displayName?: string | null;
};

type ResolutionEvidence = {
  type: string;
  weight: number;
  value?: string | null;
};

const WEAK_CONTACT_NAMES = new Set([
  "unknown",
  "unknown contact",
  "customer",
  "no name",
  "noname",
  "whatsapp",
  "business",
  "user",
  "device",
  "iphone",
  "android",
  "test",
  "admin",
  "contact",
  "undefined",
  "null"
]);

function cleanName(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function isUsefulName(value: string | null | undefined) {
  const normalized = cleanName(value);
  if (!normalized) return false;
  const lower = normalized.toLowerCase();
  if (WEAK_CONTACT_NAMES.has(lower)) return false;
  if (/^\+?\d{6,15}$/.test(normalized.replace(/\s+/g, ""))) return false;
  return true;
}

function phoneJidFromPhone(value: string | null | undefined) {
  const phone = normalizePhoneNumber(value);
  const digits = phone?.replace(/\D/g, "") ?? "";
  return digits ? `${digits}@s.whatsapp.net` : null;
}

function bestSnapshotName(snapshot: StoredContactSnapshot | null) {
  if (!snapshot) return null;
  if (isUsefulName(snapshot.verifiedName)) return cleanName(snapshot.verifiedName);
  if (isUsefulName(snapshot.name)) return cleanName(snapshot.name);
  if (isUsefulName(snapshot.notify)) return cleanName(snapshot.notify);
  return null;
}

function snapshotMatches(snapshot: StoredContactSnapshot, candidates: Set<string>, knownPhone: string | null) {
  const fields = [snapshot.id, snapshot.jid, snapshot.lid]
    .map((value) => (typeof value === "string" ? normalizeWhatsAppJid(value) ?? value : null))
    .filter((value): value is string => Boolean(value));

  if (fields.some((field) => candidates.has(field))) return true;

  const snapshotPhone = normalizePhoneNumber(jidToPhone(snapshot.jid));
  return Boolean(knownPhone && snapshotPhone && snapshotPhone === knownPhone);
}

function snapshotScore(snapshot: StoredContactSnapshot) {
  return (
    (jidToPhone(snapshot.jid) ? 30 : 0) +
    (isUsefulName(snapshot.verifiedName) ? 25 : 0) +
    (isUsefulName(snapshot.name) ? 20 : 0) +
    (isUsefulName(snapshot.notify) ? 10 : 0) +
    (snapshot.imgUrl && snapshot.imgUrl !== "changed" ? 10 : 0)
  );
}

function confidenceFromEvidence(evidence: ResolutionEvidence[]) {
  return Math.min(
    100,
    evidence.reduce((sum, item) => sum + item.weight, 0)
  );
}

export class ContactIdentityResolverService {
  constructor(private readonly sessionManager = WhatsAppSessionManager.getInstance()) {}

  async resolve(accountId: string, input: ResolveContactIdentityInput) {
    const knownPhone = normalizePhoneNumber(input.knownPhone);
    const knownPhoneJid = phoneJidFromPhone(knownPhone);
    const normalizedJid = normalizeWhatsAppJid(input.jid ?? null);
    const normalizedLid = normalizeWhatsAppJid(input.lid ?? null);
    const candidates = new Set<string>(
      [input.jid, input.lid, normalizedJid, normalizedLid, knownPhoneJid]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => normalizeWhatsAppJid(value) ?? value)
    );

    const snapshot = this.sessionManager
      .listStoredContacts(accountId)
      .filter((contact) => snapshotMatches(contact, candidates, knownPhone))
      .sort((left, right) => snapshotScore(right) - snapshotScore(left))[0] ?? null;

    const evidence: ResolutionEvidence[] = [];
    let resolvedJid = normalizeWhatsAppJid(snapshot?.jid ?? null) ?? normalizedJid ?? null;
    const resolvedLid = normalizeWhatsAppJid(snapshot?.lid ?? null) ?? normalizedLid ?? null;
    let phoneNumber = normalizePhoneNumber(jidToPhone(resolvedJid)) ?? knownPhone ?? null;
    const displayName = bestSnapshotName(snapshot);
    let profilePicUrl = snapshot?.imgUrl && snapshot.imgUrl !== "changed" ? snapshot.imgUrl : null;

    if (resolvedLid && resolvedJid && resolvedLid !== resolvedJid) {
      evidence.push({ type: "snapshot_links_lid_to_jid", weight: 45, value: resolvedJid });
    }
    if (phoneNumber) {
      evidence.push({ type: "phone_candidate_available", weight: 25, value: phoneNumber });
    }
    if (resolvedJid && jidToPhone(resolvedJid)) {
      evidence.push({ type: "phone_jid_available", weight: 20, value: resolvedJid });
    }
    if (snapshot && isUsefulName(snapshot.verifiedName)) {
      evidence.push({ type: "verified_name_from_contact_snapshot", weight: 20, value: cleanName(snapshot.verifiedName) });
    } else if (snapshot && isUsefulName(snapshot.name)) {
      evidence.push({ type: "name_from_contact_snapshot", weight: 15, value: cleanName(snapshot.name) });
    } else if (snapshot && isUsefulName(snapshot.notify)) {
      evidence.push({ type: "notify_name_from_contact_snapshot", weight: 10, value: cleanName(snapshot.notify) });
    }
    if (profilePicUrl) {
      evidence.push({ type: "profile_picture_from_contact_snapshot", weight: 10, value: profilePicUrl });
    }

    if (phoneNumber) {
      try {
        const verified = await this.sessionManager.verifyPhoneOnWhatsApp(accountId, phoneNumber);
        const verifiedJid = normalizeWhatsAppJid(verified.jid ?? null);
        if (verified.exists && verifiedJid) {
          resolvedJid = verifiedJid;
          phoneNumber = normalizePhoneNumber(jidToPhone(verifiedJid)) ?? phoneNumber;
          evidence.push({ type: "phone_verified_by_onwhatsapp", weight: 30, value: verifiedJid });
        } else {
          evidence.push({ type: "phone_not_verified_by_onwhatsapp", weight: -30, value: phoneNumber });
        }
      } catch (error) {
        evidence.push({ type: "onwhatsapp_verification_failed", weight: -10, value: error instanceof Error ? error.message : "unknown" });
      }
    }

    if (!profilePicUrl && resolvedJid) {
      try {
        const avatar = await this.sessionManager.fetchProfilePicture(accountId, resolvedJid);
        if (avatar.profilePicUrl) {
          profilePicUrl = avatar.profilePicUrl;
          evidence.push({ type: "profile_picture_fetched", weight: 10, value: avatar.profilePicUrl });
        }
      } catch (error) {
        evidence.push({ type: "profile_picture_fetch_failed", weight: 0, value: error instanceof Error ? error.message : "unknown" });
      }
    }

    if (input.displayName && !isUsefulName(input.displayName)) {
      evidence.push({ type: "existing_name_is_weak", weight: 0, value: input.displayName });
    }

    const confidenceScore = confidenceFromEvidence(evidence);

    return {
      accountId,
      contactId: input.contactId ?? null,
      resolved: confidenceScore >= 60,
      confidenceScore,
      normalizedJid: resolvedJid,
      lid: resolvedLid,
      phoneNumber,
      displayName,
      verifiedName: snapshot?.verifiedName ?? null,
      pushName: snapshot?.name ?? null,
      notifyName: snapshot?.notify ?? null,
      profilePicUrl,
      evidence,
      source: "connector_identity_resolver"
    };
  }
}
