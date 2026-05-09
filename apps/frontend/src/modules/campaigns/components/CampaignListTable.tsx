import { Button } from "../../../components/Button";
import type { Campaign } from "../types/campaign.types";
import { CampaignStatusBadge } from "./CampaignStatusBadge";

export function CampaignListTable({
  campaigns,
  onAction,
  onPause,
  onResume,
  onCancel
}: {
  campaigns: Campaign[];
  onAction: (message: string) => void;
  onPause?: (campaign: Campaign) => void;
  onResume?: (campaign: Campaign) => void;
  onCancel?: (campaign: Campaign) => void;
}) {
  return (
    <div className="workspace-table-wrap">
      <table className="workspace-table workspace-table-compact">
        <thead>
          <tr>
            <th>Campaign Name</th>
            <th>Audience</th>
            <th>Status</th>
            <th>Recipients</th>
            <th>Sent</th>
            <th>Failed</th>
            <th>Replied</th>
            <th>Created At</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => (
            <tr key={campaign.id} className="table-row">
              <td className="font-semibold text-text">{campaign.name}</td>
              <td className="text-text-muted">{campaign.audience}</td>
              <td><CampaignStatusBadge status={campaign.status} /></td>
              <td>{campaign.recipients.toLocaleString()}</td>
              <td>{campaign.sent.toLocaleString()}</td>
              <td>{campaign.failed.toLocaleString()}</td>
              <td>{campaign.replied.toLocaleString()}</td>
              <td>{campaign.createdAt}</td>
              <td>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={() => onAction("Campaign progress is shown in the table.")}>
                    Review
                  </Button>
                  {campaign.status === "Sending" && onPause ? (
                    <Button size="sm" variant="secondary" onClick={() => onPause(campaign)}>
                      Pause
                    </Button>
                  ) : null}
                  {campaign.status === "Paused" && onResume ? (
                    <Button size="sm" variant="secondary" onClick={() => onResume(campaign)}>
                      Resume
                    </Button>
                  ) : null}
                  {["Draft", "Scheduled", "Sending", "Paused", "Failed"].includes(campaign.status) && onCancel ? (
                    <Button size="sm" variant="ghost" onClick={() => onCancel(campaign)}>
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
