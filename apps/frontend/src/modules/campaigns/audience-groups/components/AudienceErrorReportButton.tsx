import { Download } from "lucide-react";
import { Button } from "../../../../components/Button";
import type { AudienceValidationResult } from "../types/audienceGroup.types";
import { buildAudienceErrorReport } from "../utils/audienceCsvValidation";

type AudienceErrorReportButtonProps = {
  result: AudienceValidationResult | null;
};

export function AudienceErrorReportButton({ result }: AudienceErrorReportButtonProps) {
  const hasReport = Boolean(
    result?.contacts.some((contact) => contact.validation_status === "invalid" || contact.warnings.length > 0)
  );

  function downloadReport() {
    if (!result) {
      return;
    }

    const blob = new Blob([buildAudienceErrorReport(result)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "audience-group-error-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="secondary" onClick={downloadReport} disabled={!hasReport}>
      <Download size={16} />
      Download Error Report
    </Button>
  );
}
