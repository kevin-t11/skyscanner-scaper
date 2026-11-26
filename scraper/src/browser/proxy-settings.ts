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
function parseProxyUrl(proxyUrl: string): ProxySettings {
  const [, scheme = "http", rest = proxyUrl] = /^([a-z0-9]+):\/\/(.*)$/i.exec(proxyUrl) ?? [];
  // URL form when the part after the last `@` is `host:port`; otherwise the dashboard form,
  // whose second field is the port and whose password may contain `:` or `@`.
  const isUrlForm = /@(\[[^\]]+\]|[^:@]+):\d+$/.test(rest);
  const [host, port, username, ...password] = rest.split(":");
  if (!isUrlForm && host && port && /^\d+$/.test(port) && username !== undefined && password.length) {
    return { server: `${scheme}://${host}:${port}`, username, password: password.join(":") };
  }
  const url = URL.canParse(proxyUrl) ? new URL(proxyUrl) : undefined;
  if (!url?.hostname) throw new Error('PROXY_URL must be "http://user:pass@host:port" or "host:port:user:pass"');
  return {
    // `URL` drops a default port (`:80` for http), which Chrome then rejects.
    server: `${url.protocol}//${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}`,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
  };
}

/** Gives each browser its own sticky proxy session by filling the `{session}` placeholder. */
export function proxyForSession(proxyUrlTemplate: string | undefined, sessionId: string): ProxySettings | undefined {
  return proxyUrlTemplate ? parseProxyUrl(proxyUrlTemplate.replaceAll("{session}", sessionId)) : undefined;
}
