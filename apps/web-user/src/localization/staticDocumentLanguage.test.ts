/// <reference types="vite/client" />

import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";

describe("static document language", () => {
  it("keeps the English fallback before React mounts", () => {
    expect(indexHtml).toMatch(/<html\s+lang=["']en["']/i);
  });
});

