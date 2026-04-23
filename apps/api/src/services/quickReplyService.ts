import { pool, withTransaction } from "../config/database.js";
import { AppError } from "../lib/errors.js";
import { QuickReplyRepository } from "../repositories/quickReplyRepository.js";
import type { AuthUser } from "../types/auth.js";

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
      return this.repository.list(client, {
        organizationId,
        activeOnly: input?.activeOnly ?? true
      });
    } finally {
      client.release();
    }
  }

  async create(authUser: AuthUser, input: {
    organizationId?: string | null;
    title: string;
    body: string;
    category?: string | null;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    const organizationId = this.getOrganizationId(authUser, input.organizationId);

    return withTransaction((client) =>
      this.repository.create(client, {
        organizationId,
        title: input.title,
        body: input.body,
        category: input.category ?? null,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
        createdBy: authUser.organizationUserId
      })
    );
  }

  async update(authUser: AuthUser, input: {
    organizationId?: string | null;
    templateId: string;
    title?: string;
    body?: string;
    category?: string | null;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    const organizationId = this.getOrganizationId(authUser, input.organizationId);

    const template = await withTransaction((client) =>
      this.repository.update(client, {
        organizationId,
        templateId: input.templateId,
        title: input.title,
        body: input.body,
        category: input.category,
        isActive: input.isActive,
        sortOrder: input.sortOrder
      })
    );

    if (!template) {
      throw new AppError("Quick reply not found", 404, "quick_reply_not_found");
    }

    return template;
  }

  async delete(authUser: AuthUser, input: { organizationId?: string | null; templateId: string }) {
    const organizationId = this.getOrganizationId(authUser, input.organizationId);
    const deleted = await withTransaction((client) =>
      this.repository.delete(client, {
        organizationId,
        templateId: input.templateId
      })
    );

    if (!deleted) {
      throw new AppError("Quick reply not found", 404, "quick_reply_not_found");
    }
  }

  async recordUsage(authUser: AuthUser, input: { organizationId?: string | null; templateId: string }) {
    const organizationId = this.getOrganizationId(authUser, input.organizationId);
    const template = await withTransaction((client) =>
      this.repository.recordUsage(client, {
        organizationId,
        templateId: input.templateId
      })
    );

    if (!template) {
      throw new AppError("Quick reply not found or inactive", 404, "quick_reply_not_found");
    }

    return template;
  }
}
