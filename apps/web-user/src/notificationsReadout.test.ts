import { englishMessages } from "./localization/catalog";
import { translateMessage } from "./localization/locale";
import { describe, expect, it, vi } from "vitest";
import { normalizeRouteId } from "./App";
import {
  collectNotificationTargetFields,
  notificationTemplateKeys,
  resolveNotificationPresentation,
  filterNotificationsForPresentation,
  loadNotificationsReadout,
  notificationsListQuery,
  summarizeNotificationPreferences,
  type NotificationsReadoutOptions
} from "./notificationsReadout";
import {
  SettleoraApiError,
  type InAppNotificationResponse,
  type InAppNotificationSummaryResponse,
  type NotificationPreferenceResponse
} from "../../../packages/client-web/src/generated";

const summary: InAppNotificationSummaryResponse = {
  unreadCount: 2,
  attentionCount: 1,
  urgentCount: 1
};

const preferences: NotificationPreferenceResponse = {
  inAppEnabled: true,
  categories: {
    bills: true,
    settlements: false,
    recurring: true,
    syncSecurity: true
  },
  quietHours: {
    enabled: true,
    startHour: 22,
    endHour: 7
  },
  deliveryTiming: "digest_readout"
};

const unreadSettlementNotification: InAppNotificationResponse = {
  id: "notification-1",
  eventType: "settlement.request_created",
  status: "unread",
  priority: "urgent",
  subjectType: "settlement_request",
  titleKey: "notifications.settlement.request_created.title",
  messageKey: "notifications.settlement.request_created.message",
  safeSummary: "A settlement request is ready for review.",
  actionUrl: "/api/v1/settlement-requests/settlement-1",
  groupId: null,
  expenseBillId: null,
  expenseBillRevisionId: null,
  settlementRequestId: "settlement-1",
  settlementPaymentId: null,
  recurringBillTemplateId: null,
  recurringBillOccurrenceId: null,
  receiptOcrReviewId: null,
  receiptAttachmentFileId: null,
  syncOperationId: null,
  createdAtUtc: "2026-06-28T10:00:00Z",
  readAtUtc: null,
  archivedAtUtc: null
};

const readBillNotification: InAppNotificationResponse = {
  ...unreadSettlementNotification,
  id: "notification-2",
  eventType: "bill.submitted",
  status: "read",
  priority: "normal",
  subjectType: "expense_bill",
  titleKey: "notifications.bill.submitted.title",
  messageKey: "notifications.bill.submitted.message",
  safeSummary: "A bill was submitted.",
  actionUrl: "/api/v1/bills/bill-1",
  expenseBillId: "bill-1",
  settlementRequestId: null,
  createdAtUtc: "2026-06-28T09:00:00Z",
  readAtUtc: "2026-06-28T09:05:00Z"
};

const archivedSyncNotification: InAppNotificationResponse = {
  ...unreadSettlementNotification,
  id: "notification-3",
  eventType: "sync.conflict_detected",
  status: "archived",
  priority: "attention",
  subjectType: "sync_operation",
  titleKey: "notifications.sync.conflict.title",
  messageKey: "notifications.sync.conflict.message",
  safeSummary: "A sync conflict needs review.",
  actionUrl: "/api/v1/sync/operations/sync-1",
  settlementRequestId: null,
  syncOperationId: "sync-1",
  createdAtUtc: "2026-06-28T11:00:00Z",
  archivedAtUtc: "2026-06-28T11:05:00Z"
};

describe("notifications readout adapter", () => {
  it("does not call generated notification reads without a verified credential", async () => {
    const client = {
      listNotifications: vi.fn(),
      getNotificationSummary: vi.fn(),
      getNotificationPreferences: vi.fn()
    };

    const result = await loadNotificationsReadout({
      accessToken: null,
      client: client as unknown as NotificationsReadoutOptions["client"]
    });

    expect(result).toMatchObject({ status: "auth_required", notifications: [] });
    expect(client.listNotifications).not.toHaveBeenCalled();
    expect(client.getNotificationSummary).not.toHaveBeenCalled();
    expect(client.getNotificationPreferences).not.toHaveBeenCalled();
  });

  it("loads notification rows, summary, and preferences through generated read methods only", async () => {
    const client = {
      listNotifications: vi.fn().mockResolvedValue({
        notifications: [unreadSettlementNotification, readBillNotification]
      }),
      getNotificationSummary: vi.fn().mockResolvedValue(summary),
      getNotificationPreferences: vi.fn().mockResolvedValue(preferences),
      markNotificationRead: vi.fn(),
      markAllNotificationsRead: vi.fn(),
      archiveNotification: vi.fn(),
      updateNotificationPreferences: vi.fn()
    };

    const result = await loadNotificationsReadout({
      accessToken: "session-token",
      client: client as unknown as NotificationsReadoutOptions["client"]
    });

    expect(result).toMatchObject({
      status: "loaded",
      notifications: [unreadSettlementNotification, readBillNotification],
      summary,
      preferences
    });
    expect(client.listNotifications).toHaveBeenCalledWith({ accessToken: "session-token" }, notificationsListQuery);
    expect(client.getNotificationSummary).toHaveBeenCalledWith({ accessToken: "session-token" });
    expect(client.getNotificationPreferences).toHaveBeenCalledWith({ accessToken: "session-token" });
    expect(client.markNotificationRead).not.toHaveBeenCalled();
    expect(client.markAllNotificationsRead).not.toHaveBeenCalled();
    expect(client.archiveNotification).not.toHaveBeenCalled();
    expect(client.updateNotificationPreferences).not.toHaveBeenCalled();
  });

  it("shows an unavailable state when generated notification read methods are absent", async () => {
    const result = await loadNotificationsReadout({
      accessToken: "session-token",
      client: {} as NotificationsReadoutOptions["client"]
    });

    expect(result.status).toBe("unavailable");
    expect(result.missingMethods).toEqual([
      "listNotifications",
      "getNotificationSummary",
      "getNotificationPreferences"
    ]);
    expect(result.notifications).toEqual([]);
  });

  it("shows an unavailable state when the generated preference read method is absent", async () => {
    const client = {
      listNotifications: vi.fn(),
      getNotificationSummary: vi.fn(),
      updateNotificationPreferences: vi.fn()
    };

    const result = await loadNotificationsReadout({
      accessToken: "session-token",
      client: client as unknown as NotificationsReadoutOptions["client"]
    });

    expect(result).toMatchObject({
      status: "unavailable",
      missingMethods: ["getNotificationPreferences"],
      notifications: []
    });
    expect(client.listNotifications).not.toHaveBeenCalled();
    expect(client.getNotificationSummary).not.toHaveBeenCalled();
    expect(client.updateNotificationPreferences).not.toHaveBeenCalled();
  });

  it("reports empty, unavailable, session-expired, and error states without fake notifications", async () => {
    await expect(
      loadNotificationsReadout({
        accessToken: "session-token",
        client: {
          listNotifications: vi.fn().mockResolvedValue({ notifications: [] }),
          getNotificationSummary: vi.fn().mockResolvedValue(summary),
          getNotificationPreferences: vi.fn().mockResolvedValue(preferences)
        } as unknown as NotificationsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({ status: "empty", notifications: [], preferences });

    await expect(
      loadNotificationsReadout({
        accessToken: "session-token",
        client: {
          listNotifications: vi.fn().mockRejectedValue(new SettleoraApiError(401, "Unauthorized", {})),
          getNotificationSummary: vi.fn(),
          getNotificationPreferences: vi.fn()
        } as unknown as NotificationsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({ status: "session_expired", notifications: [] });

    await expect(
      loadNotificationsReadout({
        accessToken: "session-token",
        client: {
          listNotifications: vi.fn().mockRejectedValue(new SettleoraApiError(403, "Forbidden", {})),
          getNotificationSummary: vi.fn(),
          getNotificationPreferences: vi.fn()
        } as unknown as NotificationsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({ status: "unavailable", notifications: [] });

    await expect(
      loadNotificationsReadout({
        accessToken: "session-token",
        client: {
          listNotifications: vi.fn().mockRejectedValue(new Error("network")),
          getNotificationSummary: vi.fn(),
          getNotificationPreferences: vi.fn()
        } as unknown as NotificationsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({ status: "error", notifications: [] });
  });

  it("formats notification preference readout from generated response fields", () => {
    expect(summarizeNotificationPreferences(preferences)).toEqual([
      { label: "In-app", value: "Enabled" },
      { label: "Delivery timing", value: "Digest readout" },
      { label: "Quiet hours", value: "22:00 to 07:00" },
      { label: "Bills", value: "Enabled" },
      { label: "Settlements", value: "Disabled" },
      { label: "Recurring", value: "Enabled" },
      { label: "Sync and security", value: "Required" }
    ]);

    expect(
      summarizeNotificationPreferences({
        ...preferences,
        inAppEnabled: false,
        quietHours: { enabled: false, startHour: 0, endHour: 0 },
        deliveryTiming: "immediate"
      })
    ).toEqual(
      expect.arrayContaining([
        { label: "In-app", value: "Disabled" },
        { label: "Delivery timing", value: "Immediate" },
        { label: "Quiet hours", value: "Off" }
      ])
    );
  });

  it("filters and sorts only the returned notification rows", () => {
    const notifications = [readBillNotification, archivedSyncNotification, unreadSettlementNotification];

    expect(
      filterNotificationsForPresentation(notifications, {
        search: "settlement",
        status: "all",
        sort: "newest"
      }).map((notification) => notification.id)
    ).toEqual(["notification-1"]);

    expect(
      filterNotificationsForPresentation(notifications, {
        search: "",
        status: "inbox",
        sort: "priority"
      }).map((notification) => notification.id)
    ).toEqual(["notification-1", "notification-2"]);

    expect(
      filterNotificationsForPresentation(notifications, {
        search: "",
        status: "archived",
        sort: "oldest"
      }).map((notification) => notification.id)
    ).toEqual(["notification-3"]);
  });

  it("keeps related IDs as display-only metadata", () => {
    expect(collectNotificationTargetFields(unreadSettlementNotification)).toEqual([
      { label: "Settlement request", value: "settlement-1" }
    ]);
  });

  it("normalizes the canonical notifications hash route", () => {
    expect(normalizeRouteId("notifications")).toBe("notifications");
    expect(normalizeRouteId("settle")).toBe("settlements");
    expect(normalizeRouteId("unknown")).toBe("home");
  });
});

// Independent approved reference retained before the cross-root fixture failure.
const approvedNotificationMessages = {
  "notifications.bill.submitted.title": "Bill submitted",
  "notifications.bill.participant_accepted.title": "Bill accepted",
  "notifications.bill.participant_rejected.title": "Bill rejected",
  "notifications.bill.confirmed.title": "Bill confirmed",
  "notifications.bill.revision_proposed.title": "Bill revision proposed",
  "notifications.bill.revision_resubmitted.title": "Bill revision resubmitted",
  "notifications.bill.revision_submitted.title": "Bill revision submitted",
  "notifications.bill.revision_withdrawn.title": "Bill revision withdrawn",
  "notifications.bill.revision_approved.title": "Bill revision approved",
  "notifications.bill.revision_rejected.title": "Bill revision rejected",
  "notifications.bill.revision_payer_confirmed.title": "Bill revision payer confirmed",
  "notifications.bill.revision_applied.title": "Bill revision applied",
  "notifications.settlement.request_created.title": "Settlement requested",
  "notifications.settlement.payment_marked_paid.title": "Payment marked paid",
  "notifications.settlement.payment_partially_paid.title": "Partial payment marked paid",
  "notifications.settlement.payment_confirmed.title": "Payment confirmed",
  "notifications.settlement.request_disputed.title": "Settlement disputed",
  "notifications.settlement.payment_disputed.title": "Payment disputed",
  "notifications.settlement.request_cancelled.title": "Settlement cancelled",
  "notifications.settlement.payment_cancelled.title": "Payment cancelled",
  "notifications.settlement.proof_attached.title": "Proof attached",
  "notifications.settlement.residual_review_needed.title": "Settlement review",
  "notifications.recurring_bill.due_soon.title": "Recurring bill due soon",
  "notifications.recurring_bill.draft_generated.title": "Recurring draft generated",
  "notifications.sync.conflict_detected.title": "Sync issue",
  "notifications.sync.operation_failed.title": "Sync issue",
  "notifications.ocr.needs_review.title": "Receipt review",
  "notifications.bill.submitted.message": "Bill",
  "notifications.bill.participant_accepted.message": "Bill",
  "notifications.bill.participant_rejected.message": "Bill",
  "notifications.bill.confirmed.message": "Bill",
  "notifications.bill.revision_proposed.message": "Bill",
  "notifications.bill.revision_resubmitted.message": "Bill",
  "notifications.bill.revision_submitted.message": "Bill",
  "notifications.bill.revision_withdrawn.message": "Bill",
  "notifications.bill.revision_approved.message": "Bill",
  "notifications.bill.revision_rejected.message": "Bill",
  "notifications.bill.revision_payer_confirmed.message": "Bill",
  "notifications.bill.revision_applied.message": "Bill",
  "notifications.settlement.request_created.message": "Settlement request",
  "notifications.settlement.payment_marked_paid.message": "Settlement payment",
  "notifications.settlement.payment_partially_paid.message": "Settlement payment",
  "notifications.settlement.payment_confirmed.message": "Settlement payment",
  "notifications.settlement.request_disputed.message": "Settlement request",
  "notifications.settlement.payment_disputed.message": "Settlement payment",
  "notifications.settlement.request_cancelled.message": "Settlement request",
  "notifications.settlement.payment_cancelled.message": "Settlement payment",
  "notifications.settlement.proof_attached.message": "Settlement payment",
  "notifications.settlement.residual_review_needed.message": "Settlement payment",
  "notifications.recurring_bill.due_soon.message": "Recurring bill",
  "notifications.recurring_bill.draft_generated.message": "Recurring bill",
  "notifications.sync.conflict_detected.message": "Sync issue",
  "notifications.sync.operation_failed.message": "Sync issue",
  "notifications.ocr.needs_review.message": "Receipt review"
} as const;

describe("approved static notification presentation", () => {
  it("matches all 27 admitted event pairs and all 54 approved English strings", () => {
    const expectedKeys = Object.keys(approvedNotificationMessages);
    expect(expectedKeys).toHaveLength(54);
    const events = new Set(expectedKeys.map((key) => key.replace(/^notifications\./, "").replace(/\.(title|message)$/, "")));
    expect(events.size).toBe(27);
    expect([...notificationTemplateKeys].sort()).toEqual(expectedKeys.sort());
    for (const event of events) {
      expect(Object.prototype.hasOwnProperty.call(approvedNotificationMessages, `notifications.${event}.title`)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(approvedNotificationMessages, `notifications.${event}.message`)).toBe(true);
    }
    for (const [key, copy] of Object.entries(approvedNotificationMessages)) {
      expect(englishMessages[key as keyof typeof englishMessages]).toBe(copy);
      const row = { titleKey: key.endsWith(".title") ? key : "", messageKey: key.endsWith(".message") ? key : "", safeSummary: null };
      const shown = resolveNotificationPresentation(row, (k) => translateMessage("en", k));
      expect(key.endsWith(".title") ? shown.title : shown.message).toBe(copy);
    }
    expect(Object.keys(englishMessages).filter((key) => key.startsWith("notifications.")).sort()).toEqual([
      ...expectedKeys, "notifications.fallback.title", "notifications.fallback.message"
    ].sort());
  });

  it("preserves meaningful dynamic safe-summary text before static message fallback", () => {
    const row = { ...unreadSettlementNotification, safeSummary: "  Payment of HKD 42.00 awaits your review on 29 October.  " };
    expect(resolveNotificationPresentation(row, (k) => translateMessage("en", k))).toEqual({
      title: "Settlement requested", message: "Payment of HKD 42.00 awaits your review on 29 October."
    });
    expect(row.safeSummary).toBe("  Payment of HKD 42.00 awaits your review on 29 October.  ");
    const long = "A".repeat(300);
    expect(resolveNotificationPresentation({ ...row, safeSummary: long }, (k) => translateMessage("en", k)).message).toBe("A".repeat(237) + "...");
  });

  it.each([null, undefined, "", "  ", 42, {}, "<img src=x onerror=alert(1)>", "notifications.unknown.message", "bill.submitted", "settlement.payment_confirmed", "sync.future_event", "expense_bill", "Review expense_bill today", "Review expense_bill_revision today", "Use Bearer synthetic.header.signature to authenticate", "secret: hidden", "Authorization: Bearer hidden", "?requestId=opaque", "&id=value", "secret=hidden", "Bearer hidden", "https://invalid.example/", "/api/private", "bad\u0000text", "00000000-0000-0000-0000-000000000001"])(
    "uses safe catalog copy for an unusable summary %j", (summary) => {
      const row = { ...unreadSettlementNotification, safeSummary: summary } as unknown as InAppNotificationResponse;
      expect(resolveNotificationPresentation(row, (k) => translateMessage("en", k)).message).toBe("Settlement request");
    }
  );

  it.each([null, undefined, "", "notifications.future.title", "__proto__", "constructor", "<script>bad</script>", 42, {}])(
    "does not expose unknown or malformed keys %j", (key) => {
      const row = { titleKey: key, messageKey: key, safeSummary: null } as unknown as InAppNotificationResponse;
      expect(resolveNotificationPresentation(row, (k) => translateMessage("en", k))).toEqual({
        title: "Notification", message: "Notification type"
      });
    }
  );

  it("rejects known message/title keys in the wrong field and preserves transport/filter behavior", () => {
    expect(resolveNotificationPresentation({ titleKey: "notifications.bill.submitted.message", messageKey: "notifications.bill.submitted.title", safeSummary: null }, (k) => translateMessage("en", k))).toEqual({
      title: "Notification", message: "Notification type"
    });
    const row = structuredClone(unreadSettlementNotification);
    const before = structuredClone(row);
    resolveNotificationPresentation(row, (k) => translateMessage("en", k));
    expect(row).toEqual(before);
    expect(filterNotificationsForPresentation([row], { search: "settlement.request_created", status: "unread", sort: "newest" })).toEqual([before]);
    expect(collectNotificationTargetFields(row)).toEqual(collectNotificationTargetFields(before));
  });
});

it("preserves ordinary question punctuation in a meaningful safe summary", () => {
  expect(resolveNotificationPresentation({ ...unreadSettlementNotification, safeSummary: "Ready to review this bill?" }, (k) => translateMessage("en", k)).message).toBe("Ready to review this bill?");
});

it.each(["The secretary approved your bill.", "The secret Santa bill is ready.", "The expense bill revision is ready."])("preserves ordinary summary prose %s", (message) => {
  expect(resolveNotificationPresentation({ ...unreadSettlementNotification, safeSummary: message }, (k) => translateMessage("en", k)).message).toBe(message);
});

it("rejects the bounded current transport inventory both alone and embedded", () => {
  const subjects = ["expense_bill", "settlement_request", "settlement_payment", "recurring_bill_occurrence", "receipt_ocr_review", "sync_operation"];
  const keys = Object.keys(approvedNotificationMessages);
  const events = [...new Set(keys.map((key) => key.replace(/^notifications\./, "").replace(/\.(title|message)$/, "")))];
  expect(keys).toHaveLength(54);
  expect(events).toHaveLength(27);
  const identifiers = [...subjects, ...events, ...keys];
  expect(identifiers).toHaveLength(87);
  for (const identifier of identifiers) {
    for (const safeSummary of [identifier, `Review ${identifier} today`]) {
      expect(resolveNotificationPresentation({ ...unreadSettlementNotification, safeSummary }, (k) => translateMessage("en", k)).message).toBe("Settlement request");
    }
  }
});

it.each(["Authenticate with Bearer abcdefghijklmnop to continue.", "The header contains Bearer abcdefghijklmnop.", "Bearer abcdefghijklmnop is the authentication token.", "OAuth Bearer abcdefghijklmnop is required.", "Use Bearer abcdefghijklmnop to authenticate", "Use Bearer abc to authenticate", "Use BEARER ABCDEFGHIJKLMNOP to authenticate", "Use Bearer opaque123value to authenticate", "Use Bearer fake_token_value to authenticate", "Authorization: Bearer hidden", "Use Bearer synthetic.header.signature to authenticate"])("rejects explicit credential-shaped syntax %s", (safeSummary) => {
  expect(resolveNotificationPresentation({ ...unreadSettlementNotification, safeSummary }, (k) => translateMessage("en", k)).message).toBe("Settlement request");
});

it.each(["The secretary approved your bill.", "The secret Santa bill is ready.", "Ready to review this bill?", "The total is < 100 and the payment is > 10."])("preserves ordinary prose and punctuation %s", (message) => {
  expect(resolveNotificationPresentation({ ...unreadSettlementNotification, safeSummary: message }, (k) => translateMessage("en", k)).message).toBe(message);
});


describe("conservative credential-shaped preview policy", () => {
  const t = (key: Parameters<typeof translateMessage>[1]) => translateMessage("en", key);
  it.each(["of", "must", "has", "abcdefghijklmnop", "abc", "opaque123value", "fake_token_value", "synthetic.header.signature", "opaque+slash/value=="])("uses fallback for ambiguous or credential-shaped Bearer value %s at every position", (token) => {
    for (const safeSummary of [`Bearer ${token}`, `Authenticate with Bearer ${token} to continue.`, `The preview contains BEARER ${token}.`]) {
      expect(resolveNotificationPresentation({ ...unreadSettlementNotification, safeSummary }, t).message).toBe("Settlement request");
    }
  });
  it.each(["The bearer-of this bill should review it.", "The secretary approved your bill.", "The secret Santa bill is ready.", "Ready to review this bill?", "A bill is ready for review."])("preserves ordinary prose outside the bounded syntax: %s", (safeSummary) => {
    expect(resolveNotificationPresentation({ ...unreadSettlementNotification, safeSummary }, t).message).toBe(safeSummary);
  });
});
