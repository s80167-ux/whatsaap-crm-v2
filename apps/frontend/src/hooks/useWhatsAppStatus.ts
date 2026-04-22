import { WhatsAppStatus } from "../components/WhatsAppStatusBadge";
import { useWhatsAppAccounts } from "./useAdmin";
import { getStoredUser } from "../lib/auth";

// Returns the status of the first WhatsApp account for the current user's organization
export function useWhatsAppStatus(): WhatsAppStatus {
  const user = getStoredUser();
  const organizationId = user?.organizationId ?? null;
  const { data: accounts = [] } = useWhatsAppAccounts(organizationId);

  if (!accounts.length) return "disconnected";

  // Find the first account with a status
  const status = accounts[0]?.status?.toLowerCase();
  if (status === "connected") return "connected";
  if (status === "connecting" || status === "initializing") return "connecting";
  return "disconnected";
}
