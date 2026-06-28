import {
  SettleoraApiClient,
  SettleoraApiError,
  type InAppNotificationPriority,
  type InAppNotificationResponse,
  type InAppNotificationStatus,
  type InAppNotificationSummaryResponse,
  type NotificationPreferenceResponse
} from "../../../packages/client-web/src/generated";

export type NotificationsReadoutStatus =
  | "auth_required"
  | "loading"
  | "loaded"
  | "empty"
  | "session_expired"
  | "unavailable"
  | "unsupported"
  | "error";

export type NotificationPresentationFilter = "inbox" | "unread" | "attention" | "archived" | "all";
export type NotificationPresentationSort = "newest" | "oldest" | "priority";

export interface NotificationsReadoutState {
  status: NotificationsReadoutStatus;
  message: string;
  notifications: InAppNotificationResponse[];
  preferences?: NotificationPreferenceResponse;
  summary?: InAppNotificationSummaryResponse;
  missingMethods: string[];
  unsupportedSections: string[];
}

export interface NotificationsReadoutOptions {
  accessToken?: string | null;
  baseUrl?: string;
  client?: Partial<
    Pick<SettleoraApiClient, "listNotifications" | "getNotificationSummary" | "getNotificationPreferences">
  >;
}

export const notificationsListQuery = {
  limit: 50
};

export const notificationUnsupportedSections = [
  "Read, archive, dismiss, and mark-all actions are not available in this web readout.",
  "Email, push, browser permission prompts, subscriptions, quiet-hours delivery, and provider status are outside this slice.",
  "Notification links are shown as server-returned text only; opening any related record must re-check authorization through that record's API."
];

export const notificationPreferenceUnsupportedSections = [
  "Preference controls are read-only here; updating preferences is outside this web slice.",
  "Quiet hours and digest are server-returned preference readouts only and do not prove delivery scheduling.",
  "Email, push, provider readiness, browser permissions, group mute, and admin policy are not exposed by this generated response."
];

export async function loadNotificationsReadout(
  options: NotificationsReadoutOptions
): Promise<NotificationsReadoutState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can show notifications on the web.",
      notifications: [],
      missingMethods: [],
      unsupportedSections: [...notificationUnsupportedSections, ...notificationPreferenceUnsupportedSections]
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });
  const missingMethods = getMissingNotificationReadMethods(client);

  if (missingMethods.length > 0) {
    return {
      status: "unavailable",
      message: "Notification read support is not available in this web client build yet.",
      notifications: [],
      missingMethods,
      unsupportedSections: [...notificationUnsupportedSections, ...notificationPreferenceUnsupportedSections]
    };
  }
  const notificationReadClient = client as Pick<
    SettleoraApiClient,
    "listNotifications" | "getNotificationSummary" | "getNotificationPreferences"
  >;

  try {
    const [list, summary, preferences] = await Promise.all([
      notificationReadClient.listNotifications({ accessToken }, notificationsListQuery),
      notificationReadClient.getNotificationSummary({ accessToken }),
      notificationReadClient.getNotificationPreferences({ accessToken })
    ]);

    if (list.notifications.length === 0) {
      return {
        status: "empty",
        message: "No visible notifications are available for this account yet.",
        notifications: [],
        preferences,
        summary,
        missingMethods: [],
        unsupportedSections: [...notificationUnsupportedSections, ...notificationPreferenceUnsupportedSections]
      };
    }

    return {
      status: "loaded",
      message: `${list.notifications.length} notification${list.notifications.length === 1 ? "" : "s"} loaded from Settleora.`,
      notifications: list.notifications,
      preferences,
      summary,
      missingMethods: [],
      unsupportedSections: [...notificationUnsupportedSections, ...notificationPreferenceUnsupportedSections]
    };
  } catch (error) {
    return toNotificationsReadoutFailure(
      error,
      "Settleora could not load visible notifications. No private notification details were shown."
    );
  }
}

export function getMissingNotificationReadMethods(client: object): string[] {
  return ["listNotifications", "getNotificationSummary", "getNotificationPreferences"].filter((method) => {
    return typeof (client as Record<string, unknown>)[method] !== "function";
  });
}

export function filterNotificationsForPresentation(
  notifications: InAppNotificationResponse[],
  filters: {
    search: string;
    status: NotificationPresentationFilter;
    sort: NotificationPresentationSort;
  }
): InAppNotificationResponse[] {
  const search = filters.search.trim().toLowerCase();

  return notifications
    .filter((notification) => {
      const matchesSearch =
        search.length === 0 ||
        notification.eventType.toLowerCase().includes(search) ||
        notification.subjectType.toLowerCase().includes(search) ||
        notification.titleKey.toLowerCase().includes(search) ||
        notification.messageKey.toLowerCase().includes(search) ||
        (notification.safeSummary ?? "").toLowerCase().includes(search);
      const matchesStatus = matchesNotificationFilter(notification, filters.status);

      return matchesSearch && matchesStatus;
    })
    .sort((left, right) => compareNotifications(left, right, filters.sort));
}

export function summarizeNotificationStatuses(
  notifications: InAppNotificationResponse[]
): Array<{ label: InAppNotificationStatus; count: number }> {
  return countBy(notifications.map((notification) => notification.status)).map(([label, count]) => ({
    label,
    count
  }));
}

export function summarizeNotificationPriorities(
  notifications: InAppNotificationResponse[]
): Array<{ label: InAppNotificationPriority; count: number }> {
  return countBy(notifications.map((notification) => notification.priority)).map(([label, count]) => ({
    label,
    count
  }));
}

export function collectNotificationTargetFields(
  notification: InAppNotificationResponse
): Array<{ label: string; value: string }> {
  return [
    ["Group", notification.groupId],
    ["Bill", notification.expenseBillId],
    ["Bill revision", notification.expenseBillRevisionId],
    ["Settlement request", notification.settlementRequestId],
    ["Settlement payment", notification.settlementPaymentId],
    ["Recurring template", notification.recurringBillTemplateId],
    ["Recurring occurrence", notification.recurringBillOccurrenceId],
    ["OCR review", notification.receiptOcrReviewId],
    ["Receipt attachment", notification.receiptAttachmentFileId],
    ["Sync operation", notification.syncOperationId]
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => ({ label: label as string, value: value as string }));
}

export function summarizeNotificationPreferences(
  preferences?: NotificationPreferenceResponse
): Array<{ label: string; value: string }> {
  if (!preferences) {
    return [];
  }

  return [
    {
      label: "In-app",
      value: preferences.inAppEnabled ? "Enabled" : "Disabled"
    },
    {
      label: "Delivery timing",
      value: preferences.deliveryTiming === "digest_readout" ? "Digest readout" : "Immediate"
    },
    {
      label: "Quiet hours",
      value: preferences.quietHours.enabled
        ? `${formatPreferenceHour(preferences.quietHours.startHour)} to ${formatPreferenceHour(
            preferences.quietHours.endHour
          )}`
        : "Off"
    },
    {
      label: "Bills",
      value: preferences.categories.bills ? "Enabled" : "Disabled"
    },
    {
      label: "Settlements",
      value: preferences.categories.settlements ? "Enabled" : "Disabled"
    },
    {
      label: "Recurring",
      value: preferences.categories.recurring ? "Enabled" : "Disabled"
    },
    {
      label: "Sync and security",
      value: preferences.categories.syncSecurity ? "Required" : "Unavailable"
    }
  ];
}

function formatPreferenceHour(hour: number): string {
  const normalizedHour = Number.isFinite(hour) ? Math.max(0, Math.min(23, Math.trunc(hour))) : 0;

  return `${String(normalizedHour).padStart(2, "0")}:00`;
}

function matchesNotificationFilter(
  notification: InAppNotificationResponse,
  filter: NotificationPresentationFilter
): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "inbox") {
    return notification.status !== "archived";
  }

  if (filter === "attention") {
    return notification.priority === "attention" || notification.priority === "urgent";
  }

  return notification.status === filter;
}

function compareNotifications(
  left: InAppNotificationResponse,
  right: InAppNotificationResponse,
  sort: NotificationPresentationSort
): number {
  if (sort === "oldest") {
    return left.createdAtUtc.localeCompare(right.createdAtUtc);
  }

  if (sort === "priority") {
    const priorityDifference = priorityRank(right.priority) - priorityRank(left.priority);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }
  }

  return right.createdAtUtc.localeCompare(left.createdAtUtc);
}

function priorityRank(priority: InAppNotificationPriority): number {
  if (priority === "urgent") {
    return 3;
  }

  if (priority === "attention") {
    return 2;
  }

  return 1;
}

function countBy<T extends string>(values: T[]): Array<[T, number]> {
  const counts = new Map<T, number>();

  values.forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return Array.from(counts.entries()).sort((left, right) => left[0].localeCompare(right[0]));
}

function toNotificationsReadoutFailure(error: unknown, fallback: string): NotificationsReadoutState {
  const detail = classifyApiFailure(error, fallback);

  return {
    status: detail.status,
    message: detail.message,
    notifications: [],
    missingMethods: [],
    unsupportedSections: [...notificationUnsupportedSections, ...notificationPreferenceUnsupportedSections]
  };
}

function classifyApiFailure(
  error: unknown,
  fallback: string
): { status: Exclude<NotificationsReadoutStatus, "loading" | "loaded" | "empty">; message: string } {
  if (error instanceof SettleoraApiError && error.status === 401) {
    return {
      status: "session_expired",
      message: "Your session could not be verified. Sign in again before opening notifications."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 403) {
    return {
      status: "unavailable",
      message: "This account cannot open the requested notification information."
    };
  }

  return {
    status: "error",
    message: fallback
  };
}
