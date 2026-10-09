import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The app does not link to its code repository (owner's decision, 2026-10-09): not in the
// footer, the planner or About. The README is where the repository is.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(e.name) ? [path] : [];
  });
}

describe("the app", () => {
  it("links to no code repository", () => {
    const links = sourceFiles("src").flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => /github\.com|gitlab\.com|bitbucket\.org/i.test(line))
        .map((line) => `${file}: ${line.trim()}`),
    );
    expect(links).toEqual([]);
  });
});
