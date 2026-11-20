import "server-only";
import { hmacSha256Hex, safeEqual } from "@/lib/crypto";

/** Zoom webhook signature: x-zm-signature = "v0=" + HMAC_SHA256(secret, "v0:{timestamp}:{body}") */
export function verifyZoomSignature(secret: string, rawBody: string, timestamp: string | null, signature: string | null) {
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  return safeEqual(`v0=${hmacSha256Hex(secret, `v0:${timestamp}:${rawBody}`)}`, signature);
}

/** Response for Zoom's endpoint.url_validation challenge */
export function zoomUrlValidation(secret: string, plainToken: string) {
  return { plainToken, encryptedToken: hmacSha256Hex(secret, plainToken) };
}

/** Extracts the numeric meeting ID from a Zoom join URL, e.g. https://zoom.us/j/81234567890?pwd=... */
export function zoomMeetingIdFromUrl(url?: string | null) {
  const m = url?.match(/\/(?:j|w|s)\/(\d{9,12})/);
  return m ? m[1] : null;
}
