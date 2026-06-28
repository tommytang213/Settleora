import { describe, expect, it, vi } from "vitest";
import { normalizeRouteId } from "./App";
import {
  collectNotificationTargetFields,
  filterNotificationsForPresentation,
  loadNotificationsReadout,
  notificationsListQuery,
  type NotificationsReadoutOptions
} from "./notificationsReadout";
import {
  SettleoraApiError,
  type InAppNotificationResponse,
  type InAppNotificationSummaryResponse
} from "../../../packages/client-web/src/generated";

const summary: InAppNotificationSummaryResponse = {
  unreadCount: 2,
  attentionCount: 1,
  urgentCount: 1
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
      getNotificationSummary: vi.fn()
    };

    const result = await loadNotificationsReadout({
      accessToken: null,
      client: client as unknown as NotificationsReadoutOptions["client"]
    });

    expect(result).toMatchObject({ status: "auth_required", notifications: [] });
    expect(client.listNotifications).not.toHaveBeenCalled();
    expect(client.getNotificationSummary).not.toHaveBeenCalled();
  });

  it("loads notification rows and summary through generated read methods only", async () => {
    const client = {
      listNotifications: vi.fn().mockResolvedValue({
        notifications: [unreadSettlementNotification, readBillNotification]
      }),
      getNotificationSummary: vi.fn().mockResolvedValue(summary),
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
      summary
    });
    expect(client.listNotifications).toHaveBeenCalledWith({ accessToken: "session-token" }, notificationsListQuery);
    expect(client.getNotificationSummary).toHaveBeenCalledWith({ accessToken: "session-token" });
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
    expect(result.missingMethods).toEqual(["listNotifications", "getNotificationSummary"]);
    expect(result.notifications).toEqual([]);
  });

  it("reports empty, unavailable, session-expired, and error states without fake notifications", async () => {
    await expect(
      loadNotificationsReadout({
        accessToken: "session-token",
        client: {
          listNotifications: vi.fn().mockResolvedValue({ notifications: [] }),
          getNotificationSummary: vi.fn().mockResolvedValue(summary)
        } as unknown as NotificationsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({ status: "empty", notifications: [] });

    await expect(
      loadNotificationsReadout({
        accessToken: "session-token",
        client: {
          listNotifications: vi.fn().mockRejectedValue(new SettleoraApiError(401, "Unauthorized", {})),
          getNotificationSummary: vi.fn()
        } as unknown as NotificationsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({ status: "session_expired", notifications: [] });

    await expect(
      loadNotificationsReadout({
        accessToken: "session-token",
        client: {
          listNotifications: vi.fn().mockRejectedValue(new SettleoraApiError(403, "Forbidden", {})),
          getNotificationSummary: vi.fn()
        } as unknown as NotificationsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({ status: "unavailable", notifications: [] });

    await expect(
      loadNotificationsReadout({
        accessToken: "session-token",
        client: {
          listNotifications: vi.fn().mockRejectedValue(new Error("network")),
          getNotificationSummary: vi.fn()
        } as unknown as NotificationsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({ status: "error", notifications: [] });
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
