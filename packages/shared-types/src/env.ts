import { z } from "zod";

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  SERVER_BASE_URL: z.string().url(),
  DB_PATH: z.string().default("./data/app.db"),

  TWILIO_ACCOUNT_SID: z.string().regex(/^AC[a-f0-9]{32}$/i),
  TWILIO_API_KEY: z.string().regex(/^SK[a-f0-9]{32}$/i),
  TWILIO_API_SECRET: z.string().min(1),
  TWILIO_AUTH_TOKEN: z
    .string()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  TWILIO_REGION: z
    .string()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),

  TWIML_APP_SID: z.string().regex(/^AP[a-f0-9]{32}$/i),

  VOICE_SDK_ASSISTANT_SID: z.string().optional().transform((v) => (v === "" ? undefined : v)),
  VOICE_SDK_GREETING: z.string().optional().transform((v) => (v === "" ? undefined : v)),
  VOICE_SDK_VOICE_ID: z.string().optional().transform((v) => (v === "" ? undefined : v)),

  FLEX_WORKFLOW_SID: z.string().optional().transform((v) => (v === "" ? undefined : v)),
  FLEX_WORKSPACE_SID: z.string().optional().transform((v) => (v === "" ? undefined : v)),

  TRANSCRIPTION_ENGINE: z.enum(["google", "deepgram"]).optional(),
  TRANSCRIPTION_LANGUAGE_CODE: z.string().optional().transform((v) => (v === "" ? undefined : v)),

  VIDEO_INVITE_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  OTP_FROM_NUMBER: z.string().regex(/^\+[1-9]\d{1,14}$/),
});
export type Env = z.infer<typeof EnvSchema>;

export const CountryConfigTypeSchema = z.enum(["local", "mobile", "tollFree"]);
export type CountryConfigType = z.infer<typeof CountryConfigTypeSchema>;

export const CountryConfigSchema = z.object({
  type: CountryConfigTypeSchema,
  bundleSid: z.string().regex(/^BU[a-f0-9]{32}$/i).optional(),
  addressSid: z.string().regex(/^AD[a-f0-9]{32}$/i).optional(),
});
export type CountryConfig = z.infer<typeof CountryConfigSchema>;

export function loadCountryConfig(
  iso2: string,
  env: Record<string, string | undefined>,
): CountryConfig | undefined {
  const prefix = `TWILIO_COUNTRY_CONFIG_${iso2.toUpperCase()}_`;
  const type = env[`${prefix}TYPE`];
  if (!type) return undefined;
  const parsed = CountryConfigSchema.safeParse({
    type,
    bundleSid: env[`${prefix}BUNDLE_SID`] || undefined,
    addressSid: env[`${prefix}ADDRESS_SID`] || undefined,
  });
  return parsed.success ? parsed.data : undefined;
}
