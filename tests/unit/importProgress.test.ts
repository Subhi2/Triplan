import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { progressPath, readProgress, writeProgress } from "@/server/services/importProgress";

describe("import resume files", () => {
  const dirs: string[] = [];
  const tempDir = () => {
    const dir = mkdtempSync(join(tmpdir(), "import-progress-"));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("writes and reads a region's progress, creating the folder", () => {
    const path = progressPath("places", "goa", join(tempDir(), "nested"));
    expect(path).toMatch(/places-goa\.json$/);
    const progress = {
      startedAt: "2026-10-07 09:30:00+00",
      complete: false,
      elements: 120,
      done: ["[73.680, 14.880, 74.680, 15.880]"],
      split: [],
    };
    writeProgress(path, progress);
    expect(readProgress(path)).toEqual(progress);
  });

  it("reads a missing or broken file as no progress", () => {
    const dir = tempDir();
    expect(readProgress(join(dir, "none.json"))).toBeNull();
    const broken = join(dir, "broken.json");
    writeFileSync(broken, "{ not json");
    expect(readProgress(broken)).toBeNull();
    const wrong = join(dir, "wrong.json");
    writeFileSync(wrong, JSON.stringify({ startedAt: "x", done: "all" }));
    expect(readProgress(wrong)).toBeNull();
  });
});
