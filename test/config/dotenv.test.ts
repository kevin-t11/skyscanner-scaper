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
          "API_KEY_EMPTY=             # optional",
          "not a setting",
        ].join("\n"),
      ),
    ).toEqual({
      PROXY_URL: "host:1000:user:pass_session-{session}",
      POOL_SIZE: "2",
      API_KEY: "a b # c",
      LOGGING: "disabled",
      EMPTY: "",
      API_KEY_EMPTY: "",
    });
  });

  test(".env.example gives an empty API_KEY and the documented defaults", () => {
    const config = loadAppConfig(parseDotEnv(require("node:fs").readFileSync(".env.example", "utf8")));
    expect(config).toMatchObject({ apiKey: undefined, proxyUrl: undefined, port: 8000, poolSize: 1, loggingEnabled: true });
  });

  test("config comes from the given .env values only", () => {
    const config = loadAppConfig(parseDotEnv("PORT=9000\nPOOL_SIZE=3\nAPI_KEY=k"));
    expect(config).toMatchObject({ port: 9000, poolSize: 3, apiKey: "k", proxyUrl: undefined, loggingEnabled: true });
  });
});
