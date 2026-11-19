import { describe, expect, test } from "bun:test";
import { parseProxyUrl, proxyForSession } from "../../src/browser/proxy-settings";

describe("proxy settings", () => {
  test("parses a proxy URL", () => {
    expect(parseProxyUrl("http://user:p%40ss@proxy.example.com:1000")).toEqual({
      server: "http://proxy.example.com:1000",
      username: "user",
      password: "p@ss",
    });
  });

  test("parses the host:port:user:pass form", () => {
    expect(parseProxyUrl("proxy.example.com:1000:user:pass_session-abc")).toEqual({
      server: "http://proxy.example.com:1000",
      username: "user",
      password: "pass_session-abc",
    });
  });

  test("parses host:port:user:pass with a scheme", () => {
    expect(parseProxyUrl("http://proxy.example.com:1000:user:pass")).toEqual({
      server: "http://proxy.example.com:1000",
      username: "user",
      password: "pass",
    });
  });

  test("keeps @ in a dashboard-form password and parses IPv6 URLs", () => {
    expect(parseProxyUrl("proxy.example.com:1000:user:p@ss")).toMatchObject({ server: "http://proxy.example.com:1000", password: "p@ss" });
    expect(parseProxyUrl("http://user:pass@[::1]:8080")).toEqual({ server: "http://[::1]:8080", username: "user", password: "pass" });
    expect(parseProxyUrl("http://user:123:secret@proxy.example.com:1000")).toEqual({
      server: "http://proxy.example.com:1000",
      username: "user",
      password: "123:secret",
    });
    expect(parseProxyUrl("http://proxy.example.com:1000:user:p@ss")).toMatchObject({ server: "http://proxy.example.com:1000", password: "p@ss" });
  });

  test("explains an unparseable PROXY_URL", () => {
    expect(() => parseProxyUrl("proxy.example.com:1000:user")).toThrow("PROXY_URL must be");
  });

  test("fills {session} in either form", () => {
    expect(proxyForSession("proxy.example.com:1000:user:pass_session-{session}", "s1")?.password).toBe("pass_session-s1");
    expect(proxyForSession("http://user:pass_session-{session}@proxy.example.com:1000", "s2")?.password).toBe("pass_session-s2");
    expect(proxyForSession(undefined, "s3")).toBeUndefined();
  });
});
