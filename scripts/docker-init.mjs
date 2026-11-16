import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("select pg_advisory_lock(20261116)");
  await client.query("create schema if not exists escom_compose");
  await client.query("create table if not exists escom_compose.migrations (name text primary key)");
  const files = (await readdir("supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const result = await client.query("select 1 from escom_compose.migrations where name = $1", [file]);
    if (result.rowCount) continue;
    console.log(`Aplicando migración ${file}`);
    await client.query("begin");
    try {
      await client.query(await readFile(`supabase/migrations/${file}`, "utf8"));
      await client.query("insert into escom_compose.migrations(name) values ($1)", [file]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  const users = await client.query("select exists(select 1 from public.users) as present");
  if (!users.rows[0].present) {
    const seed = spawnSync(process.execPath, ["scripts/seed.mjs"], { stdio: "inherit", env: process.env });
    if (seed.error) throw seed.error;
    if (seed.status !== 0) throw new Error(`Falló la carga inicial: ${seed.status}`);
  } else console.log("Se conservan los datos existentes.");
} finally {
  await client.end();
}
