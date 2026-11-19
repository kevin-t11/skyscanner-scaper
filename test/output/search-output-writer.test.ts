import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { failEnvelope } from "../../src/routes/url.route";
import { saveSearchOutput } from "../../src/output/search-output-writer";

test("saves the envelope as pretty JSON with a descriptive file name", async () => {
  const dir = await mkdtemp(join(tmpdir(), "search-output-"));
  try {
    const envelope = failEnvelope({ code: "invalid_request", message: "bad" }, 3, { input: { url: "x", sort: "cheapest" } });
    const filePath = await saveSearchOutput(join(dir, "nested"), envelope, "abc123");
    expect(basename(filePath)).toMatch(/^\d{8}-\d{6}_invalid_cheapest_fail_abc123\.json$/);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(envelope);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
