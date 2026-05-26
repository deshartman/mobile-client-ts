/**
 * Normalise a pasted or hand-typed phone to E.164 by stripping everything
 * except a leading "+" and digits. Does NOT validate — server enforces
 * the E.164 regex at the parse boundary.
 */
export function toE164(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `+${digits}` : hasPlus ? "+" : "";
}
