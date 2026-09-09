import { describe, expect, it } from "vitest";
import { translateMessage } from "./localization/locale";
import { dashboardCards, navItems, safeStatePanels } from "./shellModel";

const t = (key: Parameters<typeof translateMessage>[1]) => translateMessage("en", key);

describe("user web shell model", () => {
  it("represents the required Day 1 user destinations", () => {
    expect(navItems.map((item) => t(item.labelKey))).toEqual([
      "Home",
      "Bills",
      "Groups",
      "Friends",
      "Settlements",
      "Reports",
      "Import / Export",
      "Notifications",
      "Profile and payment",
      "Account and sessions",
      "Settings"
    ]);
  });

  it("keeps safe-state copy product-facing", () => {
    const copy = safeStatePanels.map((panel) => `${panel.title} ${panel.body}`).join(" ");

    expect(copy).toContain("Policy disabled");
    expect(copy).not.toMatch(/endpoint|internal id|storage path|stack trace|DTO|generated client/i);
  });

  it("uses context-specific page action labels instead of generic placeholders", () => {
    expect(navItems.map((item) => t(item.actionLabelKey))).toEqual(
      expect.arrayContaining([
        "Add bill",
        "Request payment",
        "Review availability",
        "Review notifications",
        "Update profile"
      ])
    );

    expect(navItems.map((item) => t(item.actionLabelKey)).join(" ")).not.toMatch(/new item/i);
  });

  it("keeps navigation structure, descriptions, and status metadata unchanged", () => {
    expect(navItems.map(({ id, section, status }) => ({ id, section, status }))).toEqual([
      { id: "home", section: "primary", status: "requiresSession" },
      { id: "bills", section: "primary", status: "requiresSession" },
      { id: "groups", section: "primary", status: "requiresSession" },
      { id: "friends", section: "more", status: "placeholder" },
      { id: "settlements", section: "primary", status: "requiresSession" },
      { id: "reports", section: "primary", status: "requiresSession" },
      { id: "import-export", section: "more", status: "placeholder" },
      { id: "notifications", section: "more", status: "requiresSession" },
      { id: "profile", section: "more", status: "requiresSession" },
      { id: "security", section: "more", status: "requiresSession" },
      { id: "settings", section: "more", status: "placeholder" }
    ]);

    expect(navItems.map((item) => t(item.descriptionKey))).toEqual([
      "Overview, balances, review queue, and recent activity.",
      "Personal and shared bill lists, filters, receipts, and review handoffs.",
      "Group workspaces, member readouts, and read-only group context.",
      "Friends, requests, and direct sharing readiness.",
      "Balances, requests, payment detail checks, proof summaries, and activity.",
      "Search, filters, monthly summaries, statement-style rows, and exports.",
      "Data portability availability, local backup readiness, and sync status notes.",
      "Unread queue, preferences, read/archive actions, and linked activity.",
      "Profile details, payment previews, visibility, and QR handoffs.",
      "Session readouts, current device, sign-out actions, and security status.",
      "Appearance, policy readouts, mode choices, and advanced tools."
    ]);
  });

  it("keeps signed-out dashboard readouts private", () => {
    const copy = dashboardCards.map((card) => `${card.label} ${card.value} ${card.detail}`).join(" ");

    expect(copy).toContain("Hidden");
    expect(copy).not.toMatch(/token|endpoint|generated|DTO|debug|stack/i);
  });
});
