export type NavSection = "primary" | "more";

export interface NavItem {
  id: string;
  label: string;
  description: string;
  actionLabel: string;
  section: NavSection;
  status: "available" | "placeholder" | "requiresSession";
}

export const navItems: NavItem[] = [
  {
    id: "home",
    label: "Home",
    description: "Overview, balances, review queue, and recent activity.",
    actionLabel: "Customize quick actions",
    section: "primary",
    status: "requiresSession"
  },
  {
    id: "bills",
    label: "Bills",
    description: "Personal and shared bill lists, filters, receipts, and review handoffs.",
    actionLabel: "Add bill",
    section: "primary",
    status: "requiresSession"
  },
  {
    id: "groups",
    label: "Groups",
    description: "Group workspaces, member readouts, and read-only group context.",
    actionLabel: "Create group",
    section: "primary",
    status: "requiresSession"
  },
  {
    id: "friends",
    label: "Friends",
    description: "Friends, requests, and direct sharing readiness.",
    actionLabel: "Invite friend",
    section: "more",
    status: "placeholder"
  },
  {
    id: "settlements",
    label: "Settlements",
    description: "Balances, requests, payment detail checks, proof summaries, and activity.",
    actionLabel: "Request payment",
    section: "primary",
    status: "requiresSession"
  },
  {
    id: "reports",
    label: "Reports",
    description: "Search, filters, monthly summaries, statement-style rows, and exports.",
    actionLabel: "Export report",
    section: "primary",
    status: "requiresSession"
  },
  {
    id: "import-export",
    label: "Import and export",
    description: "Staged import, scoped export, local backup, and restore readiness.",
    actionLabel: "Start staged import",
    section: "more",
    status: "placeholder"
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Unread queue, preferences, read/archive actions, and linked activity.",
    actionLabel: "Review notifications",
    section: "more",
    status: "requiresSession"
  },
  {
    id: "profile",
    label: "Profile and payment",
    description: "Profile details, payment previews, visibility, and QR handoffs.",
    actionLabel: "Update profile",
    section: "more",
    status: "requiresSession"
  },
  {
    id: "security",
    label: "Account and sessions",
    description: "Session readouts, current device, sign-out actions, and security status.",
    actionLabel: "Review sessions",
    section: "more",
    status: "requiresSession"
  },
  {
    id: "settings",
    label: "Settings",
    description: "Appearance, policy readouts, mode choices, and advanced tools.",
    actionLabel: "Open settings",
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
