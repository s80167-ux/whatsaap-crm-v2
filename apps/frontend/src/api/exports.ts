import { clearAuthSession } from "../lib/auth";
import { config } from "../lib/config";

export type ExportDataset = "contacts" | "conversations" | "messages" | "sales" | "campaigns";

export type ExportFilters = {
  organizationId?: string | null;
  createdFrom?: string;
  createdTo?: string;
  whatsappAccountId?: string;
  assignedUserId?: string;
};

function buildExportQuery(filters: ExportFilters) {
  const searchParams = new URLSearchParams();

  if (filters.organizationId) {
    searchParams.set("organization_id", filters.organizationId);
  }

  if (filters.createdFrom) {
    searchParams.set("created_from", filters.createdFrom);
  }

  if (filters.createdTo) {
    searchParams.set("created_to", filters.createdTo);
  }

  if (filters.whatsappAccountId) {
    searchParams.set("whatsapp_account_id", filters.whatsappAccountId);
  }

  if (filters.assignedUserId) {
    searchParams.set("assigned_user_id", filters.assignedUserId);
  }

  return searchParams.size > 0 ? `?${searchParams.toString()}` : "";
}

function getFilename(response: Response, dataset: ExportDataset) {
  const disposition = response.headers.get("content-disposition");
  const match = disposition?.match(/filename="([^"]+)"/i);

  if (match?.[1]) {
    return match[1];
  }

  return `${dataset}-${new Date().toISOString().slice(0, 10)}.csv`;
}

export async function downloadDataExport(dataset: ExportDataset, filters: ExportFilters) {
  const response = await fetch(`${config.apiBaseUrl}/exports/${dataset}${buildExportQuery(filters)}`, {
    credentials: "include",
    cache: "no-store"
  });

  if (response.status === 401) {
    clearAuthSession();
  }

  if (!response.ok) {
    let message = `Export failed with status ${response.status}`;

    try {
      const body = await response.json();

      if (typeof body === "object" && body && "error" in body && typeof body.error === "string") {
        message = body.error;
      }
    } catch {
      // Keep the status-based message.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = getFilename(response, dataset);
  anchor.click();
  URL.revokeObjectURL(url);

  return {
    rowCount: Number(response.headers.get("x-export-row-count") ?? "0")
  };
}
