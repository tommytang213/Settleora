import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { NotificationReadoutRow } from "./App";
import { LocaleProvider } from "./localization/LocaleProvider";
import type { InAppNotificationResponse } from "../../../packages/client-web/src/generated";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row: InAppNotificationResponse = {
  id: "synthetic-notice", eventType: "bill.submitted", status: "unread", priority: "attention",
  subjectType: "expense_bill", titleKey: "notifications.bill.submitted.title",
  messageKey: "notifications.bill.submitted.message", safeSummary: null,
  actionUrl: "/api/v1/bills/synthetic-bill", groupId: null, expenseBillId: "synthetic-bill",
  expenseBillRevisionId: null, settlementRequestId: null, settlementPaymentId: null,
  recurringBillTemplateId: null, recurringBillOccurrenceId: null, receiptOcrReviewId: null,
  receiptAttachmentFileId: null, syncOperationId: null, createdAtUtc: "2026-10-29T00:00:00Z",
  readAtUtc: null, archivedAtUtc: null
};
let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

async function render(notification: InAppNotificationResponse) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<LocaleProvider><button id="before">Before</button><NotificationReadoutRow notification={notification} /><button id="after">After</button></LocaleProvider>);
  });
  return container;
}

describe("production notification row presentation", () => {
  it("retains complete long readouts and summary without introducing controls or truncating targets", async () => {
    const id = `synthetic-${"a".repeat(120)}`;
    const actionUrl = `/api/v1/bills/${id}`;
    const safeSummary = `Review ${"A".repeat(160)} when ready.`;
    const view = await render({ ...row, expenseBillId: id, actionUrl, safeSummary });
    expect(view.querySelector("article small")?.textContent).toBe(safeSummary);
    expect(view.textContent).toContain(actionUrl);
    expect(view.textContent).toContain(id);
    expect(view.querySelector("article")?.querySelectorAll("button,a,input,select")).toHaveLength(0);
    expect(view.textContent).not.toContain("notifications.");
  });

  it("renders catalog copy without raw keys and keeps read-only targets and focus boundaries", async () => {
    const view = await render(row);
    expect(view.querySelector("article")?.classList.contains("notification-readout-row")).toBe(true);
    expect(view.querySelector("article strong")?.textContent).toBe("Bill submitted");
    expect(view.querySelector("article small")?.textContent).toBe("Bill");
    expect(view.textContent).not.toContain("notifications.");
    expect(view.textContent).not.toContain("Title key");
    expect(view.textContent).not.toContain("Message key");
    expect(view.textContent).toContain(row.actionUrl);
    expect(view.textContent).toContain("synthetic-bill");
    expect(view.querySelector("article")?.querySelectorAll("button,a,input,select")).toHaveLength(0);
    view.querySelector<HTMLButtonElement>("#before")?.focus();
    expect(document.activeElement?.id).toBe("before");
    view.querySelector<HTMLButtonElement>("#after")?.focus();
    expect(document.activeElement?.id).toBe("after");
  });

  it("preserves meaningful dynamic summary without reading amounts or dates into arguments", async () => {
    const view = await render({ ...row, safeSummary: "A bill dated 29 October needs review: HKD 42.00." });
    expect(view.querySelector("article small")?.textContent).toBe("A bill dated 29 October needs review: HKD 42.00.");
    expect(view.textContent).not.toContain("notifications.");
  });

  it("preserves a normal question and hides raw event IDs in the real row", async () => {
    const view = await render({ ...row, safeSummary: "Ready to review this bill?" });
    expect(view.querySelector("article small")?.textContent).toBe("Ready to review this bill?");
    await act(async () => root?.render(<LocaleProvider><NotificationReadoutRow notification={{ ...row, safeSummary: "bill.submitted" }} /></LocaleProvider>));
    expect(view.querySelector("article small")?.textContent).toBe("Bill");
    expect(view.textContent).not.toContain("bill.submitted");
  });

  it("preserves ordinary prose while hiding embedded subject transport IDs", async () => {
    const view = await render({ ...row, safeSummary: "The secretary approved your bill." });
    expect(view.querySelector("article small")?.textContent).toBe("The secretary approved your bill.");
    await act(async () => root?.render(<LocaleProvider><NotificationReadoutRow notification={{ ...row, safeSummary: "Review expense_bill today" }} /></LocaleProvider>));
    expect(view.querySelector("article small")?.textContent).toBe("Bill");
    expect(view.textContent).not.toContain("expense_bill");
  });

  it.each(["The bearer of this bill should review it.", "The bearer must review this bill.", "The bearer has to authenticate before reviewing.", "Authenticate with Bearer abcdefghijklmnop to continue.", "The header contains Bearer abcdefghijklmnop.", "Bearer abcdefghijklmnop is the authentication token.", "Use Bearer abcdefghijklmnop to authenticate", "Use Bearer abc to authenticate", "Review expense_bill_revision today", "Use Bearer synthetic.header.signature to authenticate"])("hides malformed transport and credential-shaped summary text in the real row: %s", async (safeSummary) => {
    const view = await render({ ...row, safeSummary });
    expect(view.querySelector("article small")?.textContent).toBe("Bill");
    expect(view.textContent).not.toContain(safeSummary);
  });

  it.each(["expense_bill", "settlement_request", "settlement_payment", "recurring_bill_occurrence", "receipt_ocr_review", "sync_operation", "Bearer opaque123value", "Bearer fake_token_value"])("keeps the bounded transport/credential inventory out of real-row copy: %s", async (identifier) => {
    const safeSummary = `Review ${identifier} today`;
    const view = await render({ ...row, safeSummary });
    expect(view.querySelector("article small")?.textContent).toBe("Bill");
    expect(view.textContent).not.toContain(safeSummary);
  });

  it.each([
    { ...row, titleKey: "notifications.future.title", messageKey: "notifications.future.message", safeSummary: null },
    { ...row, titleKey: "<img src=x onerror=alert(1)>", messageKey: "<script>bad</script>", safeSummary: "<script>bad</script>" }
  ])("uses safe visible and accessible fallback without creating HTML nodes", async (notification) => {
    const view = await render(notification);
    expect(view.querySelector("article strong")?.textContent).toBe("Notification");
    expect(view.querySelector("article small")?.textContent).toBe("Notification type");
    expect(view.textContent).not.toMatch(/notifications\.|<script|onerror/);
    expect(view.querySelectorAll("script,img,iframe")).toHaveLength(0);
    const accessibleAttributes = [...view.querySelectorAll("[aria-label],[title],[alt]")].map((element) =>
      [element.getAttribute("aria-label"), element.getAttribute("title"), element.getAttribute("alt")].join(" ")
    ).join(" ");
    expect(accessibleAttributes).not.toMatch(/notifications\.|<script|onerror/);
  });
});

