import { describe, expect, it } from "vitest";
import { dashboardCards, navItems, safeStatePanels } from "./shellModel";

describe("user web shell model", () => {
  it("represents the required Day 1 user destinations", () => {
    expect(navItems.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        "Home",
        "Bills",
        "Groups",
        "Friends",
        "Settle",
        "Reports",
        "Import and export",
        "Notifications",
        "Profile and payment",
        "Account and sessions",
        "Settings"
      ])
    );
  });

  it("keeps safe-state copy product-facing", () => {
    const copy = safeStatePanels.map((panel) => `${panel.title} ${panel.body}`).join(" ");

    expect(copy).toContain("Policy disabled");
    expect(copy).not.toMatch(/endpoint|internal id|storage path|stack trace|DTO|generated client/i);
  });

  it("uses context-specific page action labels instead of generic placeholders", () => {
    expect(navItems.map((item) => item.actionLabel)).toEqual(
      expect.arrayContaining(["Add bill", "Request payment", "Review notifications", "Update profile"])
    );

    expect(navItems.map((item) => item.actionLabel).join(" ")).not.toMatch(/new item/i);
  });

  it("keeps signed-out dashboard readouts private", () => {
    const copy = dashboardCards.map((card) => `${card.label} ${card.value} ${card.detail}`).join(" ");

    expect(copy).toContain("Hidden");
    expect(copy).not.toMatch(/token|endpoint|generated|DTO|debug|stack/i);
  });
});
