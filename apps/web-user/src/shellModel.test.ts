import { describe, expect, it } from "vitest";
import { navItems, safeStatePanels } from "./shellModel";

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
});
