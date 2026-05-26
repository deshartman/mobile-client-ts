import QRCode from "qrcode";
import { env } from "@/lib/env";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns a PNG of a QR code pointing at /signup. Used by the main-list
 * "share app" modal so a visitor can scan and onboard onto their own
 * Twilio number without typing anything.
 */
export async function GET() {
  try {
    const base = env.SERVER_BASE_URL.replace(/\/$/, "");
    const signupUrl = `${base}/signup`;
    const buffer = await QRCode.toBuffer(signupUrl, { type: "png", width: 512 });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err, "api/auth/qr");
  }
}
