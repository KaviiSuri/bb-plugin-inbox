// Fork-owned checks (not from upstream): the plugin imports nothing from
// outside its own package. See docs/fork.md.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const declared = Object.keys({
  ...manifest.dependencies,
  ...manifest.devDependencies,
});
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

function aliasTargetExists(specifier: string): boolean {
  const base = join(root, specifier.slice("@/".length));
  return ["", ".ts", ".tsx", "/index.ts", "/index.tsx"].some((suffix) =>
    existsSync(base + suffix),
  );
}

describe("standalone fork", () => {
  const scan = experimental_scanPublicSdkOnly(root, {
    allow: [
      // `@/*` maps onto the package itself (tsconfig.json paths).
      /^@\//u,
      ...declared.map((name) => new RegExp(`^${escape(name)}(?:/|$)`, "u")),
    ],
  });

  it("imports only the SDK, declared packages and its own files", () => {
    // scripts/ is maintainer tooling, not part of the plugin: it loads
    // upstream's fork helpers from a bb checkout with dynamic imports.
    expect(
      scan.violations.filter((violation) => !violation.file.startsWith("scripts/")),
    ).toEqual([]);
    expect(scan.privateDependencies).toEqual([]);
  });

  it("resolves every @/ import inside the package", () => {
    const specifiers = new Set<string>();
    for (const file of scan.files) {
      const source = readFileSync(join(root, file), "utf8");
      for (const match of source.matchAll(/["'](@\/[^"']+)["']/gu)) {
        specifiers.add(match[1]!);
      }
    }
    expect(specifiers.size).toBeGreaterThan(0);
    expect([...specifiers].filter((specifier) => !aliasTargetExists(specifier))).toEqual(
      [],
    );
  });
});
