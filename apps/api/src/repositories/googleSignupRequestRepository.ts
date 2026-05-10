import type { PoolClient } from "pg";

export type GoogleSignupRequestStatus = "pending" | "approved" | "rejected";

export interface GoogleSignupRequestRecord {
  id: string;
  auth_user_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  provider: string;
  status: GoogleSignupRequestStatus;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by_auth_user_id: string | null;
  approved_organization_id: string | null;
  approved_organization_user_id: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export class GoogleSignupRequestRepository {
  async list(
    client: PoolClient,
    status: GoogleSignupRequestStatus | "all" = "pending"
  ): Promise<GoogleSignupRequestRecord[]> {
    const params: unknown[] = [];
    const statusFilter = status === "all" ? "" : "where status = $1";

    if (status !== "all") {
      params.push(status);
    }

    const result = await client.query<GoogleSignupRequestRecord>(
      `
        select
          id,
          auth_user_id,
          email,
          full_name,
          avatar_url,
          provider,
          status,
          requested_at,
          reviewed_at,
          reviewed_by_auth_user_id,
          approved_organization_id,
          approved_organization_user_id,
          rejection_reason,
          created_at,
          updated_at
        from google_signup_requests
        ${statusFilter}
        order by requested_at desc
      `,
      params
    );

    return result.rows;
  }

  async findById(client: PoolClient, requestId: string): Promise<GoogleSignupRequestRecord | null> {
    const result = await client.query<GoogleSignupRequestRecord>(
      `
        select
          id,
          auth_user_id,
          email,
          full_name,
          avatar_url,
          provider,
          status,
          requested_at,
          reviewed_at,
          reviewed_by_auth_user_id,
          approved_organization_id,
          approved_organization_user_id,
          rejection_reason,
          created_at,
          updated_at
        from google_signup_requests
        where id = $1
        limit 1
      `,
      [requestId]
    );

    return result.rows[0] ?? null;
  }

  async createOrRefreshPending(
    client: PoolClient,
    input: {
      authUserId: string;
      email: string;
      fullName: string | null;
      avatarUrl: string | null;
    }
  ): Promise<GoogleSignupRequestRecord> {
    const existingResult = await client.query<GoogleSignupRequestRecord>(
      `
        update google_signup_requests
        set auth_user_id = $1,
            email = lower($2),
            full_name = $3,
            avatar_url = $4,
            status = 'pending',
            requested_at = timezone('utc', now()),
            reviewed_at = null,
            reviewed_by_auth_user_id = null,
            approved_organization_id = null,
            approved_organization_user_id = null,
            rejection_reason = null,
            updated_at = timezone('utc', now())
        where auth_user_id = $1
          or lower(email) = lower($2)
        returning
          id,
          auth_user_id,
          email,
          full_name,
          avatar_url,
          provider,
          status,
          requested_at,
          reviewed_at,
          reviewed_by_auth_user_id,
          approved_organization_id,
          approved_organization_user_id,
          rejection_reason,
          created_at,
          updated_at
      `,
      [input.authUserId, input.email, input.fullName, input.avatarUrl]
    );

    if (existingResult.rows[0]) {
      return existingResult.rows[0];
    }

    const result = await client.query<GoogleSignupRequestRecord>(
      `
        insert into google_signup_requests (
          auth_user_id,
          email,
          full_name,
          avatar_url,
          provider,
          status,
          requested_at,
          updated_at
        )
        values ($1, lower($2), $3, $4, 'google', 'pending', timezone('utc', now()), timezone('utc', now()))
        returning
          id,
          auth_user_id,
          email,
          full_name,
          avatar_url,
          provider,
          status,
          requested_at,
          reviewed_at,
          reviewed_by_auth_user_id,
          approved_organization_id,
          approved_organization_user_id,
          rejection_reason,
          created_at,
          updated_at
      `,
      [input.authUserId, input.email, input.fullName, input.avatarUrl]
    );

    return result.rows[0];
  }

  async approve(
    client: PoolClient,
    input: {
      requestId: string;
      reviewedByAuthUserId: string;
      organizationId: string;
      organizationUserId: string;
    }
  ): Promise<GoogleSignupRequestRecord | null> {
    const result = await client.query<GoogleSignupRequestRecord>(
      `
        update google_signup_requests
        set status = 'approved',
            reviewed_at = timezone('utc', now()),
            reviewed_by_auth_user_id = $2,
            approved_organization_id = $3,
            approved_organization_user_id = $4,
            rejection_reason = null
        where id = $1
          and status = 'pending'
        returning
          id,
          auth_user_id,
          email,
          full_name,
          avatar_url,
          provider,
          status,
          requested_at,
          reviewed_at,
          reviewed_by_auth_user_id,
          approved_organization_id,
          approved_organization_user_id,
          rejection_reason,
          created_at,
          updated_at
      `,
      [input.requestId, input.reviewedByAuthUserId, input.organizationId, input.organizationUserId]
    );

    return result.rows[0] ?? null;
  }

  async reject(
    client: PoolClient,
    input: {
      requestId: string;
      reviewedByAuthUserId: string;
      reason: string | null;
    }
  ): Promise<GoogleSignupRequestRecord | null> {
    const result = await client.query<GoogleSignupRequestRecord>(
      `
        update google_signup_requests
        set status = 'rejected',
            reviewed_at = timezone('utc', now()),
            reviewed_by_auth_user_id = $2,
            rejection_reason = $3
        where id = $1
          and status = 'pending'
        returning
          id,
          auth_user_id,
          email,
          full_name,
          avatar_url,
          provider,
          status,
          requested_at,
          reviewed_at,
          reviewed_by_auth_user_id,
          approved_organization_id,
          approved_organization_user_id,
          rejection_reason,
          created_at,
          updated_at
      `,
      [input.requestId, input.reviewedByAuthUserId, input.reason]
    );

    return result.rows[0] ?? null;
  }
}
