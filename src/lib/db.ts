import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
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
const rawPool =
  globalForPg.pool ?? new Pool({ connectionString: process.env.DATABASE_URL });
if (process.env.NODE_ENV !== "production") globalForPg.pool = rawPool;

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
    const client = await rawPool.connect();
    try {
      const context = await securityContext();
      await client.query("BEGIN");
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
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original query error.
      }
      throw error;
    } finally {
      await clearContext(client);
      client.release();
    }
  },

  async connect(): Promise<SecureClient> {
    const client = await rawPool.connect();
    try {
      const context = await securityContext();
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
