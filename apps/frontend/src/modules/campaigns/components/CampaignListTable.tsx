import { Button } from "../../../components/Button";
import type { Campaign } from "../types/campaign.types";
import { CampaignStatusBadge } from "./CampaignStatusBadge";

export function CampaignListTable({ campaigns, onAction }: { campaigns: Campaign[]; onAction: (message: string) => void }) {
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
                <Button size="sm" variant="ghost" onClick={() => onAction("Campaign details are placeholder-only in this phase.")}>
                  Review
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
