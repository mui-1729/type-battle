/**
 * Returns the client IP asserted by Cloudflare's edge.
 *
 * X-Forwarded-For is intentionally ignored because it can be supplied by a
 * caller when the Worker is reached outside the normal Cloudflare edge path.
 */
export function readCloudflareClientIp(headers: Headers): string {
  const connectingIp = headers.get("CF-Connecting-IP")?.trim();
  return connectingIp || "unknown";
}
