import { pool, withTransaction } from "../config/database.js";
import { AppError } from "../lib/errors.js";
import { QuickReplyRepository } from "../repositories/quickReplyRepository.js";
import type { AuthUser } from "../types/auth.js";
import { TemplateGovernanceService } from "./templateGovernanceService.js";

export class QuickReplyService {
  constructor(private readonly repository = new QuickReplyRepository()) {}

  private getOrganizationId(authUser: AuthUser, requestedOrganizationId?: string | null) {
    if (authUser.role === "super_admin") {
      const organizationId = requestedOrganizationId ?? authUser.organizationId;

      if (!organizationId) {
        throw new AppError("organization_id is required", 400, "organization_required");
      }

      return organizationId;
    }

    if (!authUser.organizationId) {
      throw new AppError("organization_id is required", 400, "organization_required");
    }

    if (requestedOrganizationId && requestedOrganizationId !== authUser.organizationId) {
      throw new AppError("Organization scope mismatch", 403, "organization_scope_mismatch");
    }

    return authUser.organizationId;
  }

  async list(authUser: AuthUser, input?: { organizationId?: string | null; activeOnly?: boolean }) {
    const organizationId = this.getOrganizationId(authUser, input?.organizationId);
    const client = await pool.connect();

    try {
      const templates = await this.repository.list(client, {
        organizationId,
        activeOnly: input?.activeOnly ?? true
      });
      if (input?.activeOnly ?? true) {
        return TemplateGovernanceService.filterAllowedQuickReplies(client, organizationId, templates);
      }
      return templates;
    } finally {
      client.release();
    }
  }

  async create(authUser: AuthUser, input: {
    organizationId?: string | null;
    title: string;
    body: string;
    category?: string | null;
    variableDefinitions?: Array<{
      key: string;
      default_value?: string | null;
      required: boolean;
    }>;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    const organizationId = this.getOrganizationId(authUser, input.organizationId);

    return withTransaction(async (client) => {
      const template = await this.repository.create(client, {
        organizationId,
        title: input.title,
        body: input.body,
        category: input.category ?? null,
        variableDefinitions: input.variableDefinitions ?? [],
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
        createdBy: authUser.organizationUserId
      });
      await TemplateGovernanceService.recordQuickReplyVersion(client, {
        organizationId,
        sourceTemplateId: template.id,
        title: template.title,
        body: template.body,
        category: template.category,
        variableDefinitions: template.variable_definitions,
        isActive: template.is_active,
        userId: authUser.organizationUserId,
        changeSummary: "Quick reply created"
      });
      return template;
    });
  }

  async update(authUser: AuthUser, input: {
    organizationId?: string | null;
    templateId: string;
    title?: string;
    body?: string;
    category?: string | null;
    variableDefinitions?: Array<{
      key: string;
      default_value?: string | null;
      required: boolean;
    }>;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    const organizationId = this.getOrganizationId(authUser, input.organizationId);
    const hasContentChange =
      input.title !== undefined ||
      input.body !== undefined ||
      input.category !== undefined ||
      input.variableDefinitions !== undefined;

    const template = await withTransaction(async (client) => {
      if (hasContentChange) {
        await TemplateGovernanceService.ensureTables(client);
        const settings = await client.query<{ approval_required: boolean }>(
          `select approval_required from template_governance_settings where organization_id = $1`,
          [organizationId]
        );
        if (settings.rows[0]?.approval_required) {
          const currentResult = await client.query(
            `
              select *
              from quick_reply_templates
              where organization_id = $1
                and id = $2
              limit 1
            `,
            [organizationId, input.templateId]
          );
          const current = currentResult.rows[0];
          if (!current) return null;
          await TemplateGovernanceService.recordQuickReplyVersion(client, {
            organizationId,
            sourceTemplateId: current.id,
            title: input.title ?? current.title,
            body: input.body ?? current.body,
            category: input.category !== undefined ? input.category : current.category,
            variableDefinitions: input.variableDefinitions ?? current.variable_definitions,
            isActive: input.isActive ?? current.is_active,
            userId: authUser.organizationUserId,
            changeSummary: "Quick reply update submitted for review"
          });
          return current;
        }
      }

      const updated = await this.repository.update(client, {
        organizationId,
        templateId: input.templateId,
        title: input.title,
        body: input.body,
        category: input.category,
        variableDefinitions: input.variableDefinitions,
        isActive: input.isActive,
        sortOrder: input.sortOrder
      });
      if (updated) {
        await TemplateGovernanceService.recordQuickReplyVersion(client, {
          organizationId,
          sourceTemplateId: updated.id,
          title: updated.title,
          body: updated.body,
          category: updated.category,
          variableDefinitions: updated.variable_definitions,
          isActive: updated.is_active,
          userId: authUser.organizationUserId,
          changeSummary: "Quick reply updated"
        });
      }
      return updated;
    });

    if (!template) {
      throw new AppError("Quick reply not found", 404, "quick_reply_not_found");
    }

    return template;
  }

  async delete(authUser: AuthUser, input: { organizationId?: string | null; templateId: string }) {
    const organizationId = this.getOrganizationId(authUser, input.organizationId);
    const deleted = await withTransaction(async (client) => {
      await TemplateGovernanceService.ensureTables(client);
      await client.query(
        `
          update template_governance_templates
          set current_status = 'archived',
              archived_at = timezone('utc', now()),
              updated_at = timezone('utc', now())
          where organization_id = $1
            and template_type = 'quick_reply'
            and source_template_id = $2
        `,
        [organizationId, input.templateId]
      );
      await client.query(
        `
          update template_versions
          set status = 'archived',
              is_active = false
          where organization_id = $1
            and template_type = 'quick_reply'
            and template_id in (
              select id
              from template_governance_templates
              where organization_id = $1
                and template_type = 'quick_reply'
                and source_template_id = $2
            )
        `,
        [organizationId, input.templateId]
      );
      return this.repository.delete(client, {
        organizationId,
        templateId: input.templateId
      });
    });

    if (!deleted) {
      throw new AppError("Quick reply not found", 404, "quick_reply_not_found");
    }
  }

  async recordUsage(authUser: AuthUser, input: { organizationId?: string | null; templateId: string }) {
    const organizationId = this.getOrganizationId(authUser, input.organizationId);
    const template = await withTransaction(async (client) => {
      const candidateResult = await client.query(
        `
          select id, organization_id, is_active
          from quick_reply_templates
          where organization_id = $1
            and id = $2
          limit 1
        `,
        [organizationId, input.templateId]
      );
      const candidates = await TemplateGovernanceService.filterAllowedQuickReplies(client, organizationId, candidateResult.rows);
      if (candidateResult.rows[0] && candidates.length === 0) {
        throw new AppError("Quick reply is not approved for use.", 403, "quick_reply_not_approved");
      }
      return this.repository.recordUsage(client, {
        organizationId,
        templateId: input.templateId
      });
    });

    if (!template) {
      throw new AppError("Quick reply not found or inactive", 404, "quick_reply_not_found");
    }

    return template;
  }

  async getAnalytics(authUser: AuthUser, input?: { organizationId?: string | null }) {
    const organizationId = this.getOrganizationId(authUser, input?.organizationId);
    const client = await pool.connect();

    try {
      return await this.repository.getAnalytics(client, { organizationId });
    } finally {
      client.release();
    }
  }
}
