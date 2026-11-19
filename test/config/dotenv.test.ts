import { describe, expect, test } from "bun:test";
import { parseDotEnv } from "../../src/config/dotenv";
import { loadAppConfig } from "../../src/config/app-config";

describe(".env", () => {
  test("parses values, comments, quotes and export", () => {
    expect(
      parseDotEnv(
        [
          "# comment",
          "PROXY_URL=host:1000:user:pass_session-{session}",
          "POOL_SIZE=2          # browsers",
          'API_KEY="a b # c"',
          "export LOGGING=disabled",
          "EMPTY=",
          "not a setting",
        ].join("\n"),
      ),
    ).toEqual({
      PROXY_URL: "host:1000:user:pass_session-{session}",
      POOL_SIZE: "2",
      API_KEY: "a b # c",
      LOGGING: "disabled",
      EMPTY: "",
    });
  });

  test("config comes from the given .env values only", () => {
    const config = loadAppConfig(parseDotEnv("PORT=9000\nPOOL_SIZE=3\nAPI_KEY=k"));
    expect(config).toMatchObject({ port: 9000, poolSize: 3, apiKey: "k", proxyUrl: undefined, loggingEnabled: true });
  });
});
