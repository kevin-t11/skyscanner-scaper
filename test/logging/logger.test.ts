import { afterEach, expect, spyOn, test } from "bun:test";
import { createLogger, formatDuration, setLogLevel } from "../../src/logging/logger";

afterEach(() => setLogLevel("info"));

test("formats compact lines with scope and elapsed time", () => {
  const output = spyOn(console, "log").mockImplementation(() => {});
  try {
    createLogger("req abc123", { timed: true }).info("poll 2 · found 143 flights");
    expect(output.mock.calls[0]![0]).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} INFO  \[req abc123 \+0\.\d{2}s\] poll 2 · found 143 flights$/);
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
