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

  test("fills {session} in either form", () => {
    expect(proxyForSession("proxy.example.com:1000:user:pass_session-{session}", "s1")?.password).toBe("pass_session-s1");
    expect(proxyForSession("http://user:pass_session-{session}@proxy.example.com:1000", "s2")?.password).toBe("pass_session-s2");
    expect(proxyForSession(undefined, "s3")).toBeUndefined();
  });
});
