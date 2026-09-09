import type { MessageKey } from "./localization/catalog";

export type NavSection = "primary" | "more";

export interface NavItem {
  id: string;
  labelKey: MessageKey;
  descriptionKey: MessageKey;
  actionLabelKey: MessageKey;
  section: NavSection;
  status: "available" | "placeholder" | "requiresSession";
}

export const navItems: NavItem[] = [
  {
    id: "home",
    labelKey: "shell.nav.home.label",
    descriptionKey: "shell.nav.home.description",
    actionLabelKey: "shell.nav.home.action",
    section: "primary",
    status: "requiresSession"
  },
  {
    id: "bills",
    labelKey: "shell.nav.bills.label",
    descriptionKey: "shell.nav.bills.description",
    actionLabelKey: "shell.nav.bills.action",
    section: "primary",
    status: "requiresSession"
  },
  {
    id: "groups",
    labelKey: "shell.nav.groups.label",
    descriptionKey: "shell.nav.groups.description",
    actionLabelKey: "shell.nav.groups.action",
    section: "primary",
    status: "requiresSession"
  },
  {
    id: "friends",
    labelKey: "shell.nav.friends.label",
    descriptionKey: "shell.nav.friends.description",
    actionLabelKey: "shell.nav.friends.action",
    section: "more",
    status: "placeholder"
  },
  {
    id: "settlements",
    labelKey: "shell.nav.settlements.label",
    descriptionKey: "shell.nav.settlements.description",
    actionLabelKey: "shell.nav.settlements.action",
    section: "primary",
    status: "requiresSession"
  },
  {
    id: "reports",
    labelKey: "shell.nav.reports.label",
    descriptionKey: "shell.nav.reports.description",
    actionLabelKey: "shell.nav.reports.action",
    section: "primary",
    status: "requiresSession"
  },
  {
    id: "import-export",
    labelKey: "shell.nav.importExport.label",
    descriptionKey: "shell.nav.importExport.description",
    actionLabelKey: "shell.nav.importExport.action",
    section: "more",
    status: "placeholder"
  },
  {
    id: "notifications",
    labelKey: "shell.nav.notifications.label",
    descriptionKey: "shell.nav.notifications.description",
    actionLabelKey: "shell.nav.notifications.action",
    section: "more",
    status: "requiresSession"
  },
  {
    id: "profile",
    labelKey: "shell.nav.profile.label",
    descriptionKey: "shell.nav.profile.description",
    actionLabelKey: "shell.nav.profile.action",
    section: "more",
    status: "requiresSession"
  },
  {
    id: "security",
    labelKey: "shell.nav.security.label",
    descriptionKey: "shell.nav.security.description",
    actionLabelKey: "shell.nav.security.action",
    section: "more",
    status: "requiresSession"
  },
  {
    id: "settings",
    labelKey: "shell.nav.settings.label",
    descriptionKey: "shell.nav.settings.description",
    actionLabelKey: "shell.nav.settings.action",
    section: "more",
    status: "placeholder"
  }
];

export const dashboardCards = [
  {
    label: "You owe",
    value: "Hidden",
    detail: "Balances appear after Settleora verifies your session."
  },
  {
    label: "Owed to you",
    value: "Hidden",
    detail: "Settlement readouts stay private until sign-in."
  },
  {
    label: "Needs review",
    value: "Protected",
    detail: "Bills, receipts, notifications, and conflicts stay hidden until session check passes."
  }
];

export const safeStatePanels = [
  {
    title: "Loading",
    body: "Checking the signed-in session before protected information appears."
  },
  {
    title: "Empty",
    body: "No visible rows are available for this account and filter set."
  },
  {
    title: "Unavailable",
    body: "This information is not available to the current account or server mode."
  },
  {
    title: "Error",
    body: "Settleora could not load this area. No private details were shown."
  },
  {
    title: "Policy disabled",
    body: "This action is not enabled by the current workspace policy."
  }
];
