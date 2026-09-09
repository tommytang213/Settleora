import { describe, expect, it } from "vitest";
import { englishMessages, type MessageKey } from "./catalog";
import { resolveLocale, supportedLocales, translateMessage } from "./locale";

describe("English localization catalog", () => {
  it("supports only the Day 1 English locale and falls back deterministically", () => {
    expect(supportedLocales).toEqual(["en"]);
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("zh-Hant")).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
  });

  it("returns canonical English through typed message keys", () => {
    expect(translateMessage("en", "shell.nav.home.label")).toBe("Home");
    expect(translateMessage("en", "shell.nav.importExport.label")).toBe("Import / Export");
    expect(Object.keys(englishMessages)).toHaveLength(45);
  });

  it("fails safely instead of returning an unknown raw key", () => {
    const rawKey = "shell.nav.unknown.label";

    expect(() => translateMessage("en", rawKey as MessageKey)).toThrow(
      "Missing localization message for the resolved locale."
    );
    expect(() => translateMessage("en", rawKey as MessageKey)).not.toThrow(rawKey);
  });
});

