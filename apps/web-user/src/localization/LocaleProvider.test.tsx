import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { App, normalizeRouteId } from "../App";
import { LocaleProvider, useLocalization } from "./LocaleProvider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }

  root = null;
  container?.remove();
  container = null;
  document.documentElement.lang = "en";
  window.history.pushState(null, "", "/");
});

describe("LocaleProvider", () => {
  it("exposes the resolved locale and typed English lookup", async () => {
    function Probe() {
      const { locale, t } = useLocalization();
      return <p>{`${locale}:${t("shell.nav.home.label")}`}</p>;
    }

    await render(
      <LocaleProvider requestedLocale="unsupported">
        <Probe />
      </LocaleProvider>
    );

    expect(container?.textContent).toBe("en:Home");
  });

  it("synchronizes document language without auth or session state", async () => {
    document.documentElement.lang = "unexpected";

    await render(
      <LocaleProvider requestedLocale="zh-Hant">
        <p>Public bootstrap</p>
      </LocaleProvider>
    );

    expect(document.documentElement.lang).toBe("en");
    expect(container?.textContent).toBe("Public bootstrap");
  });

  it("fails deterministically when the hook is used outside its provider", () => {
    function InvalidConsumer() {
      useLocalization();
      return null;
    }

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    expect(() => act(() => root?.render(<InvalidConsumer />))).toThrow(
      "useLocalization must be used within LocaleProvider."
    );
  });

  it("renders ordinary shell navigation from catalog values without raw keys", async () => {
    await render(
      <LocaleProvider>
        <App />
      </LocaleProvider>
    );

    const rendered = container?.textContent ?? "";
    expect(rendered).toContain("Home");
    expect(rendered).toContain("Import / Export");
    expect(rendered).toContain("Profile and payment");
    expect(rendered).toContain("Settle");
    expect(rendered).toContain("Alerts");
    expect(rendered).not.toMatch(/shell\.nav\.|shell\.navigation\./);
    expect(document.querySelector('aside[aria-label="Primary navigation"]')).not.toBeNull();
    expect(document.querySelector('nav[aria-label="Compact navigation"]')).not.toBeNull();
  });

  it("preserves route normalization", () => {
    expect(normalizeRouteId("settle")).toBe("settlements");
    expect(normalizeRouteId("bills")).toBe("bills");
    expect(normalizeRouteId("unknown-route")).toBe("home");
  });
});

async function render(element: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(element);
  });
}

