type FrameTone =
  | "action"
  | "loading"
  | "success"
  | "warning"
  | "blocked"
  | "offline"
  | "settings";

type NotificationRow = {
  readonly label: string;
  readonly title: string;
  readonly meta: string;
  readonly state: "Unread" | "Read" | "Selected";
};

type DetailLine = {
  readonly label: string;
  readonly value: string;
};

type NotificationOpenFrame = {
  readonly id: string;
  readonly navContext: "Home" | "Bills" | "Groups" | "Settle" | "More";
  readonly tone: FrameTone;
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly status: string;
  readonly rows?: readonly NotificationRow[];
  readonly details?: readonly DetailLine[];
  readonly callout?: string;
  readonly sheetTitle?: string;
  readonly sheetLines?: readonly string[];
  readonly primaryAction?: string;
  readonly secondaryAction?: string;
};

const navItems = ["Home", "Bills", "Groups", "Settle", "More"] as const;

const frames: readonly NotificationOpenFrame[] = [
  {
    id: "01-inbox-selected-row",
    navContext: "Home",
    tone: "action",
    eyebrow: "Notification Center",
    title: "Needs action",
    body: "Grouped rows keep the top bell entry visible while the selected row opens a safe detail state.",
    status: "Selected row",
    rows: [
      {
        label: "Bill",
        title: "A bill needs review",
        meta: "Shared group - just now",
        state: "Selected"
      },
      {
        label: "Settle",
        title: "A settlement update is available",
        meta: "Settle - 8 min",
        state: "Unread"
      },
      {
        label: "Sync",
        title: "Sync needs attention",
        meta: "This device - earlier",
        state: "Read"
      }
    ],
    callout: "Rows are navigation hints only. Opening starts with a fresh current-user notification read.",
    primaryAction: "Open notification",
    secondaryAction: "Back"
  },
  {
    id: "02-loading-authorized-refetch",
    navContext: "Home",
    tone: "loading",
    eyebrow: "Opening notification",
    title: "Refreshing before details",
    body: "Settleora refreshes the notification, then refreshes the linked target through an authorized resource read before showing detail or actions.",
    status: "Refreshing",
    details: [
      { label: "Step 1", value: "Refresh current-user notification detail" },
      { label: "Step 2", value: "Refresh linked resource for this account" },
      { label: "Step 3", value: "Show only authorized details and actions" }
    ],
    callout: "Cached rows, push payloads, route state, object URLs, and generated-client availability are not authorization.",
    secondaryAction: "Back to notifications"
  },
  {
    id: "03-bill-workflow-revision-open",
    navContext: "Bills",
    tone: "action",
    eyebrow: "Bill notification",
    title: "Bill review is ready",
    body: "The refreshed bill context can show the current workflow or revision state without exposing hidden line details, notes, or private reasons.",
    status: "Needs review",
    details: [
      { label: "Current state", value: "A bill update needs your review" },
      { label: "Visible context", value: "Group and status summary only" },
      { label: "Authority", value: "Allowed actions come from the refreshed bill response" }
    ],
    primaryAction: "Review bill",
    secondaryAction: "Back to notifications"
  },
  {
    id: "04-settlement-request-payment-proof-open",
    navContext: "Settle",
    tone: "action",
    eyebrow: "Settlement notification",
    title: "Settlement update",
    body: "The refreshed settlement readout shows request, payment, or proof status without proof contents, payment handles, QR data, or account details.",
    status: "Review available",
    details: [
      { label: "Current state", value: "Settlement status changed" },
      { label: "Proof", value: "Metadata summary only when authorized" },
      { label: "Actions", value: "No payment action appears until the target read allows it" }
    ],
    primaryAction: "Review settlement",
    secondaryAction: "Back to notifications"
  },
  {
    id: "05-settlement-residual-review-needed",
    navContext: "Settle",
    tone: "warning",
    eyebrow: "settlement.residual_review_needed",
    title: "Review a settlement difference",
    body: "The handoff shows a bounded current-status review prompt. It does not expose residual internals or use notification copy as money truth.",
    status: "Review needed",
    details: [
      { label: "Current state", value: "A settlement difference needs receiver review" },
      { label: "Privacy", value: "No external preview values or payment details" },
      { label: "Authority", value: "The refreshed settlement response decides allowed review actions" }
    ],
    primaryAction: "Review settlement",
    secondaryAction: "Back to notifications"
  },
  {
    id: "06-recurring-due-draft-generated-open",
    navContext: "Bills",
    tone: "action",
    eyebrow: "Recurring bill",
    title: "Recurring bill update",
    body: "The refreshed recurring context can open a due-soon readout or generated draft without exposing raw template payloads.",
    status: "Draft available",
    details: [
      { label: "Current state", value: "Recurring bill has an update" },
      { label: "Generated draft", value: "Open only after authorized bill refresh" },
      { label: "Template", value: "No raw template JSON or hidden participant data" }
    ],
    primaryAction: "Open bill",
    secondaryAction: "Back to notifications"
  },
  {
    id: "07-ocr-needs-review-open",
    navContext: "Bills",
    tone: "warning",
    eyebrow: "ocr.needs_review",
    title: "Receipt review needed",
    body: "The receipt assignment opens as a review prompt without raw OCR text, receipt contents, extracted item lines, file paths, or file bytes.",
    status: "Review receipt",
    details: [
      { label: "Current state", value: "Receipt review is assigned to this account" },
      { label: "Visible context", value: "Bill and receipt status summary only" },
      { label: "Sensitive data", value: "Receipt text and file contents stay out of notification UI" }
    ],
    primaryAction: "Review receipt",
    secondaryAction: "Back to notifications"
  },
  {
    id: "08-sync-conflict-operation-failed-open",
    navContext: "More",
    tone: "warning",
    eyebrow: "Sync notification",
    title: "Sync needs attention",
    body: "The current-actor sync readout avoids queued request bodies, local cache data, paths, hidden server data, and raw payloads.",
    status: "Action needed",
    details: [
      { label: "Current state", value: "A sync issue needs review" },
      { label: "Visible context", value: "Operation status and safe target label" },
      { label: "Authority", value: "Retry or resolution controls require a refreshed allowed state" }
    ],
    primaryAction: "Review sync issue",
    secondaryAction: "Back to notifications"
  },
  {
    id: "09-sign-in-required",
    navContext: "Home",
    tone: "blocked",
    eyebrow: "Server account required",
    title: "Sign in to view this notification",
    body: "The app must establish an authenticated server session before it can refresh the notification or linked target.",
    status: "Sign-in required",
    details: [
      { label: "Before sign-in", value: "Do not show target details" },
      { label: "After sign-in", value: "Refresh notification and target again" }
    ],
    primaryAction: "Sign in",
    secondaryAction: "Back to notifications"
  },
  {
    id: "10-wrong-account-account-switched",
    navContext: "More",
    tone: "blocked",
    eyebrow: "Account changed",
    title: "This item is not available to this account",
    body: "Account mismatch copy stays generic and does not reveal whether a private bill, settlement, OCR review, proof, sync operation, or group exists.",
    status: "Wrong account",
    sheetTitle: "Account options",
    sheetLines: [
      "Switch to the server account that received this notification.",
      "Stay on this account and return to Notification Center."
    ],
    primaryAction: "Switch account",
    secondaryAction: "Back to notifications"
  },
  {
    id: "11-local-only-mode-fallback",
    navContext: "More",
    tone: "blocked",
    eyebrow: "Local-only mode",
    title: "Connect a server account to refresh this notification",
    body: "Server notification targets cannot open in local-only mode. The copy explains the server requirement without implying target existence.",
    status: "Server required",
    details: [
      { label: "Local data", value: "Not used as server authorization" },
      { label: "Next step", value: "Connect server account before refresh" }
    ],
    primaryAction: "Connect server account",
    secondaryAction: "Back to notifications"
  },
  {
    id: "12-offline-server-unavailable",
    navContext: "Home",
    tone: "offline",
    eyebrow: "Connection unavailable",
    title: "Connect to the server to refresh this notification",
    body: "The cached notification remains a retry hint only. Private target details are not rendered as current authorization while offline.",
    status: "Offline",
    details: [
      { label: "Cached row", value: "Hint only" },
      { label: "Target detail", value: "Hidden until server refresh succeeds" }
    ],
    primaryAction: "Retry",
    secondaryAction: "Back to notifications"
  },
  {
    id: "13-stale-missing-target",
    navContext: "Home",
    tone: "blocked",
    eyebrow: "No longer available",
    title: "This notification is no longer available",
    body: "Missing notification or linked target states avoid naming private resources or confirming whether a private target still exists.",
    status: "Unavailable",
    details: [
      { label: "Safe copy", value: "Generic unavailable message" },
      { label: "No leak", value: "No group, file, bill, settlement, or raw target identifiers" }
    ],
    secondaryAction: "Back to notifications"
  },
  {
    id: "14-archived-deleted-restored-target",
    navContext: "Bills",
    tone: "warning",
    eyebrow: "Current target status",
    title: "The item status changed",
    body: "Archived or restored targets show current authorized status. Deleted or unavailable targets use generic unavailable copy.",
    status: "Status changed",
    details: [
      { label: "Archived", value: "Show current archived status if visible" },
      { label: "Restored", value: "Show current restored status if visible" },
      { label: "Deleted", value: "Use generic unavailable copy" }
    ],
    primaryAction: "Open bill",
    secondaryAction: "Back to notifications"
  },
  {
    id: "15-unauthorized-membership-changed",
    navContext: "Groups",
    tone: "blocked",
    eyebrow: "Access changed",
    title: "This item is not available to this account",
    body: "Membership or authorization changes use the same non-enumerating fallback. The frame does not identify the private group or resource.",
    status: "Not available",
    details: [
      { label: "Group membership", value: "Rechecked before display" },
      { label: "Fallback", value: "No private existence confirmation" }
    ],
    secondaryAction: "Back to notifications"
  },
  {
    id: "16-already-resolved-completed",
    navContext: "Settle",
    tone: "success",
    eyebrow: "Resolved notification",
    title: "This item no longer needs action",
    body: "If the refreshed target is visible and complete, stale action buttons are removed while a current readout remains available.",
    status: "Resolved",
    details: [
      { label: "Current state", value: "Action is already complete" },
      { label: "Removed actions", value: "No stale confirm, review, retry, or approve controls" }
    ],
    primaryAction: "Review settlement",
    secondaryAction: "Back to notifications"
  },
  {
    id: "17-push-disabled-provider-unconfigured",
    navContext: "More",
    tone: "settings",
    eyebrow: "Notification settings",
    title: "Push notifications are off for this server",
    body: "Push readiness is a settings/readout state. It is separate from notification-open authorization, and in-app notifications still work after authorized refresh.",
    status: "Push readout",
    details: [
      { label: "Provider", value: "Disabled or setup required" },
      { label: "In-app", value: "Still the source notification surface" },
      { label: "Permission prompt", value: "Do not ask until readiness and user intent exist" }
    ],
    primaryAction: "Notification settings",
    secondaryAction: "Back to notifications"
  },
  {
    id: "18-generic-notification-detail-fallback",
    navContext: "Home",
    tone: "offline",
    eyebrow: "Notification detail",
    title: "Open Settleora to view this notification",
    body: "When the linked resource cannot open safely, the app can show only safe generic metadata from the refreshed notification response.",
    status: "Fallback",
    details: [
      { label: "Shown", value: "Notification title, category, time, and safe status" },
      { label: "Hidden", value: "Private target details and raw route payloads" },
      { label: "Next step", value: "Retry the authorized refresh when available" }
    ],
    primaryAction: "Retry",
    secondaryAction: "Back to notifications"
  }
] as const;

const authorityRules = [
  "Refresh the current-user notification detail before rendering target context.",
  "Refresh the linked bill, settlement, recurring bill, OCR review, or sync operation through its authorized resource path.",
  "Treat notification rows, push payloads, local cache, route state, object URLs, and generated-client availability as hints only.",
  "Use non-enumerating fallbacks for wrong account, authorization loss, missing targets, and membership changes."
] as const;

const privacyRules = [
  "No money values in external previews or lock-screen style copy.",
  "No raw OCR text, receipt contents, extracted item lines, proof contents, payment handles, QR data, private notes, hidden bill details, raw IDs, storage paths, tokens, provider payloads, or developer diagnostics.",
  "Read, archive, and open state remain inbox state only and never mutate source bills, settlements, OCR reviews, recurring drafts, sync operations, storage, audit, auth, or money truth."
] as const;

const styles = `
:root {
  color-scheme: dark;
  background: #070d16;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.notification-open-reference {
  min-height: 100vh;
  background: #070d16;
  background-image:
    linear-gradient(rgba(113, 143, 196, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(113, 143, 196, 0.055) 1px, transparent 1px);
  background-size: 32px 32px;
  color: #f8fbff;
  padding: 34px 20px 42px;
}

.reference-header {
  max-width: 1180px;
  margin: 0 auto 18px;
  display: grid;
  gap: 8px;
}

.reference-kicker {
  color: #c99b55;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.reference-title {
  margin: 0;
  font-size: clamp(26px, 4vw, 38px);
  line-height: 1.08;
  letter-spacing: 0;
}

.reference-summary {
  max-width: 760px;
  margin: 0;
  color: #8190b4;
  font-size: 14px;
  line-height: 1.5;
}

.rule-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  max-width: 1180px;
  margin: 0 auto 18px;
}

.rule-card {
  border: 1px solid rgba(101, 121, 166, 0.28);
  border-radius: 20px;
  background: rgba(16, 25, 43, 0.78);
  padding: 14px 16px;
}

.rule-card h2 {
  margin: 0 0 8px;
  color: #ffffff;
  font-size: 14px;
}

.rule-card ul {
  margin: 0;
  padding-left: 18px;
  color: #9da9cc;
  line-height: 1.48;
  font-size: 12px;
}

.frame-index {
  max-width: 1180px;
  margin: 0 auto 24px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.frame-index a {
  color: #9eb2dd;
  text-decoration: none;
  border: 1px solid rgba(101, 121, 166, 0.34);
  border-radius: 999px;
  padding: 7px 10px;
  background: rgba(28, 40, 68, 0.72);
  font-size: 12px;
}

.phone-grid {
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(326px, 1fr));
  gap: 24px;
  align-items: start;
}

.phone-frame {
  width: min(100%, 390px);
  min-height: 844px;
  margin: 0 auto;
  border-radius: 36px;
  padding: 5px;
  background: #121b2a;
  border: 1px solid rgba(91, 111, 153, 0.45);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.46);
}

.phone-screen {
  min-height: 832px;
  border-radius: 32px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #0b1220;
  border: 1px solid rgba(255, 255, 255, 0.035);
}

.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 48px;
  padding: 9px 25px 2px;
  color: #ffffff;
  font-size: 14px;
  font-weight: 850;
}

.system-icons {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #d9e2f7;
  font-size: 10px;
}

.dynamic-island {
  width: 128px;
  height: 34px;
  border-radius: 999px;
  background: #02040a;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-height: 54px;
  padding: 6px 22px 12px;
  border-bottom: 1px solid rgba(77, 91, 126, 0.32);
}

.top-title {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
  color: #ffffff;
  font-size: 18px;
  font-weight: 900;
}

.back-mark {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  color: #dda85c;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bell,
.filter-button {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  border: 1px solid rgba(91, 111, 153, 0.42);
  display: grid;
  place-items: center;
  color: #9eb2dd;
  background: #182541;
  font-size: 18px;
  font-weight: 850;
}

.icon {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.bell {
  position: relative;
}

.bell::after {
  content: "";
  position: absolute;
  top: 8px;
  right: 9px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #f05d69;
  border: 2px solid #182541;
}

.content {
  flex: 1;
  overflow: hidden auto;
  padding: 16px 22px 18px;
}

.filter-chips {
  display: flex;
  gap: 8px;
  margin: 0 -22px 20px 0;
  overflow: hidden;
}

.filter-chip {
  white-space: nowrap;
  min-height: 34px;
  border-radius: 999px;
  padding: 8px 13px;
  color: #94a7d2;
  border: 1px solid rgba(101, 121, 166, 0.48);
  background: #182541;
  font-size: 13px;
  font-weight: 700;
}

.filter-chip.active {
  color: #e6a95b;
  background: rgba(111, 83, 47, 0.34);
  border-color: rgba(221, 168, 92, 0.58);
}

.eyebrow {
  margin-top: 2px;
  color: #6680b6;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.phone-title {
  margin: 8px 0 8px;
  color: #ffffff;
  font-size: 22px;
  line-height: 1.16;
  letter-spacing: 0;
}

.body-copy {
  margin: 0 0 14px;
  color: #8190b4;
  line-height: 1.45;
  font-size: 14px;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  min-height: 34px;
  border-radius: 999px;
  padding: 0 13px;
  font-size: 12px;
  font-weight: 800;
  color: #e6a95b;
  background: rgba(111, 83, 47, 0.38);
  border: 1px solid rgba(221, 168, 92, 0.58);
}

.tone-warning .status-chip { color: #f7b955; background: rgba(111, 83, 47, 0.42); border-color: rgba(247, 185, 85, 0.55); }
.tone-blocked .status-chip { color: #f2757d; background: rgba(78, 34, 46, 0.48); border-color: rgba(242, 117, 125, 0.5); }
.tone-offline .status-chip { color: #9eb2dd; background: rgba(38, 54, 91, 0.58); border-color: rgba(101, 121, 166, 0.6); }
.tone-success .status-chip { color: #59d49a; background: rgba(25, 70, 67, 0.5); border-color: rgba(89, 212, 154, 0.48); }
.tone-settings .status-chip { color: #9eb2dd; background: rgba(38, 54, 91, 0.58); border-color: rgba(101, 121, 166, 0.6); }

.notification-list,
.detail-card,
.callout,
.bottom-sheet {
  margin-top: 16px;
  border-radius: 18px;
  border: 1px solid rgba(77, 91, 126, 0.7);
  background: #121b2d;
}

.notification-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  padding: 14px 12px;
  border-bottom: 1px solid rgba(77, 91, 126, 0.48);
}

.notification-row:last-child { border-bottom: 0; }
.notification-row.selected {
  position: relative;
  background: rgba(221, 168, 92, 0.08);
}

.notification-row.selected::before {
  content: "";
  position: absolute;
  left: -1px;
  top: 14px;
  bottom: 14px;
  width: 4px;
  border-radius: 999px;
  background: #dda85c;
}

.row-source {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: #dda85c;
  background: rgba(111, 83, 47, 0.34);
  font-size: 10px;
  font-weight: 900;
}

.row-title {
  margin: 0 0 5px;
  color: #ffffff;
  font-size: 15px;
  font-weight: 900;
  line-height: 1.18;
}

.row-meta {
  margin: 0;
  color: #6680b6;
  font-size: 12px;
  line-height: 1.35;
}

.row-state {
  align-self: start;
  border-radius: 999px;
  padding: 5px 9px;
  color: #9eb2dd;
  background: #1b2946;
  font-size: 11px;
  font-weight: 700;
}

.detail-card {
  padding: 4px 0;
}

.detail-line {
  display: grid;
  gap: 5px;
  padding: 13px 15px;
  border-bottom: 1px solid rgba(77, 91, 126, 0.48);
}

.detail-line:last-child { border-bottom: 0; }

.detail-label {
  color: #6680b6;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.detail-value {
  color: #f8fbff;
  font-size: 13px;
  line-height: 1.4;
}

.callout {
  padding: 13px 14px;
  color: #d9e2f7;
  font-size: 13px;
  line-height: 1.42;
  border-color: rgba(221, 168, 92, 0.45);
  background: rgba(111, 83, 47, 0.22);
}

.bottom-sheet {
  padding: 16px;
  background: #121b2d;
  box-shadow: 0 -18px 48px rgba(0, 0, 0, 0.28);
}

.bottom-sheet h3 {
  margin: 0 0 8px;
  color: #ffffff;
  font-size: 16px;
}

.bottom-sheet p {
  margin: 8px 0 0;
  color: #9da9cc;
  font-size: 13px;
  line-height: 1.4;
}

.action-bar {
  display: flex;
  gap: 10px;
  padding: 12px 22px 14px;
  border-top: 1px solid rgba(77, 91, 126, 0.42);
  background: #121b2d;
}

.primary-button,
.secondary-button {
  flex: 1;
  min-width: 0;
  min-height: 54px;
  border-radius: 14px;
  border: 0;
  font: inherit;
  font-weight: 850;
  font-size: 14px;
}

.primary-button {
  color: #06101c;
  background: #dda85c;
}

.secondary-button {
  color: #9eb2dd;
  background: #1b2946;
  border: 1px solid rgba(101, 121, 166, 0.48);
}

.bottom-nav {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin: 0 22px 22px;
  padding: 8px;
  border: 1px solid rgba(77, 91, 126, 0.62);
  border-radius: 28px;
  background: #101827;
}

.nav-item {
  min-height: 56px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 3px;
  color: #506793;
  font-size: 11px;
  font-weight: 800;
}

.nav-item .icon {
  width: 18px;
  height: 18px;
}

.nav-item.active {
  color: #dda85c;
  background: rgba(111, 83, 47, 0.34);
  border: 1px solid rgba(221, 168, 92, 0.38);
}

@media (max-width: 760px) {
  .notification-open-reference {
    padding: 22px 10px 34px;
  }

  .rule-grid {
    grid-template-columns: 1fr;
  }

  .action-bar {
    display: grid;
  }
}
`;

function ToneClass({ tone }: { readonly tone: FrameTone }) {
  return `phone-screen tone-${tone}`;
}

type IconName = "back" | "bell" | "filter" | "home" | "bill" | "groups" | "settle" | "more";

function Icon({ name }: { readonly name: IconName }) {
  const paths: Record<IconName, readonly string[]> = {
    back: ["M15 18l-6-6 6-6"],
    bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9", "M10 21h4"],
    filter: ["M4 7h16", "M7 12h10", "M10 17h4"],
    home: ["M4 11l8-7 8 7", "M6 10v10h12V10", "M10 20v-6h4v6"],
    bill: ["M7 3h8l3 3v15H7z", "M9 10h6", "M9 14h6", "M9 18h4"],
    groups: ["M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6", "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6", "M3 20a5 5 0 0 1 10 0", "M11 20a5 5 0 0 1 10 0"],
    settle: ["M7 7h10", "M13 3l4 4-4 4", "M17 17H7", "M11 13l-4 4 4 4"],
    more: ["M5 5h5v5H5z", "M14 5h5v5h-5z", "M5 14h5v5H5z", "M14 14h5v5h-5z"]
  };

  return (
    <svg aria-hidden="true" className="icon" fill="none" viewBox="0 0 24 24">
      {paths[name].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}

function NavIcon({ item }: { readonly item: (typeof navItems)[number] }) {
  const icon = {
    Home: "home",
    Bills: "bill",
    Groups: "groups",
    Settle: "settle",
    More: "more"
  }[item] as IconName;

  return <Icon name={icon} />;
}

function FramePhone({ frame }: { readonly frame: NotificationOpenFrame }) {
  return (
    <article className="phone-frame" id={frame.id}>
      <div className={ToneClass({ tone: frame.tone })}>
        <div className="status-bar" aria-hidden="true">
          <span>9:41</span>
          <span className="dynamic-island" />
          <span className="system-icons">||| Wi Fi []</span>
        </div>

        <header className="top-bar">
          <div className="top-title">
            <span className="back-mark" aria-hidden="true"><Icon name="back" /></span>
            <span>{frame.id === "01-inbox-selected-row" ? "Notifications" : "Notification detail"}</span>
          </div>
          <div className="top-actions">
            <div className="bell" aria-label="Notifications"><Icon name="bell" /></div>
            {frame.id === "01-inbox-selected-row" ? (
              <div className="filter-button" aria-label="Filter notifications"><Icon name="filter" /></div>
            ) : null}
          </div>
        </header>

        <main className="content">
          {frame.id === "01-inbox-selected-row" ? (
            <div className="filter-chips" aria-label="Notification filters">
              <span className="filter-chip active">All</span>
              <span className="filter-chip">Needs action</span>
              <span className="filter-chip">Bills</span>
              <span className="filter-chip">Groups</span>
              <span className="filter-chip">Settle</span>
            </div>
          ) : null}

          <div className="eyebrow">{frame.eyebrow}</div>
          <h2 className="phone-title">{frame.title}</h2>
          <p className="body-copy">{frame.body}</p>
          <div className="status-chip">{frame.status}</div>

          {frame.rows ? (
            <div className="notification-list">
              {frame.rows.map((row) => (
                <div
                  className={`notification-row ${row.state === "Selected" ? "selected" : ""}`}
                  key={`${frame.id}-${row.title}`}
                >
                  <div className="row-source">{row.label}</div>
                  <div>
                    <p className="row-title">{row.title}</p>
                    <p className="row-meta">{row.meta}</p>
                  </div>
                  <div className="row-state">{row.state}</div>
                </div>
              ))}
            </div>
          ) : null}

          {frame.details ? (
            <div className="detail-card">
              {frame.details.map((detail) => (
                <div className="detail-line" key={`${frame.id}-${detail.label}`}>
                  <span className="detail-label">{detail.label}</span>
                  <span className="detail-value">{detail.value}</span>
                </div>
              ))}
            </div>
          ) : null}

          {frame.callout ? <div className="callout">{frame.callout}</div> : null}

          {frame.sheetTitle ? (
            <div className="bottom-sheet">
              <h3>{frame.sheetTitle}</h3>
              {frame.sheetLines?.map((line) => (
                <p key={`${frame.id}-${line}`}>{line}</p>
              ))}
            </div>
          ) : null}
        </main>

        <div className="action-bar">
          {frame.primaryAction ? (
            <button className="primary-button" type="button">
              {frame.primaryAction}
            </button>
          ) : null}
          {frame.secondaryAction ? (
            <button className="secondary-button" type="button">
              {frame.secondaryAction}
            </button>
          ) : null}
        </div>

        <nav className="bottom-nav" aria-label="Primary mobile navigation">
          {navItems.map((item) => (
            <div className={`nav-item ${item === frame.navContext ? "active" : ""}`} key={item}>
              <NavIcon item={item} />
              {item}
            </div>
          ))}
        </nav>
      </div>
    </article>
  );
}

export default function NotificationOpenReference() {
  return (
    <section className="notification-open-reference">
      <style>{styles}</style>

      <header className="reference-header">
        <div className="reference-kicker">#371 repo-native TSX reference</div>
        <h1 className="reference-title">Notification-open mobile states</h1>
        <p className="reference-summary">
          Static Settleora Midnight reference frames for notification opens and
          fallbacks. This replaces the Figma-token path for review only and does
          not implement Flutter routes, API behavior, generated clients, schema,
          notification writers, provider delivery, or money authority.
        </p>
      </header>

      <div className="rule-grid">
        <section className="rule-card" aria-labelledby="authority-rules">
          <h2 id="authority-rules">Authority Rules</h2>
          <ul>
            {authorityRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>
        <section className="rule-card" aria-labelledby="privacy-rules">
          <h2 id="privacy-rules">Privacy Rules</h2>
          <ul>
            {privacyRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>
      </div>

      <nav className="frame-index" aria-label="Frame index">
        {frames.map((frame) => (
          <a href={`#${frame.id}`} key={frame.id}>
            {frame.id.replace(/^\d+-/, "")}
          </a>
        ))}
      </nav>

      <div className="phone-grid">
        {frames.map((frame) => (
          <FramePhone frame={frame} key={frame.id} />
        ))}
      </div>
    </section>
  );
}

export { frames };
