import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DbRole = "anon" | "authenticated";
type SecurityContext = { role: DbRole; userId: string };
export type SecureClient = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
  release(error?: Error | boolean): void;
};

const globalForPg = globalThis as unknown as { pool?: Pool };
const databaseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : undefined;
const localDatabase = !databaseUrl || ["127.0.0.1", "localhost", "[::1]", "postgres", "db"].includes(databaseUrl.hostname);
const hostedSupabase = databaseUrl?.hostname.endsWith(".pooler.supabase.com") || databaseUrl?.hostname.endsWith(".supabase.co");
if (hostedSupabase && databaseUrl) {
  // pg gives URI TLS parameters precedence over the verified configuration below.
  for (const name of ["ssl", "sslmode", "sslrootcert", "sslcert", "sslkey"]) databaseUrl.searchParams.delete(name);
}

const rawPool =
  globalForPg.pool ??
  new Pool({
    connectionString: databaseUrl?.href,
    ssl: localDatabase ? undefined : {
      rejectUnauthorized: true,
      ca: hostedSupabase ? readFileSync(join(process.cwd(), "db/supabase-prod-ca-2021.crt"), "utf8") : undefined,
    },
    max: process.env.VERCEL ? 1 : 10,
    idleTimeoutMillis: process.env.VERCEL ? 1000 : 10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: Boolean(process.env.VERCEL),
  });
globalForPg.pool = rawPool;

function isTransientPoolError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return (
    msg.includes("EMAXCONNSESSION") ||
    msg.includes("ECHECKOUTFAILED") ||
    msg.includes("max clients reached")
  );
}

async function connectWithRetry(): Promise<PoolClient> {
  const maxAttempts = process.env.VERCEL ? 5 : 1;
  for (let attempt = 1; ; attempt++) {
    try {
      return await rawPool.connect();
    } catch (error) {
      if (attempt >= maxAttempts || !isTransientPoolError(error)) {
        throw error;
      }
      const delayMs = 100 * 2 ** (attempt - 1) + Math.floor(Math.random() * 80);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function securityContext(): Promise<SecurityContext> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = !error && typeof claims?.sub === "string" ? claims.sub : "";
  return { role: userId ? "authenticated" : "anon", userId };
}

async function applyContext(client: PoolClient, context: SecurityContext) {
  await client.query(`SET ROLE ${context.role}`);
  await client.query(
    `select
       set_config('request.jwt.claim.sub', $1, false),
       set_config('request.jwt.claim.role', $2, false),
       set_config('request.jwt.claims', $3, false)`,
    [context.userId, context.role, JSON.stringify({ sub: context.userId || null, role: context.role })],
  );
}

async function clearContext(client: PoolClient) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // There may be no open transaction.
  }
  try {
    await client.query("RESET ROLE");
    await client.query("RESET request.jwt.claim.sub");
    await client.query("RESET request.jwt.claim.role");
    await client.query("RESET request.jwt.claims");
  } catch {
    // Release with an error so the pool discards a connection whose context
    // could not be cleared.
    client.release(new Error("Could not clear the Supabase request context."));
    throw new Error("Could not clear the Supabase request context.");
  }
}

export const pool = {
  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>> {
    const context = await securityContext();
    const client = await connectWithRetry();
    let inTx = false;
    let discard = false;
    try {
      await client.query("BEGIN");
      inTx = true;
      await client.query(`SET LOCAL ROLE ${context.role}`);
      await client.query(
        `select
           set_config('request.jwt.claim.sub', $1, true),
           set_config('request.jwt.claim.role', $2, true),
           set_config('request.jwt.claims', $3, true)`,
        [context.userId, context.role, JSON.stringify({ sub: context.userId || null, role: context.role })],
      );
      const result = await client.query<T>(text, values as never[]);
      await client.query("COMMIT");
      inTx = false;
      return result;
    } catch (error) {
      if (inTx) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Discard the connection if the transaction could not be rolled back.
          discard = true;
        }
      } else {
        discard = true;
      }
      throw error;
    } finally {
      client.release(discard);
    }
  },

  async connect(): Promise<SecureClient> {
    const context = await securityContext();
    const client = await connectWithRetry();
    try {
      await applyContext(client, context);
    } catch (error) {
      client.release(error as Error);
      throw error;
    }

    let released = false;
    return {
      query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
        return client.query<T>(text, values as never[]);
      },
      release(error?: Error | boolean) {
        if (released) return;
        released = true;
        void clearContext(client)
          .then(() => client.release(error))
          .catch(() => {
            // clearContext already discards the unsafe connection.
          });
      },
    };
  },

  end() {
    return rawPool.end();
  },
};
