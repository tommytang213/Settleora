import { describe, expect, it } from "vitest";
import { englishMessages, type MessageKey } from "./catalog";
import { resolveLocale, supportedLocales, translateMessage } from "./locale";

const originalShellMessages = {
  "shell.navigation.primary.ariaLabel": "Primary navigation",
  "shell.navigation.day1.ariaLabel": "Day 1 areas",
  "shell.navigation.more.ariaLabel": "More user areas",
  "shell.navigation.compact.ariaLabel": "Compact navigation",
  "shell.navigation.more.eyebrow": "More",
  "shell.navigation.more.heading": "All functions",
  "shell.nav.home.label": "Home",
  "shell.nav.home.description": "Overview, balances, review queue, and recent activity.",
  "shell.nav.home.action": "Customize quick actions",
  "shell.nav.bills.label": "Bills",
  "shell.nav.bills.description": "Personal and shared bill lists, filters, receipts, and review handoffs.",
  "shell.nav.bills.action": "Add bill",
  "shell.nav.groups.label": "Groups",
  "shell.nav.groups.description": "Group workspaces, member readouts, and read-only group context.",
  "shell.nav.groups.action": "Create group",
  "shell.nav.friends.label": "Friends",
  "shell.nav.friends.description": "Friends, requests, and direct sharing readiness.",
  "shell.nav.friends.action": "Invite friend",
  "shell.nav.settlements.label": "Settlements",
  "shell.nav.settlements.description": "Balances, requests, payment detail checks, proof summaries, and activity.",
  "shell.nav.settlements.action": "Request payment",
  "shell.nav.reports.label": "Reports",
  "shell.nav.reports.description": "Search, filters, monthly summaries, statement-style rows, and exports.",
  "shell.nav.reports.action": "Export report",
  "shell.nav.importExport.label": "Import / Export",
  "shell.nav.importExport.description": "Data portability availability, local backup readiness, and sync status notes.",
  "shell.nav.importExport.action": "Review availability",
  "shell.nav.notifications.label": "Notifications",
  "shell.nav.notifications.description": "Unread queue, preferences, read/archive actions, and linked activity.",
  "shell.nav.notifications.action": "Review notifications",
  "shell.nav.profile.label": "Profile and payment",
  "shell.nav.profile.description": "Profile details, payment previews, visibility, and QR handoffs.",
  "shell.nav.profile.action": "Update profile",
  "shell.nav.security.label": "Account and sessions",
  "shell.nav.security.description": "Session readouts, current device, sign-out actions, and security status.",
  "shell.nav.security.action": "Review sessions",
  "shell.nav.settings.label": "Settings",
  "shell.nav.settings.description": "Appearance, policy readouts, mode choices, and advanced tools.",
  "shell.nav.settings.action": "Open settings",
  "shell.nav.compact.home": "Home",
  "shell.nav.compact.bills": "Bills",
  "shell.nav.compact.groups": "Groups",
  "shell.nav.compact.settlements": "Settle",
  "shell.nav.compact.importExport": "Import",
  "shell.nav.compact.notifications": "Alerts"
} as const;

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
    expect(Object.fromEntries(Object.entries(englishMessages).filter(([key]) => key.startsWith("shell.")))).toEqual(originalShellMessages);
    expect(Object.keys(originalShellMessages)).toHaveLength(45);
    expect(Object.keys(englishMessages).filter((key) => key.startsWith("notifications.") && !key.startsWith("notifications.fallback."))).toHaveLength(54);
    expect(englishMessages["notifications.fallback.title"]).toBe("Notification");
    expect(englishMessages["notifications.fallback.message"]).toBe("Notification type");
    expect(Object.keys(englishMessages)).toHaveLength(101);
  });

  it("fails safely instead of returning an unknown raw key", () => {
    const rawKey = "shell.nav.unknown.label";

    expect(() => translateMessage("en", rawKey as MessageKey)).toThrow(
      "Missing localization message for the resolved locale."
    );
    expect(() => translateMessage("en", rawKey as MessageKey)).not.toThrow(rawKey);
  });
});

