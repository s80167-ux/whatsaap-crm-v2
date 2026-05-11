import type { PoolClient } from "pg";
import { query } from "../../config/database.js";
import type { AuthUser } from "../../types/auth.js";

export type NotificationRecord = {
  id: string;
  organization_id: string | null;
  recipient_user_id: string | null;
  recipient_org_user_id: string | null;
  type: string;
  title: string;
  message: string | null;
  target_path: string | null;
  target_entity_type: string | null;
  target_entity_id: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
  read_at: string | null;
};

type ListNotificationsResult = {
  notifications: NotificationRecord[];
  unreadCount: number;
};

type CreateOrUpdateNotificationInput = {
  organizationId: string | null;
  recipientUserId?: string | null;
  recipientOrgUserId?: string | null;
  type: string;
  title: string;
  message?: string | null;
  targetPath?: string | null;
  targetEntityType?: string | null;
  targetEntityId?: string | null;
  uniqueKey?: string | null;
  metadata?: Record<string, unknown>;
};

const DEFAULT_LIMIT = 20;

export class NotificationsService {
  async list(auth: AuthUser, limit = DEFAULT_LIMIT): Promise<ListNotificationsResult> {
    const boundedLimit = Math.min(Math.max(limit, 1), 50);
    const visibilityWhere = this.getVisibilityWhere(auth);

    const [notificationsResult, unreadResult] = await Promise.all([
      query<NotificationRecord>(
        `
          select
            n.id,
            n.organization_id,
            n.recipient_user_id,
            n.recipient_org_user_id,
            n.type,
            n.title,
            n.message,
            n.target_path,
            n.target_entity_type,
            n.target_entity_id,
            n.metadata,
            n.created_at,
            n.updated_at,
            nr.read_at
          from notifications n
          left join notification_reads nr
            on nr.notification_id = n.id
           and nr.auth_user_id = $1
          where ${visibilityWhere.sql}
          order by n.updated_at desc, n.created_at desc
          limit $${visibilityWhere.values.length + 2}
        `,
        [auth.authUserId, ...visibilityWhere.values, boundedLimit]
      ),
      query<{ unread_count: string }>(
        `
          select count(*)::text as unread_count
          from notifications n
          left join notification_reads nr
            on nr.notification_id = n.id
           and nr.auth_user_id = $1
          where ${visibilityWhere.sql}
            and nr.notification_id is null
        `,
        [auth.authUserId, ...visibilityWhere.values]
      )
    ]);

    return {
      notifications: notificationsResult.rows,
      unreadCount: Number(unreadResult.rows[0]?.unread_count ?? 0)
    };
  }

  async markRead(auth: AuthUser, notificationId: string): Promise<void> {
    const visibilityWhere = this.getVisibilityWhere(auth);

    await query(
      `
        insert into notification_reads (notification_id, auth_user_id, read_at)
        select n.id, $1, now()
        from notifications n
        where n.id = $${visibilityWhere.values.length + 2}
          and ${visibilityWhere.sql}
        on conflict (notification_id, auth_user_id)
        do update set read_at = excluded.read_at
      `,
      [auth.authUserId, ...visibilityWhere.values, notificationId]
    );
  }

  async markAllRead(auth: AuthUser): Promise<void> {
    const visibilityWhere = this.getVisibilityWhere(auth);

    await query(
      `
        insert into notification_reads (notification_id, auth_user_id, read_at)
        select n.id, $1, now()
        from notifications n
        where ${visibilityWhere.sql}
        on conflict (notification_id, auth_user_id)
        do update set read_at = excluded.read_at
      `,
      [auth.authUserId, ...visibilityWhere.values]
    );
  }

  async createOrUpdate(client: PoolClient, input: CreateOrUpdateNotificationInput): Promise<string> {
    const result = await client.query<{ id: string }>(
      `
        insert into notifications (
          organization_id,
          recipient_user_id,
          recipient_org_user_id,
          type,
          title,
          message,
          target_path,
          target_entity_type,
          target_entity_id,
          unique_key,
          metadata
        )
        values ($1, $2, $3, $4, $5, nullif($6, ''), $7, $8, $9, $10, $11)
        on conflict (unique_key)
        where unique_key is not null
        do update set
          organization_id = excluded.organization_id,
          recipient_user_id = excluded.recipient_user_id,
          recipient_org_user_id = excluded.recipient_org_user_id,
          type = excluded.type,
          title = excluded.title,
          message = excluded.message,
          target_path = excluded.target_path,
          target_entity_type = excluded.target_entity_type,
          target_entity_id = excluded.target_entity_id,
          metadata = notifications.metadata || excluded.metadata || jsonb_build_object(
            'messageCount',
            coalesce((notifications.metadata->>'messageCount')::integer, 0) + 1
          ),
          updated_at = now()
        returning id
      `,
      [
        input.organizationId,
        input.recipientUserId ?? null,
        input.recipientOrgUserId ?? null,
        input.type,
        input.title,
        input.message ?? null,
        input.targetPath ?? null,
        input.targetEntityType ?? null,
        input.targetEntityId ?? null,
        input.uniqueKey ?? null,
        input.metadata ?? {}
      ]
    );

    const notificationId = result.rows[0].id;

    await client.query(
      `
        delete from notification_reads
        where notification_id = $1
      `,
      [notificationId]
    );

    return notificationId;
  }

  private getVisibilityWhere(auth: AuthUser) {
    if (auth.role === "super_admin") {
      return { sql: "true", values: [] as unknown[] };
    }

    if (auth.role === "org_admin") {
      return {
        sql: "n.organization_id = $2",
        values: [auth.organizationId]
      };
    }

    return {
      sql: `
        n.organization_id = $2
        and (
          n.recipient_user_id = $1
          or ($3::uuid is not null and n.recipient_org_user_id = $3)
        )
      `,
      values: [auth.organizationId, auth.organizationUserId]
    };
  }
}
