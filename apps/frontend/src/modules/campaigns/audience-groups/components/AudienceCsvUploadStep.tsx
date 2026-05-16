import { Download, FileUp } from "lucide-react";
import { Button } from "../../../../components/Button";
import { buildAudienceSampleCsv } from "../utils/audienceCsvValidation";

type AudienceCsvUploadStepProps = {
  fileName: string | null;
  onCsvLoaded: (fileName: string, content: string) => void;
};

export function AudienceCsvUploadStep({ fileName, onCsvLoaded }: AudienceCsvUploadStepProps) {
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onCsvLoaded(file.name, reader.result);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function downloadSample() {
    const blob = new Blob([buildAudienceSampleCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "audience-group-sample.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="border border-dashed border-border bg-background-tint p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-text">Upload CSV file</p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              Accepted columns: name, phone, gender, tag, location, product_interest, customer_type, notes.
            </p>
            {fileName ? <p className="mt-2 text-xs font-semibold text-primary">{fileName}</p> : null}
          </div>
          <label className="inline-flex min-h-[2.625rem] cursor-pointer items-center justify-center gap-2 bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary-dark">
            <FileUp size={16} />
            Upload CSV
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFileChange} />
          </label>
        </div>
      </div>
      <Button variant="secondary" onClick={downloadSample}>
        <Download size={16} />
        Download Sample CSV
      </Button>
    </div>
  );
}
