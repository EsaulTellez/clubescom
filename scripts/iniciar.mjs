import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync("node_modules/supabase/package.json")) run("npm", ["ci"]);
run("npx", ["supabase", "start"]);
run("npx", ["supabase", "migration", "up"]);
run("npm", ["run", "env:local"]);

// Never re-seed an existing installation: the seed updates demo accounts and content.
const { Pool } = (await import("pg")).default;
const { readFile } = await import("node:fs/promises");
const env = await readFile(".env.local", "utf8");
const dbUrl = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (!dbUrl) throw new Error("No se encontró DATABASE_URL en .env.local.");
const pool = new Pool({ connectionString: dbUrl });
try {
  const result = await pool.query("select exists(select 1 from public.users) as has_users");
  if (!result.rows[0].has_users) run("npm", ["run", "db:seed"]);
  else console.log("Se conservan los datos existentes; no se vuelve a ejecutar el seed.");
} finally {
  await pool.end();
}

console.log("\nAbre http://127.0.0.1:3001 · Mailpit: http://127.0.0.1:54324\n");
const app = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3001"], {
  stdio: "inherit", shell: process.platform === "win32",
});
app.on("error", (error) => { console.error(error); process.exitCode = 1; });
app.on("exit", (code) => { process.exitCode = code ?? 0; });
