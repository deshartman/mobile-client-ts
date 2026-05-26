import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Unmount + detach DOM after every test — RTL only auto-cleans when
// `globals: true`, which we don't set.
afterEach(() => {
  cleanup();
});

// Test-time env so env.ts parses without throwing during module imports.
// Services import from env.ts at load; the real values here are irrelevant
// because every test mocks @/lib/twilio-client.
process.env.NODE_ENV ??= "test";
process.env.SERVER_BASE_URL ??= "https://test.local";
process.env.TWILIO_ACCOUNT_SID ??= "AC00000000000000000000000000000000";
process.env.TWILIO_API_KEY ??= "SK00000000000000000000000000000000";
process.env.TWILIO_API_SECRET ??= "test_secret";
process.env.TWILIO_AUTH_TOKEN ??= "test_auth_token";
process.env.TWIML_APP_SID ??= "AP00000000000000000000000000000000";
process.env.OTP_FROM_NUMBER ??= "+15551234567";
process.env.DB_PATH ??= ":memory:";

process.env.TWILIO_COUNTRY_CONFIG_US_TYPE ??= "local";
process.env.TWILIO_COUNTRY_CONFIG_AU_TYPE ??= "mobile";
process.env.TWILIO_COUNTRY_CONFIG_AU_BUNDLE_SID ??= "BU00000000000000000000000000000001";
process.env.TWILIO_COUNTRY_CONFIG_AU_ADDRESS_SID ??= "AD00000000000000000000000000000001";

// Silence the colored log spam; tests assert behaviour not log output.
vi.mock("@/lib/logger", () => ({
  logOut: vi.fn(),
  logError: vi.fn(),
}));

// jsdom doesn't ship ResizeObserver; input-otp + some shadcn primitives need it.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

// input-otp polls elementFromPoint for password-manager badge placement.
// jsdom doesn't implement it — noop is fine, there's nothing to place.
if (typeof document !== "undefined" && typeof document.elementFromPoint !== "function") {
  Object.defineProperty(document, "elementFromPoint", {
    value: () => null,
    configurable: true,
  });
}

// jsdom doesn't implement Element.prototype.scrollTo — silent noop is fine
// for tests that don't care about actual scroll behaviour.
if (typeof Element !== "undefined" && typeof Element.prototype.scrollTo !== "function") {
  Element.prototype.scrollTo = function scrollTo() {};
}
