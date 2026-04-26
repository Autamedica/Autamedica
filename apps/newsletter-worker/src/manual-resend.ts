import type { Env } from "./index";
import { runNewsletter } from "./index";

declare const process: {
  env: Record<string, string | undefined>;
};

function requireEnv(name: keyof Env): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} no configurada`);
  return value;
}

const env: Env = {
  GEMINI_API_KEY: requireEnv("GEMINI_API_KEY"),
  RESEND_API_KEY: requireEnv("RESEND_API_KEY"),
  RESEND_AUDIENCE_ID: requireEnv("RESEND_AUDIENCE_ID"),
  BREVO_API_KEY: process.env.BREVO_API_KEY ?? "",
  TRIGGER_KEY: process.env.TRIGGER_KEY ?? "manual",
  FROM_EMAIL: process.env.FROM_EMAIL ?? "contacto@autamedica.com",
  FROM_NAME: process.env.FROM_NAME ?? "AutaMedica",
  SUBJECT_PREFIX: process.env.SUBJECT_PREFIX ?? "Salud Digital",
  RSS_FEEDS: requireEnv("RSS_FEEDS"),
  TIMEZONE_LABEL: process.env.TIMEZONE_LABEL ?? "Argentina",
  HEADER_IMAGE_URL: process.env.HEADER_IMAGE_URL ?? "https://qxjjrpksmwwrmubhvjew.supabase.co/storage/v1/object/public/public_assets/autamedica-reference-style.gif",
  SUPABASE_URL: requireEnv("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
};

await runNewsletter(env);
