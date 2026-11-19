/** Chrome takes the proxy server as a flag; credentials are answered over CDP. */
export interface ProxySettings {
  server: string;
  username?: string;
  password?: string;
}

/**
 * `http://user:pass@host:port`, or the `host:port:user:pass` form proxy dashboards export
 * (optionally with a scheme, e.g. `http://host:port:user:pass`),
 * → `{ server: "http://host:port", username, password }`.
 */
export function parseProxyUrl(proxyUrl: string): ProxySettings {
  const [, scheme = "http", rest = proxyUrl] = /^([a-z0-9]+):\/\/(.*)$/i.exec(proxyUrl) ?? [];
  const parts = rest.split(":");
  if (!rest.includes("@") && parts.length === 4) {
    const [host, port, username, password] = parts;
    return { server: `${scheme}://${host}:${port}`, username, password };
  }
  const url = URL.canParse(proxyUrl) ? new URL(proxyUrl) : undefined;
  if (!url?.hostname) throw new Error('PROXY_URL must be "http://user:pass@host:port" or "host:port:user:pass"');
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
