type ContentSecurityPolicyOptions = {
  isDevelopment: boolean;
  realtimeUrl: string | null | undefined;
};

export function buildContentSecurityPolicy({
  isDevelopment,
  realtimeUrl
}: ContentSecurityPolicyOptions): string {
  const connectSources = buildConnectSources({ isDevelopment, realtimeUrl });

  return `
    default-src 'self';
    script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob:;
    font-src 'self';
    connect-src ${connectSources.join(" ")};
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
  `.replace(/\s{2,}/g, " ").trim();
}

export function buildConnectSources({
  isDevelopment,
  realtimeUrl
}: ContentSecurityPolicyOptions): string[] {
  if (isDevelopment) {
    // Next.js HMR and local Worker development can use dynamic HTTP/WebSocket
    // origins. Production and Preview builds do not receive this broad access.
    return ["'self'", "http:", "https:", "ws:", "wss:"];
  }

  const sources = ["'self'"];
  const realtimeOrigin = getRealtimeOrigin(realtimeUrl);

  if (realtimeOrigin) {
    sources.push(realtimeOrigin);
  }

  return sources;
}

export function getRealtimeOrigin(realtimeUrl: string | null | undefined): string | null {
  const value = realtimeUrl?.trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
