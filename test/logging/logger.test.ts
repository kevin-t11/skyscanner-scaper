import { afterEach, expect, spyOn, test } from "bun:test";
import { createLogger, formatDuration, parseLoggingEnabled, setLoggingEnabled, setLogLevel } from "../../src/logging/logger";

afterEach(() => {
  setLogLevel("info");
  setLoggingEnabled(true);
});

test("LOGGING=disabled turns every log line off", () => {
  const output = spyOn(console, "log").mockImplementation(() => {});
  const errors = spyOn(console, "error").mockImplementation(() => {});
  try {
    setLoggingEnabled(false);
    createLogger("pool").info("hidden");
    createLogger("pool").error("hidden too");
    expect(output).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  } finally {
    output.mockRestore();
    errors.mockRestore();
  }
});

test("parseLoggingEnabled", () => {
  expect([undefined, "", "enabled", "true"].map(parseLoggingEnabled)).toEqual([true, true, true, true]);
  expect(["disabled", "DISABLED", "false", "off", "0"].map(parseLoggingEnabled)).toEqual([false, false, false, false, false]);
});

test("formats compact lines with scope and elapsed time", () => {
  const output = spyOn(console, "log").mockImplementation(() => {});
  try {
    createLogger("req abc123", { timed: true }).info("poll 2 · found 143 flights");
    expect(output.mock.calls[0]![0]).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} INFO  \[req abc123 \+0\.\d{2}s\] poll 2 · found 143 flights$/);
  } finally {
    output.mockRestore();
  }
});

test("escapes newlines so a message stays on one line", () => {
  const output = spyOn(console, "log").mockImplementation(() => {});
  try {
    createLogger("req abc123").info("url=x\n12:00:00.000 INFO  [server] forged\r\u0007");
    expect(output.mock.calls[0]![0]).toEndWith("url=x\\n12:00:00.000 INFO  [server] forged\\r\\x07");
  } finally {
    output.mockRestore();
  }
});

test("drops lines below the configured level", () => {
  const output = spyOn(console, "log").mockImplementation(() => {});
  try {
    setLogLevel("warn");
    createLogger("pool").info("hidden");
    expect(output).not.toHaveBeenCalled();
  } finally {
    output.mockRestore();
  }
});

test("formatDuration", () => {
  expect(formatDuration(850)).toBe("850ms");
  expect(formatDuration(1234)).toBe("1.23s");
});
