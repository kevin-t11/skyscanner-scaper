/** Monthly cap on paid proxy traffic (both directions), kept in a file so restarts don't reset it. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SAVE_INTERVAL_MS = 10_000;

export class ProxyBudget {
  private month = currentMonth();
  private bytes = 0;
  private savedAt = 0;

  constructor(
    readonly limitBytes: number,
    private readonly file: string,
  ) {}

  async load(): Promise<void> {
    const saved = await readFile(this.file, "utf8").then(JSON.parse).catch(() => undefined);
    if (saved?.month === this.month && Number.isFinite(saved.bytes)) this.bytes = saved.bytes;
  }

  get usedBytes(): number {
    this.rollOver();
    return this.bytes;
  }

  get exhausted(): boolean {
    return this.usedBytes >= this.limitBytes;
  }

  add(bytes: number): void {
    this.rollOver();
    this.bytes += bytes;
    if (Date.now() - this.savedAt > SAVE_INTERVAL_MS) void this.save();
  }

  async save(): Promise<void> {
    this.savedAt = Date.now();
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify({ month: this.month, bytes: this.bytes })).catch(() => undefined);
  }

  private rollOver(): void {
    const month = currentMonth();
    if (month !== this.month) [this.month, this.bytes] = [month, 0];
  }
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
