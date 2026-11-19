/** Saves each `/url` response as a JSON file, e.g. `output/20261219-172105_blr-maa_cheapest_pass_3f9a1c.json`. */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SearchEnvelope } from "../routes/url.route";

const fileTimestamp = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
};

/** Writes the envelope to `outputDir` and returns the file path. */
export async function saveSearchOutput(outputDir: string, envelope: SearchEnvelope, requestId: string): Promise<string> {
  const query = envelope.result?.query;
  const route = query ? `${query.from}-${query.to}` : "invalid";
  const sorting = envelope.request.sorting ?? "unknown";
  const fileName = `${fileTimestamp(new Date())}_${route}_${sorting}_${envelope.status}_${requestId}.json`.replace(/[^\w.-]/g, "_");
  await mkdir(outputDir, { recursive: true });
  const filePath = join(outputDir, fileName);
  await Bun.write(filePath, JSON.stringify(envelope, null, 2));
  return filePath;
}
