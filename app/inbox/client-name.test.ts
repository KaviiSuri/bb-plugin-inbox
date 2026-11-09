import { describe, expect, it } from "vitest";
import { describeClient } from "./client-name.js";

describe("describeClient", () => {
  it.each([
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      "iPhone · browser",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 bb/0.49.0 Electron/38.0.0",
      "Mac · bb desktop",
    ],
    ["Mozilla/5.0 (Linux; Android 15; Pixel 9)", "Android · browser"],
  ])("names %s", (userAgent, name) => {
    expect(describeClient(userAgent)).toBe(name);
  });
});
