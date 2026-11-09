// Fork-owned checks (not from upstream): the plugin imports nothing from
// outside its own package, and none of its ids collide with the built-in
// thread list's. See docs/fork.md.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
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

const BUILT_IN_PLUGIN_ID = "thread-list";

// bb's rule (bb-plugin-authoring quickstart, "Plugin id"): the final package
// name component minus `bb-plugin-`, lowercased, non-alphanumeric runs to `-`.
function pluginIdOf(packageName: string): string {
  return packageName
    .split("/")
    .at(-1)!
    .replace(/^bb-plugin-/u, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function runtimeSources(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...runtimeSources(path));
    else if (/\.tsx?$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

describe("runs beside the built-in thread list", () => {
  const pluginId = pluginIdOf(manifest.name);

  it("has its own plugin id, so its CLI, KV namespace and localStorage mirror differ", () => {
    expect(pluginId).toBe("inbox");
    expect(pluginId).not.toBe(BUILT_IN_PLUGIN_ID);
  });

  it("hard-codes no key in the built-in list's namespace", () => {
    const sources = [
      join(root, "app.tsx"),
      join(root, "server.ts"),
      ...runtimeSources(join(root, "app")),
      ...runtimeSources(join(root, "shared")),
    ];
    const literal = new RegExp(
      `["'\`]${BUILT_IN_PLUGIN_ID}(?:/[^"'\`]*)?["'\`]`,
      "gu",
    );
    const hits = sources.flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(literal)].map(
        (match) => `${relative(root, file)}: ${match[0]}`,
      ),
    );
    expect(hits).toEqual([]);
  });

  it("keys its fork-owned row-action ids by its own plugin id", () => {
    const threadRow = readFileSync(join(root, "app/rows/ThreadRow.tsx"), "utf8");
    expect(threadRow).toContain(`"${pluginId}/customizeRowActions"`);
    const preferences = readFileSync(join(root, "shared/preferences.ts"), "utf8");
    expect(preferences).toContain(`move: "${pluginId}/move"`);
  });
});

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
