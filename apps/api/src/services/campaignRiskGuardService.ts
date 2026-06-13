import { query, withTransaction } from "../config/database.js";
import { AppError } from "../lib/errors.js";
import { resolveCampaignTempo, type CampaignSpeedPreset } from "../modules/campaigns/campaignTempo.js";
import { CampaignSafetyService } from "./campaignSafetyService.js";

type RiskLevel = "low" | "medium" | "high";
type SenderHealthStatus = "Good" | "Caution" | "Risky" | "Cooling Down";
type UserDecision = "pending" | "applied_suggestions" | "partially_applied" | "ignored_warning" | "saved_as_draft";

type CampaignRow = {
  id: string;
  organization_id: string;
  name: string;
  audience_group_id: string | null;
  sender_whatsapp_account_id: string | null;
  message_template: string | null;
  speed_preset: CampaignSpeedPreset | null;
  delay_per_message_seconds: number | null;
  batch_size: number | null;
  batch_pause_seconds: number | null;
  daily_limit: number | null;
  stop_on_high_failure: boolean | null;
  selected_message_template_id: string | null;
};

type AudienceGroupRow = {
  id: string;
  name: string;
  total_rows: number;
  valid_count: number;
  invalid_count: number;
  duplicate_count: number;
  opt_out_count: number;
  suppressed_count: number;
  source_type: string | null;
  permission_status: string;
  risk_level: RiskLevel;
};

type SenderStatsRow = {
  sender_count: string;
  sent_today: string;
  failed_recently: string;
  opt_out_replies_recently: string;
  disconnected_recently: string;
  avg_health_score: string | null;
  low_health_count: string;
  new_sender_count: string;
  disconnected_now_count: string;
};

type ReviewRecord = {
  id: string;
  user_decision: UserDecision;
  audience_risk_snapshot: unknown;
  template_risk_snapshot: unknown;
  sender_risk_snapshot: unknown;
  tempo_risk_snapshot: unknown;
  overall_risk_level: RiskLevel;
  detected_issues_json: unknown;
  suggested_actions_json: unknown;
};

const SAFER_OPT_OUT_LINE = "Balas STOP jika tidak mahu terima mesej promosi lagi.";

export class CampaignRiskGuardService {
  async generateReview(input: {
    organizationId: string;
    campaignId: string;
    reviewedBy?: string | null;
    existingDecision?: UserDecision;
  }) {
    const campaign = await findCampaign(input.organizationId, input.campaignId);
    if (!campaign) {
      throw new AppError("Campaign not found", 404, "campaign_not_found");
    }

    const audience = campaign.audience_group_id
      ? await findAudienceGroup(input.organizationId, campaign.audience_group_id)
      : null;

    const messageTemplate = campaign.message_template?.trim() ?? "";
    const contentRisk = CampaignSafetyService.checkContentRisk({ message: messageTemplate });
    const senderStats = await getSenderStats(input.organizationId, input.campaignId);
    const audienceSnapshot = buildAudienceSnapshot(audience);
    const templateSnapshot = buildTemplateSnapshot(messageTemplate, contentRisk);
    const senderSnapshot = buildSenderSnapshot(senderStats);
    const tempoSnapshot = buildTempoSnapshot({
      audienceRiskLevel: audienceSnapshot.riskLevel,
      permissionStatus: audienceSnapshot.permissionStatus,
      senderHealth: senderSnapshot.senderHealth,
      tempo: resolveCampaignTempo({
        speedPreset: campaign.speed_preset ?? undefined,
        delayPerMessageSeconds: campaign.delay_per_message_seconds ?? undefined,
        batchSize: campaign.batch_size ?? undefined,
        batchPauseSeconds: campaign.batch_pause_seconds ?? undefined,
        dailyLimit: campaign.daily_limit ?? undefined,
        stopOnHighFailure: campaign.stop_on_high_failure ?? undefined
      })
    });

    const overallRiskLevel = maxRiskLevel([
      audienceSnapshot.riskLevel,
      templateSnapshot.riskLevel,
      senderSnapshot.senderHealth === "Good" ? "low" : senderSnapshot.senderHealth === "Caution" ? "medium" : "high",
      tempoSnapshot.riskLevel
    ]);

    const detectedIssues = [
      ...audienceSnapshot.detectedIssues,
      ...templateSnapshot.issues,
      ...senderSnapshot.reasons,
      ...tempoSnapshot.warnings
    ];

    const suggestedActions = dedupeStrings([
      ...templateSnapshot.suggestions,
      ...tempoSnapshot.suggestedActions,
      audienceSnapshot.suggestedAction,
      senderSnapshot.recommendedMode === "Safe Start Mode"
        ? "Start with a smaller test batch while sender health is still warming up."
        : senderSnapshot.recommendedMode === "Conservative sending"
          ? "Use a more conservative sending pace for this sender."
          : null,
      audienceSnapshot.suppressedRows > 0 ? "Exclude previously suppressed numbers from sending." : null,
      audienceSnapshot.invalidRows > 0 ? "Exclude invalid numbers from sending." : null
    ]);

    const recommendedChanges = buildRecommendedChanges({
      audience: audienceSnapshot,
      template: templateSnapshot,
      tempo: tempoSnapshot
    });

    const review = await withTransaction(async (client) => {
      const inserted = await client.query<ReviewRecord>(
        `
          insert into campaign_safety_reviews (
            organization_id,
            campaign_id,
            audience_risk_snapshot,
            template_risk_snapshot,
            sender_risk_snapshot,
            tempo_risk_snapshot,
            overall_risk_level,
            detected_issues_json,
            suggested_actions_json,
            user_decision,
            reviewed_by,
            reviewed_at
          )
          values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10, $11, $12)
          returning *
        `,
        [
          input.organizationId,
          input.campaignId,
          JSON.stringify(audienceSnapshot),
          JSON.stringify(templateSnapshot),
          JSON.stringify(senderSnapshot),
          JSON.stringify(tempoSnapshot),
          overallRiskLevel,
          JSON.stringify(detectedIssues),
          JSON.stringify(suggestedActions),
          input.existingDecision ?? "pending",
          input.reviewedBy ?? null,
          input.reviewedBy ? new Date().toISOString() : null
        ]
      );

      await client.query(
        `
          update campaigns
          set active_safety_review_id = $3,
              updated_at = timezone('utc', now())
          where organization_id = $1
            and id = $2
        `,
        [input.organizationId, input.campaignId, inserted.rows[0].id]
      );

      return inserted.rows[0];
    });

    return {
      reviewId: review.id,
      overallRiskLevel,
      audience: audienceSnapshot,
      template: templateSnapshot,
      sender: senderSnapshot,
      tempo: tempoSnapshot,
      detectedIssues,
      suggestedActions,
      recommendedChanges,
      userDecision: review.user_decision,
      overridePreviewBody: templateSnapshot.suggestedOverrideBody
    };
  }

  async applySuggestedChanges(input: {
    organizationId: string;
    campaignId: string;
    reviewId: string;
    applyTempo: boolean;
    applyMessageOverride: boolean;
    approvedBy?: string | null;
    decision: UserDecision;
  }) {
    const campaign = await findCampaign(input.organizationId, input.campaignId);
    if (!campaign) {
      throw new AppError("Campaign not found", 404, "campaign_not_found");
    }

    const review = await findReview(input.organizationId, input.campaignId, input.reviewId);
    if (!review) {
      throw new AppError("Campaign safety review not found", 404, "campaign_safety_review_not_found");
    }

    const tempoSnapshot = parseJson<Record<string, unknown>>(review.tempo_risk_snapshot);
    const templateSnapshot = parseJson<Record<string, unknown>>(review.template_risk_snapshot);
    const suggestedTempo = tempoSnapshot?.suggested as Record<string, unknown> | undefined;
    const suggestedOverrideBody = typeof templateSnapshot?.suggestedOverrideBody === "string"
      ? templateSnapshot.suggestedOverrideBody
      : null;

    await withTransaction(async (client) => {
      if (input.applyTempo && suggestedTempo) {
        await client.query(
          `
            update campaigns
            set speed_preset = $3,
                delay_per_message_seconds = $4,
                batch_size = $5,
                batch_pause_seconds = $6,
                daily_limit = $7,
                updated_at = timezone('utc', now())
            where organization_id = $1
              and id = $2
          `,
          [
            input.organizationId,
            input.campaignId,
            String(suggestedTempo.speedPreset ?? "safe"),
            Number(suggestedTempo.delayPerMessageSeconds ?? campaign.delay_per_message_seconds ?? 22),
            Number(suggestedTempo.batchSize ?? campaign.batch_size ?? 12),
            Number(suggestedTempo.batchPauseSeconds ?? campaign.batch_pause_seconds ?? 300),
            Number(suggestedTempo.dailyLimit ?? campaign.daily_limit ?? 150)
          ]
        );
      }

      let overrideId: string | null = null;
      if (input.applyMessageOverride && suggestedOverrideBody && campaign.message_template?.trim()) {
        const result = await client.query<{ id: string }>(
          `
            insert into campaign_message_overrides (
              organization_id,
              campaign_id,
              template_id,
              original_body,
              override_body,
              created_from_suggestion,
              approved_by,
              approved_at
            )
            values ($1, $2, $3, $4, $5, true, $6, timezone('utc', now()))
            on conflict (campaign_id)
            do update set
              original_body = excluded.original_body,
              override_body = excluded.override_body,
              created_from_suggestion = true,
              approved_by = excluded.approved_by,
              approved_at = excluded.approved_at
            returning id
          `,
          [
            input.organizationId,
            input.campaignId,
            campaign.selected_message_template_id,
            campaign.message_template,
            suggestedOverrideBody,
            input.approvedBy ?? null
          ]
        );
        overrideId = result.rows[0]?.id ?? null;
      }

      await client.query(
        `
          update campaign_safety_reviews
          set user_decision = $4,
              reviewed_by = $5,
              reviewed_at = timezone('utc', now())
          where organization_id = $1
            and campaign_id = $2
            and id = $3
        `,
        [input.organizationId, input.campaignId, input.reviewId, input.decision, input.approvedBy ?? null]
      );

      if (overrideId) {
        await client.query(
          `
            update campaigns
            set active_message_override_id = $3,
                active_safety_review_id = $4,
                updated_at = timezone('utc', now())
            where organization_id = $1
              and id = $2
          `,
          [input.organizationId, input.campaignId, overrideId, input.reviewId]
        );
      } else {
        await client.query(
          `
            update campaigns
            set active_safety_review_id = $3,
                updated_at = timezone('utc', now())
            where organization_id = $1
              and id = $2
          `,
          [input.organizationId, input.campaignId, input.reviewId]
        );
      }
    });

    return this.generateReview({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      reviewedBy: input.approvedBy ?? null,
      existingDecision: input.decision
    });
  }

  async getEffectiveMessageBody(organizationId: string, campaignId: string, fallbackBody: string | null) {
    const result = await query<{ override_body: string | null }>(
      `
        select cmo.override_body
        from campaigns c
        join campaign_message_overrides cmo
          on cmo.id = c.active_message_override_id
        where c.organization_id = $1
          and c.id = $2
        limit 1
      `,
      [organizationId, campaignId]
    );

    return result.rows[0]?.override_body?.trim() || fallbackBody;
  }
}

async function findCampaign(organizationId: string, campaignId: string) {
  const result = await query<CampaignRow>(
    `
      select *
      from campaigns
      where organization_id = $1
        and id = $2
      limit 1
    `,
    [organizationId, campaignId]
  );

  return result.rows[0] ?? null;
}

async function findAudienceGroup(organizationId: string, audienceGroupId: string) {
  const result = await query<AudienceGroupRow>(
    `
      select
        id,
        name,
        total_rows,
        valid_count,
        invalid_count,
        duplicate_count,
        opt_out_count,
        suppressed_count,
        source_type,
        permission_status,
        risk_level
      from campaign_audience_groups
      where organization_id = $1
        and id = $2
      limit 1
    `,
    [organizationId, audienceGroupId]
  );

  return result.rows[0] ?? null;
}

async function getSenderStats(organizationId: string, campaignId: string) {
  const result = await query<SenderStatsRow>(
    `
      with selected_senders as (
        select csa.whatsapp_account_id
        from campaign_sender_accounts csa
        where csa.organization_id = $1
          and csa.campaign_id = $2
          and csa.is_enabled = true
        union
        select c.sender_whatsapp_account_id
        from campaigns c
        where c.organization_id = $1
          and c.id = $2
          and c.sender_whatsapp_account_id is not null
      )
      select
        count(distinct wa.id)::text as sender_count,
        count(cr.id) filter (
          where cr.sent_at >= date_trunc('day', timezone('utc', now()))
        )::text as sent_today,
        count(cr.id) filter (
          where cr.failed_at >= timezone('utc', now()) - interval '7 days'
        )::text as failed_recently,
        count(cr.id) filter (
          where cr.opt_out_detected = true
            and coalesce(cr.replied_at, cr.created_at) >= timezone('utc', now()) - interval '14 days'
        )::text as opt_out_replies_recently,
        count(*) filter (
          where lower(coalesce(wa.connection_status, 'disconnected')) in ('disconnected', 'logged_out', 'reconnect_suppressed', 'session_unavailable')
        )::text as disconnected_recently,
        avg(wa.health_score)::text as avg_health_score,
        count(*) filter (where coalesce(wa.health_score, 50) < 35)::text as low_health_count,
        count(*) filter (
          where wa.warmup_started_at is null
             or wa.warmup_started_at >= timezone('utc', now()) - interval '7 days'
        )::text as new_sender_count,
        count(*) filter (
          where lower(coalesce(wa.connection_status, 'disconnected')) not in ('connected', 'open', 'ready')
        )::text as disconnected_now_count
      from selected_senders ss
      join whatsapp_accounts wa
        on wa.organization_id = $1
       and wa.id = ss.whatsapp_account_id
      left join campaign_recipients cr
        on cr.organization_id = $1
       and cr.campaign_id = $2
       and cr.assigned_whatsapp_account_id = wa.id
    `,
    [organizationId, campaignId]
  );

  return result.rows[0] ?? {
    sender_count: "0",
    sent_today: "0",
    failed_recently: "0",
    opt_out_replies_recently: "0",
    disconnected_recently: "0",
    avg_health_score: "0",
    low_health_count: "0",
    new_sender_count: "0",
    disconnected_now_count: "0"
  };
}

async function findReview(organizationId: string, campaignId: string, reviewId: string) {
  const result = await query<ReviewRecord>(
    `
      select *
      from campaign_safety_reviews
      where organization_id = $1
        and campaign_id = $2
        and id = $3
      limit 1
    `,
    [organizationId, campaignId, reviewId]
  );

  return result.rows[0] ?? null;
}

function buildAudienceSnapshot(group: AudienceGroupRow | null) {
  const permissionStatus = group?.permission_status ?? "not_verified_by_system";
  const sourceType = group?.source_type ?? null;
  const riskLevel = group?.risk_level ?? inferAudienceRiskLevel(sourceType);
  const invalidRows = Number(group?.invalid_count ?? 0);
  const duplicateRows = Number(group?.duplicate_count ?? 0);
  const suppressedRows = Number(group?.suppressed_count ?? group?.opt_out_count ?? 0);

  return {
    audienceGroupId: group?.id ?? null,
    permissionStatus,
    sourceType,
    riskLevel,
    totalRows: Number(group?.total_rows ?? 0),
    validRows: Number(group?.valid_count ?? 0),
    duplicateRows,
    invalidRows,
    suppressedRows,
    detectedIssues: dedupeStrings([
      permissionStatus === "not_verified_by_system" ? "Permission not verified by system." : null,
      sourceType === "cold_public_list" ? "Audience source is cold / public list." : null,
      sourceType === "not_sure" ? "Audience source was marked as not sure." : null,
      suppressedRows > 0 ? `${suppressedRows} previously suppressed contact${suppressedRows === 1 ? "" : "s"} will be excluded.` : null,
      invalidRows > 0 ? `${invalidRows} invalid number${invalidRows === 1 ? "" : "s"} will be excluded.` : null,
      duplicateRows > 0 ? `${duplicateRows} duplicate row${duplicateRows === 1 ? "" : "s"} will be excluded.` : null
    ]),
    suggestedAction:
      permissionStatus === "not_verified_by_system"
        ? "Please confirm the audience source so we can recommend safer campaign settings."
        : null
  };
}

function buildTemplateSnapshot(messageTemplate: string, contentRisk: ReturnType<typeof CampaignSafetyService.checkContentRisk>) {
  const issues = dedupeStrings([
    !contentRisk.has_opt_out_text ? "No opt-out line detected." : null,
    contentRisk.link_count > 1 ? `${contentRisk.link_count} links detected.` : null,
    contentRisk.message_length > 700 ? "Message is quite long for a first outreach." : null,
    (contentRisk.emoji_count ?? 0) > 6 ? "Message uses many emoji characters." : null,
    (contentRisk.uppercase_ratio ?? 0) > 0.35 ? "Message uses a high amount of uppercase text." : null,
    ...contentRisk.warnings,
    ...(contentRisk.variable_errors ?? []).map((issue) => `Variable issue: ${issue}`)
  ]);

  const riskLevel: RiskLevel =
    contentRisk.spam_risk_level === "critical" || contentRisk.spam_risk_level === "high"
      ? "high"
      : contentRisk.spam_risk_level === "medium"
        ? "medium"
        : issues.length > 0
          ? "medium"
          : "low";

  const suggestedOverrideBody = !contentRisk.has_opt_out_text && messageTemplate.trim()
    ? `${messageTemplate.trim()}\n\n${SAFER_OPT_OUT_LINE}`
    : null;

  return {
    riskLevel,
    statusLabel:
      riskLevel === "low"
        ? "Template Safety: Good"
        : riskLevel === "medium"
          ? "Template Safety: Needs Review"
          : "Template Safety: High Risk",
    issues,
    suggestions: dedupeStrings([
      ...contentRisk.suggestions,
      contentRisk.link_count > 1 ? "Reduce the number of links in the campaign message." : null,
      contentRisk.message_length > 700 ? "Shorten the message so the first contact feels lighter." : null,
      contentRisk.variable_errors.length > 0 ? "Fix missing or broken dynamic variables." : null
    ]),
    metrics: {
      hasOptOutLine: contentRisk.has_opt_out_text,
      messageLength: contentRisk.message_length,
      linkCount: contentRisk.link_count,
      emojiCount: contentRisk.emoji_count ?? 0,
      uppercaseRatio: contentRisk.uppercase_ratio ?? 0,
      variableIssues: contentRisk.variable_errors
    },
    suggestedOverrideBody
  };
}

function buildSenderSnapshot(stats: SenderStatsRow) {
  const senderCount = Number(stats.sender_count ?? 0);
  const sentToday = Number(stats.sent_today ?? 0);
  const failedRecently = Number(stats.failed_recently ?? 0);
  const optOutRepliesRecently = Number(stats.opt_out_replies_recently ?? 0);
  const disconnectedRecently = Number(stats.disconnected_recently ?? 0);
  const avgHealthScore = Number(stats.avg_health_score ?? 0);
  const lowHealthCount = Number(stats.low_health_count ?? 0);
  const newSenderCount = Number(stats.new_sender_count ?? 0);
  const disconnectedNowCount = Number(stats.disconnected_now_count ?? 0);

  let senderHealth: SenderHealthStatus = "Good";
  if (disconnectedNowCount > 0) {
    senderHealth = "Cooling Down";
  } else if (failedRecently >= 10 || optOutRepliesRecently >= 5 || lowHealthCount > 0 || avgHealthScore < 35) {
    senderHealth = "Risky";
  } else if (newSenderCount > 0 || failedRecently > 0 || avgHealthScore < 65) {
    senderHealth = "Caution";
  }

  return {
    senderHealth,
    senderCount,
    sentToday,
    failedRecently,
    optOutRepliesRecently,
    disconnectedRecently,
    reasons: dedupeStrings([
      disconnectedNowCount > 0 ? "One or more selected senders are not fully connected." : null,
      newSenderCount > 0 ? "Selected sender includes a new or recently connected number." : null,
      failedRecently > 0 ? `${failedRecently} recent failed send${failedRecently === 1 ? "" : "s"} detected.` : null,
      optOutRepliesRecently > 0 ? `${optOutRepliesRecently} recent opt-out repl${optOutRepliesRecently === 1 ? "y" : "ies"} detected.` : null
    ]),
    recommendedMode:
      senderHealth === "Cooling Down" || senderHealth === "Risky"
        ? "Safe Start Mode"
        : senderHealth === "Caution"
          ? "Conservative sending"
          : "Normal sending"
  };
}

function buildTempoSnapshot(input: {
  audienceRiskLevel: RiskLevel;
  permissionStatus: string;
  senderHealth: SenderHealthStatus;
  tempo: ReturnType<typeof resolveCampaignTempo>;
}) {
  const suggestedPreset = pickSuggestedTempoPreset(input.audienceRiskLevel, input.senderHealth, input.permissionStatus);
  const suggestedTempo = resolveCampaignTempo({ speedPreset: suggestedPreset });
  const aggressive =
    input.tempo.batchSize > suggestedTempo.batchSize
    || input.tempo.delayPerMessageSeconds < suggestedTempo.delayPerMessageSeconds
    || input.tempo.dailyLimit > suggestedTempo.dailyLimit;

  const riskLevel: RiskLevel =
    input.audienceRiskLevel === "high" && aggressive
      ? "high"
      : input.senderHealth === "Risky" || input.senderHealth === "Cooling Down"
        ? "high"
        : aggressive
          ? "medium"
          : "low";

  return {
    riskLevel,
    aggressive,
    current: {
      batchSize: input.tempo.batchSize,
      delayPerMessageSeconds: input.tempo.delayPerMessageSeconds,
      batchPauseSeconds: input.tempo.batchPauseSeconds,
      dailyLimit: input.tempo.dailyLimit
    },
    suggested: {
      batchSize: suggestedTempo.batchSize,
      delayPerMessageSeconds: suggestedTempo.delayPerMessageSeconds,
      batchPauseSeconds: suggestedTempo.batchPauseSeconds,
      dailyLimit: suggestedTempo.dailyLimit,
      speedPreset: suggestedTempo.speedPreset
    },
    recommendedTestBatchSize: input.audienceRiskLevel === "high" ? 50 : input.audienceRiskLevel === "medium" ? 100 : 150,
    warnings: dedupeStrings([
      aggressive && input.permissionStatus === "not_verified_by_system"
        ? "This tempo is aggressive for an uploaded audience with permission not verified by the system."
        : null,
      aggressive ? "Current batch and delay settings are faster than the safer recommendation." : null
    ]),
    suggestedActions: dedupeStrings([
      aggressive ? "Reduce batch size and increase delay between messages." : null,
      "Start with a smaller test batch before full sending."
    ])
  };
}

function buildRecommendedChanges(input: {
  audience: ReturnType<typeof buildAudienceSnapshot>;
  template: ReturnType<typeof buildTemplateSnapshot>;
  tempo: ReturnType<typeof buildTempoSnapshot>;
}) {
  const changes: Array<{
    type: "tempo" | "message_override" | "exclude_invalid" | "exclude_suppressed" | "test_batch";
    label: string;
    currentValue?: string | null;
    suggestedValue?: string | null;
  }> = [];

  if (input.tempo.aggressive) {
    changes.push({
      type: "tempo",
      label: "Reduce sending tempo",
      currentValue: `Batch ${input.tempo.current.batchSize}, delay ${input.tempo.current.delayPerMessageSeconds}s`,
      suggestedValue: `Batch ${input.tempo.suggested.batchSize}, delay ${input.tempo.suggested.delayPerMessageSeconds}s`
    });
  }

  if (input.template.suggestedOverrideBody) {
    changes.push({
      type: "message_override",
      label: "Add opt-out line for this campaign only",
      currentValue: "Original template remains unchanged",
      suggestedValue: "Campaign-level safer message override"
    });
  }

  if (input.audience.invalidRows > 0) {
    changes.push({
      type: "exclude_invalid",
      label: "Exclude invalid numbers",
      currentValue: `${input.audience.invalidRows}`,
      suggestedValue: "Excluded from sendable snapshot"
    });
  }

  if (input.audience.suppressedRows > 0) {
    changes.push({
      type: "exclude_suppressed",
      label: "Exclude previously suppressed numbers",
      currentValue: `${input.audience.suppressedRows}`,
      suggestedValue: "Excluded from sendable snapshot"
    });
  }

  changes.push({
    type: "test_batch",
    label: "Start with a test batch",
    currentValue: null,
    suggestedValue: `${input.tempo.recommendedTestBatchSize} contacts`
  });

  return changes;
}

function inferAudienceRiskLevel(sourceType: string | null): RiskLevel {
  switch (sourceType) {
    case "previous_whatsapp_contact":
      return "low";
    case "form_or_register_leads":
      return "low";
    case "existing_customers":
    case "event_booth_walkin":
    case "referral_partner_list":
      return "medium";
    case "cold_public_list":
    case "not_sure":
      return "high";
    default:
      return "medium";
  }
}

function pickSuggestedTempoPreset(
  audienceRiskLevel: RiskLevel,
  senderHealth: SenderHealthStatus,
  permissionStatus: string
): CampaignSpeedPreset {
  if (senderHealth === "Cooling Down" || senderHealth === "Risky") {
    return "very_safe";
  }

  if (audienceRiskLevel === "high" || permissionStatus === "not_verified_by_system") {
    return "safe";
  }

  if (audienceRiskLevel === "medium" || senderHealth === "Caution") {
    return "balanced";
  }

  return "normal";
}

function maxRiskLevel(levels: RiskLevel[]) {
  if (levels.includes("high")) return "high";
  if (levels.includes("medium")) return "medium";
  return "low";
}

function dedupeStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

function parseJson<T>(value: unknown) {
  if (!value) return null;
  if (typeof value === "object") return value as T;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
