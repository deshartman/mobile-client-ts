import { EnvSchema, type Env } from "@mobileclient/shared-types";

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    const summary = Object.entries(fieldErrors)
      .map(([k, msgs]) => `  ${k}: ${msgs?.join(", ")}`)
      .join("\n");
    console.error(`[env] Invalid environment variables:\n${summary}`);
    throw new Error("Invalid environment — see field errors above");
  }
  cached = result.data;
  return cached;
}

export const env = new Proxy({} as Env, {
  get(_target, prop) {
    return getEnv()[prop as keyof Env];
  },
});

/**
 * Test-only: drop the env cache so the next access re-parses process.env.
 * Safe in production too — cached values are pure data, re-reading is cheap.
 */
export function resetEnvCache(): void {
  cached = undefined;
}
