import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Button } from "../components/Button";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import {
  clearOrganizationData,
  fetchClearOrganizationDataPreview,
  type ClearOrganizationDataCounts
} from "../api/admin";

export function ClearOrganizationDataPage() {
  const { isSuperAdmin, selectedOrganizationId, selectedOrganizationName } =
    useOutletContext<DashboardOutletContext>();

  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ClearOrganizationDataCounts | null>(null);

  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [confirmationText, setConfirmationText] = useState("");
  const [checked, setChecked] = useState(false);

  const expectedText = useMemo(() => {
    if (!selectedOrganizationName) return "";
    return `CLEAR ${selectedOrganizationName}`;
  }, [selectedOrganizationName]);

  useEffect(() => {
    if (!selectedOrganizationId) {
      setPreview(null);
      return;
    }

    setPreviewLoading(true);
    fetchClearOrganizationDataPreview(selectedOrganizationId)
      .then((data) => {
        setPreview(data.counts);
      })
      .catch(() => {
        setError("Failed to load preview data");
      })
      .finally(() => setPreviewLoading(false));
  }, [selectedOrganizationId]);

  if (!isSuperAdmin) {
    return <div className="p-6">Access denied</div>;
  }

  if (!selectedOrganizationId) {
    return <div className="p-6">Please select an organization from the sidebar.</div>;
  }

  const handleClear = async () => {
    if (!selectedOrganizationId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await clearOrganizationData(selectedOrganizationId, {
        confirmationText
      });

      alert("Organization data cleared successfully");
      setConfirmStep(0);
      setConfirmationText("");
      setChecked(false);

      const refreshed = await fetchClearOrganizationDataPreview(selectedOrganizationId);
      setPreview(refreshed.counts);
    } catch (err) {
      setError("Failed to clear data");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Clear Organization Data</h1>

      <div className="bg-yellow-100 p-4 text-sm">
        This will clear all CRM and WhatsApp data for the selected organization. Database structure and organization record will remain.
      </div>

      <div className="space-y-2">
        <div className="font-medium">Organization</div>
        <div>{selectedOrganizationName}</div>
      </div>

      <div>
        <div className="font-medium mb-2">Data Preview</div>
        {previewLoading && <div>Loading...</div>}
        {preview && (
          <ul className="text-sm space-y-1">
            {Object.entries(preview).map(([key, value]) => (
              <li key={key}>
                {key}: {value}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <Button onClick={() => setConfirmStep(1)}>Clear Organization Data</Button>
      </div>

      {confirmStep === 1 && (
        <div className="bg-white border p-4 space-y-3">
          <div className="font-medium">Are you sure?</div>
          <div className="text-sm">This action cannot be undone.</div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirmStep(0)}>
              Cancel
            </Button>
            <Button onClick={() => setConfirmStep(2)}>Continue</Button>
          </div>
        </div>
      )}

      {confirmStep === 2 && (
        <div className="bg-red-50 border p-4 space-y-3">
          <div className="font-medium">Final Confirmation</div>
          <div className="text-sm">Type: {expectedText}</div>
          <input
            className="border p-2 w-full"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
          />

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            I understand this is permanent
          </label>

          <Button
            disabled={confirmationText !== expectedText || !checked || loading}
            onClick={handleClear}
          >
            Confirm Clear
          </Button>
        </div>
      )}

      {error && <div className="text-red-600">{error}</div>}
    </div>
  );
}
