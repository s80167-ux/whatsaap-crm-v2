import { CheckCircle2 } from "lucide-react";
import { Button } from "../../../../components/Button";
import { PopupOverlay } from "../../../../components/PopupOverlay";
import type { AudienceGroup, AudienceValidationResult } from "../types/audienceGroup.types";
import { AudienceErrorReportButton } from "./AudienceErrorReportButton";

type AudienceImportSuccessModalProps = {
  open: boolean;
  group: AudienceGroup | null;
  result: AudienceValidationResult | null;
  onClose: () => void;
  onViewGroup: () => void;
  onPhaseTwoNotice: () => void;
};

export function AudienceImportSuccessModal({
  open,
  group,
  result,
  onClose,
  onViewGroup,
  onPhaseTwoNotice
}: AudienceImportSuccessModalProps) {
  return (
    <PopupOverlay
      open={open}
      onClose={onClose}
      title="Audience Group Created"
      description="Your recipient list has been validated and imported for campaign planning."
      panelClassName="max-w-[min(34rem,calc(100vw-2rem))]"
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-emerald-600">
            <CheckCircle2 size={24} />
          </span>
          <div>
            <p className="text-base font-semibold text-text">{group?.name ?? "Audience Group"}</p>
            <p className="mt-1 text-sm text-text-muted">Ready for Phase 2 campaign creation.</p>
          </div>
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <Detail label="Total rows uploaded" value={result?.totalRows ?? group?.total_rows ?? 0} />
          <Detail label="Valid contacts imported" value={result?.validContacts ?? group?.valid_count ?? 0} />
          <Detail label="Invalid contacts skipped" value={result?.invalidContacts ?? group?.invalid_count ?? 0} />
          <Detail label="Duplicates skipped" value={result?.duplicatesInCsv ?? group?.duplicate_count ?? 0} />
          <Detail label="Opt-out contacts blocked" value={result?.optOutBlocked ?? group?.opt_out_count ?? 0} />
          <Detail label="Linked CRM contacts" value={result?.linkedCrmContacts ?? group?.linked_crm_count ?? 0} />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={onViewGroup}>View Audience Group</Button>
          <Button variant="secondary" onClick={onPhaseTwoNotice} disabled>
            Create Campaign
          </Button>
        </div>

        <AudienceErrorReportButton result={result} />
      </div>
    </PopupOverlay>
  );
}

function Detail({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border bg-background-tint p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-text">{value}</p>
    </div>
  );
}
