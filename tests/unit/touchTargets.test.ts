import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Phones first (CLAUDE.md): touch targets are at least 44 px below 768 px. Tailwind's min-h-11 is
// 44 px; anything lower must only apply from md: up (min-h-0 is a layout reset, not a target).
const SMALL_MIN_HEIGHT = /(?<![\w:-])min-h-(?:[1-9]|10)(?![\w.])/g;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(path);
    return e.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("touch targets", () => {
  it("are at least 44 px tall on phones", () => {
    const small = tsxFiles("src").flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) =>
          [...line.matchAll(SMALL_MIN_HEIGHT)].map((m) => `${file}:${i + 1} ${m[0]}`),
        ),
    );
    expect(small).toEqual([]);
  });
});
