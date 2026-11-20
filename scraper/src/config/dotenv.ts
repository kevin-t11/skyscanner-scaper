/** Reads `KEY=value` lines from a `.env` file; the only source of runtime settings. */
import { existsSync, readFileSync } from "node:fs";

/** Missing file → `{}`. Supports `# comments`, inline ` # comments`, quotes and `export KEY=...`. */
export function readDotEnv(path = ".env"): Record<string, string> {
  if (!existsSync(path)) return {};
  return parseDotEnv(readFileSync(path, "utf8"));
}

function parseDotEnv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(rawLine);
    if (!match) continue;
    const [, key, rest] = match as unknown as [string, string, string];
    const quoted = /^(["'])(.*)\1/.exec(rest);
    values[key] = quoted ? quoted[2]! : rest.replace(/(^|\s+)#.*$/, "").trim();
  }
  return values;
}
