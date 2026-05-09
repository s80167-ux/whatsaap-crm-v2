import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { env } from "./env.js";
import { logger } from "./logger.js";

const CLIENT_ERROR_HANDLER_ATTACHED = Symbol("dbClientErrorHandlerAttached");

type InstrumentedPoolClient = PoolClient & {
  [CLIENT_ERROR_HANDLER_ATTACHED]?: true;
};

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
  idleTimeoutMillis: env.DATABASE_IDLE_TIMEOUT_MS,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});


pool.on("error", (err) => {
  logger.error({ err }, "Unexpected PostgreSQL pool error");
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
    logger.error({ err }, "Unexpected PostgreSQL client error");
  };

  instrumentedClient[CLIENT_ERROR_HANDLER_ATTACHED] = true;
  client.on("error", onError);

  return client;
}

export async function query<T extends QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, values);
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();

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
