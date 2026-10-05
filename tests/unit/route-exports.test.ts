import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// `next build` rejects a route file that exports anything but handlers and route config, which
// `next dev` and `tsc` let through (a Vercel deploy failed on an exported constant).
const ALLOWED =
  /^export (async )?function (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|^export const (maxDuration|dynamic|revalidate|runtime|preferredRegion|fetchCache|dynamicParams)\b/;

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return routeFiles(path);
    return /^route\.tsx?$/.test(e.name) ? [path] : [];
  });
}

describe("route files", () => {
  it("export only handlers and Next.js route config", () => {
    const bad = routeFiles("src/app").flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.startsWith("export ") && !ALLOWED.test(line))
        .map((line) => `${file}: ${line}`),
    );
    expect(bad).toEqual([]);
  });
});
