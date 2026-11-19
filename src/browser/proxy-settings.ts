/** Chrome takes the proxy server as a flag; credentials are answered over CDP. */
export interface ProxySettings {
  server: string;
  username?: string;
  password?: string;
}

/** `http://user:pass@host:port` → `{ server: "http://host:port", username, password }`. */
export function parseProxyUrl(proxyUrl: string): ProxySettings {
  const url = new URL(proxyUrl);
  return {
    server: `${url.protocol}//${url.hostname}:${url.port}`,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
  };
}

/** Gives each browser its own sticky proxy session by filling the `{session}` placeholder. */
export function proxyForSession(proxyUrlTemplate: string | undefined, sessionId: string): ProxySettings | undefined {
  return proxyUrlTemplate ? parseProxyUrl(proxyUrlTemplate.replaceAll("{session}", sessionId)) : undefined;
}
