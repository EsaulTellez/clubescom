import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const result = spawnSync("npx", ["supabase", "status", "--output", "env"], {
  encoding: "utf8",
});
if (result.status !== 0) {
  process.stderr.write(result.stderr || "No pude leer el estado de Supabase local.\n");
  process.exit(result.status ?? 1);
}

const output = new Map();
for (const line of result.stdout.split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (!match) continue;
  const [, key, rawValue] = match;
  let value = rawValue.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  output.set(key, value);
}

const required = ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY", "DB_URL"];
const missing = required.filter((key) => !output.get(key));
if (missing.length) {
  throw new Error(`Supabase local no devolvió: ${missing.join(", ")}`);
}

let existing = "";
try {
  existing = await readFile(".env.local", "utf8");
} catch {
  // Create the ignored local env file on first setup.
}
const existingEnv = new Map();
for (const line of existing.split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) existingEnv.set(match[1], match[2]);
}

const env = [
  `NEXT_PUBLIC_SUPABASE_URL=${output.get("API_URL")}`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${output.get("PUBLISHABLE_KEY")}`,
  `SUPABASE_SECRET_KEY=${output.get("SECRET_KEY")}`,
  `DATABASE_URL=${output.get("DB_URL")}`,
  `NEXT_PUBLIC_SITE_URL=${existingEnv.get("NEXT_PUBLIC_SITE_URL") || "http://127.0.0.1:3001"}`,
  `GOOGLE_GENERATIVE_AI_API_KEY=${existingEnv.get("GOOGLE_GENERATIVE_AI_API_KEY") || ""}`,
];

await writeFile(".env.local", `${env.join("\n")}\n`);
console.log("Variables locales de Supabase actualizadas en .env.local; las claves no se imprimieron.");
