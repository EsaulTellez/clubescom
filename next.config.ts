import type { NextConfig } from "next";

function vercelEnvironment() {
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!apiUrl || !URL.canParse(apiUrl) || new URL(apiUrl).protocol !== "https:") {
    throw new Error("Configura NEXT_PUBLIC_SUPABASE_URL con la URL HTTPS del proyecto de Supabase.");
  }
  for (const name of ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "DATABASE_URL"]) {
    if (!process.env[name]?.trim()) throw new Error(`Falta configurar ${name} en Vercel.`);
  }
  const database = new URL(process.env.DATABASE_URL!);
  if (["localhost", "127.0.0.1", "[::1]", "db", "postgres"].includes(database.hostname) ||
      (database.hostname.endsWith(".pooler.supabase.com") && database.port === "6543")) {
    throw new Error("DATABASE_URL debe usar una conexión remota directa o el Session pooler de Supabase (puerto 5432).");
  }
  const host = process.env.VERCEL_ENV === "production"
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
    : process.env.VERCEL_URL;
  const candidate = process.env.NEXT_PUBLIC_SITE_URL || (host && `https://${host}`);
  if (!candidate || !URL.canParse(candidate) || new URL(candidate).protocol !== "https:") {
    throw new Error("Configura NEXT_PUBLIC_SITE_URL con el dominio HTTPS de la aplicación en Vercel.");
  }
  return { NEXT_PUBLIC_SITE_URL: new URL(candidate).origin };
}

const nextConfig: NextConfig = {
  ...(process.env.VERCEL && { env: vercelEnvironment() }),
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas", "tesseract.js"],
  outputFileTracingIncludes: {
    "/guias/nueva": ["./node_modules/@tesseract.js-data/spa/4.0.0_best_int/*", "./node_modules/tesseract.js-core/*lstm*", "./node_modules/tesseract.js/src/**/*", "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
  allowedDevOrigins: ["127.0.0.1", "::1", "[::1]"],
  experimental: {
    agentUpgrade: "security",
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
