import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { env } from "./env.js";
import { logger } from "./logger.js";

const CLIENT_ERROR_HANDLER_ATTACHED = Symbol("dbClientErrorHandlerAttached");

type InstrumentedPoolClient = PoolClient & {
  [CLIENT_ERROR_HANDLER_ATTACHED]?: true;
};

function getDatabaseTargetSummary(connectionString: string) {
  try {
    const parsed = new URL(connectionString);
    return {
      host: parsed.hostname,
      port: parsed.port || "5432",
      database: parsed.pathname.replace(/^\//, "") || "postgres",
      pooler: parsed.hostname.includes("pooler.supabase.com")
    };
  } catch {
    return {
      host: "invalid",
      port: "unknown",
      database: "unknown",
      pooler: false
    };
  }
}

const databaseTarget = getDatabaseTargetSummary(env.DATABASE_URL);

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
  idleTimeoutMillis: env.DATABASE_IDLE_TIMEOUT_MS,
  allowExitOnIdle: false,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
});

pool.on("error", (err) => {
  logger.error(
    {
      err,
      database: databaseTarget,
      pool: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      }
    },
    "Unexpected PostgreSQL pool error"
  );
});

pool.on("connect", (client) => {
  attachClientErrorLogging(client);
});

function attachClientErrorLogging(client: PoolClient) {
  const instrumentedClient = client as InstrumentedPoolClient;

  if (instrumentedClient[CLIENT_ERROR_HANDLER_ATTACHED]) {
    return client;
  }

  const onError = (err: Error) => {
    logger.error(
      {
        err,
        database: databaseTarget,
        pool: {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount
        }
      },
      "Unexpected PostgreSQL client error"
    );
  };

  instrumentedClient[CLIENT_ERROR_HANDLER_ATTACHED] = true;
  client.on("error", onError);

  return client;
}

function logConnectionFailure(error: unknown, operation: string) {
  logger.error(
    {
      err: error,
      operation,
      database: databaseTarget,
      pool: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      }
    },
    "PostgreSQL connection failed"
  );
}

export async function query<T extends QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, values);
  } catch (error) {
    logConnectionFailure(error, "query");
    throw error;
  }
}

export async function verifyDatabaseConnection() {
  try {
    const result = await pool.query<{ database_time: string }>("select now()::text as database_time");
    logger.info(
      {
        database: databaseTarget,
        databaseTime: result.rows[0]?.database_time ?? null,
        pool: {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount
        }
      },
      "PostgreSQL connection verified"
    );
    return true;
  } catch (error) {
    logConnectionFailure(error, "startup_check");
    return false;
  }
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  let client: PoolClient;

  try {
    client = await pool.connect();
  } catch (error) {
    logConnectionFailure(error, "pool.connect");
    throw error;
  }

  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch (rollbackError) {
      logger.error({ err: rollbackError }, "Failed to rollback PostgreSQL transaction");
    }

    throw error;
  } finally {
    client.release();
  }
}
