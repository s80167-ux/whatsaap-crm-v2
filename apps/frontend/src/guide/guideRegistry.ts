import type { GuideRegistry } from "./types";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function getEmailGuideIdFromActiveTab(activeTab: string) {
  switch (activeTab) {
    case "templates":
      return "email.templates";
    case "audience":
      return "email.audience";
    case "senderSetup":
      return "email.senders";
    case "reports":
      return "email.reports";
    case "suppressionList":
    case "compliance":
    case "history":
      return "email.settings";
    case "overview":
    case "create":
    default:
      return "email.campaigns";
  }
}

export function createEmailGuideRegistry(t: Translate): GuideRegistry {
  return {
    "email.campaigns": {
      id: "email.campaigns",
      label: t("campaign.emailGuides.campaigns.label"),
      page: "campaigns",
      steps: [
        {
          id: "command-center",
          title: t("campaign.emailGuides.campaigns.steps.commandCenter.title"),
          description: t("campaign.emailGuides.campaigns.steps.commandCenter.description"),
          target: '[data-guide="email-command-center"]',
          placement: "bottom"
        },
        {
          id: "new-draft",
          title: t("campaign.emailGuides.campaigns.steps.newDraft.title"),
          description: t("campaign.emailGuides.campaigns.steps.newDraft.description"),
          target: '[data-guide="email-new-draft"]',
          placement: "bottom-start"
        },
        {
          id: "draft-fields",
          title: t("campaign.emailGuides.campaigns.steps.draftFields.title"),
          description: t("campaign.emailGuides.campaigns.steps.draftFields.description"),
          target: '[data-guide="email-draft-fields"]',
          placement: "right-start",
          optional: true
        },
        {
          id: "launch-readiness",
          title: t("campaign.emailGuides.campaigns.steps.launchReadiness.title"),
          description: t("campaign.emailGuides.campaigns.steps.launchReadiness.description"),
          target: '[data-guide="email-launch-readiness"]',
          placement: "left-start",
          optional: true
        }
      ]
    },
    "email.audience": {
      id: "email.audience",
      label: t("campaign.emailGuides.audience.label"),
      page: "audience",
      steps: [
        {
          id: "audience-list",
          title: t("campaign.emailGuides.audience.steps.list.title"),
          description: t("campaign.emailGuides.audience.steps.list.description"),
          target: '[data-guide="email-audience-list"]',
          placement: "bottom"
        },
        {
          id: "import-audience",
          title: t("campaign.emailGuides.audience.steps.import.title"),
          description: t("campaign.emailGuides.audience.steps.import.description"),
          target: '[data-guide="email-import-audience"]',
          placement: "right"
        },
        {
          id: "audience-quality",
          title: t("campaign.emailGuides.audience.steps.quality.title"),
          description: t("campaign.emailGuides.audience.steps.quality.description"),
          target: '[data-guide="email-audience-quality"]',
          placement: "top"
        }
      ]
    },
    "email.senders": {
      id: "email.senders",
      label: t("campaign.emailGuides.senders.label"),
      page: "senders",
      steps: [
        {
          id: "sender-list",
          title: t("campaign.emailGuides.senders.steps.list.title"),
          description: t("campaign.emailGuides.senders.steps.list.description"),
          target: '[data-guide="email-sender-list"]',
          placement: "bottom"
        },
        {
          id: "add-sender",
          title: t("campaign.emailGuides.senders.steps.add.title"),
          description: t("campaign.emailGuides.senders.steps.add.description"),
          target: '[data-guide="email-add-sender"]',
          placement: "right"
        },
        {
          id: "sender-status",
          title: t("campaign.emailGuides.senders.steps.status.title"),
          description: t("campaign.emailGuides.senders.steps.status.description"),
          target: '[data-guide="email-sender-status"]',
          placement: "left"
        }
      ]
    },
    "email.templates": {
      id: "email.templates",
      label: t("campaign.emailGuides.templates.label"),
      page: "templates",
      steps: [
        {
          id: "template-library",
          title: t("campaign.emailGuides.templates.steps.library.title"),
          description: t("campaign.emailGuides.templates.steps.library.description"),
          target: '[data-guide="email-template-library"]',
          placement: "bottom"
        },
        {
          id: "create-template",
          title: t("campaign.emailGuides.templates.steps.create.title"),
          description: t("campaign.emailGuides.templates.steps.create.description"),
          target: '[data-guide="email-create-template"]',
          placement: "right"
        }
      ]
    },
    "email.reports": {
      id: "email.reports",
      label: t("campaign.emailGuides.reports.label"),
      page: "reports",
      steps: [
        {
          id: "report-summary",
          title: t("campaign.emailGuides.reports.steps.summary.title"),
          description: t("campaign.emailGuides.reports.steps.summary.description"),
          target: '[data-guide="email-report-summary"]',
          placement: "bottom"
        },
        {
          id: "campaign-history",
          title: t("campaign.emailGuides.reports.steps.history.title"),
          description: t("campaign.emailGuides.reports.steps.history.description"),
          target: '[data-guide="email-campaign-history"]',
          placement: "top"
        }
      ]
    },
    "email.settings": {
      id: "email.settings",
      label: t("campaign.emailGuides.settings.label"),
      page: "settings",
      steps: [
        {
          id: "settings-tab",
          title: t("campaign.emailGuides.settings.steps.tab.title"),
          description: t("campaign.emailGuides.settings.steps.tab.description"),
          target: '[data-guide="email-settings"]',
          placement: "bottom"
        },
        {
          id: "settings-panel",
          title: t("campaign.emailGuides.settings.steps.panel.title"),
          description: t("campaign.emailGuides.settings.steps.panel.description"),
          target: '[data-guide="email-settings-panel"]',
          placement: "bottom"
        },
        {
          id: "settings-action",
          title: t("campaign.emailGuides.settings.steps.action.title"),
          description: t("campaign.emailGuides.settings.steps.action.description"),
          target: '[data-guide="email-settings-action"]',
          placement: "left"
        }
      ]
    }
  };
}