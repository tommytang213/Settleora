import { describe, expect, it, vi } from "vitest";
import {
  getMissingReportReadMethods,
  loadReportsReadout,
  normalizeReportMonth,
  reportsSearchQuery,
  summarizeReportCounts,
  summarizeReportTotals,
  type ReportsReadoutOptions
} from "./reportsReadout";
import type { MonthlyReportResponse, PersonalBillResponse } from "../../../packages/client-web/src/generated";

const monthlyReport: MonthlyReportResponse = {
  month: "2026-06",
  groupId: null,
  generatedAtUtc: "2026-06-29T00:00:00Z",
  billCount: 2,
  totalByCurrency: [{ currency: "HKD", amount: "220.00" }],
  actorShareByCurrency: [{ currency: "HKD", amount: "110.00" }],
  actorPaidByCurrency: [{ currency: "HKD", amount: "180.00" }],
  reconciliationCounts: [{ status: "unreconciled", count: 2 }],
  settlementRequestCounts: [{ status: "requested", count: 1 }],
  settlementPaymentCounts: [{ status: "marked_paid", count: 1 }]
};

const visibleBill: PersonalBillResponse = {
  id: "bill-1",
  merchantName: "Harbour Market",
  billDate: "2026-06-28",
  status: "confirmed",
  reconciliation: {
    status: "unreconciled",
    updatedAtUtc: null,
    updatedByUserProfileId: null,
    reconciledAtUtc: null,
    note: null
  },
  revisionCreationActions: {
    canCreateRevision: false
  },
  totalAmount: "128.50",
  totalCurrency: "HKD",
  createdAtUtc: "2026-06-28T10:00:00Z",
  updatedAtUtc: "2026-06-28T10:00:00Z",
  items: [],
  participants: [],
  payers: [],
  adjustments: [],
  calculatedAdjustmentAllocations: []
};

describe("reports readout adapter", () => {
  it("does not call generated report or search methods without a verified credential", async () => {
    const client = {
      getMonthlyReport: vi.fn(),
      listPersonalBills: vi.fn()
    };

    await expect(
      loadReportsReadout({
        accessToken: null,
        month: "2026-06",
        client: client as unknown as ReportsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({
      status: "auth_required",
      month: "2026-06",
      searchRows: []
    });
    expect(client.getMonthlyReport).not.toHaveBeenCalled();
    expect(client.listPersonalBills).not.toHaveBeenCalled();
  });

  it("loads monthly report and server-backed bill search rows", async () => {
    const client = {
      getMonthlyReport: vi.fn().mockResolvedValue(monthlyReport),
      listPersonalBills: vi.fn().mockResolvedValue({ bills: [visibleBill] })
    };

    await expect(
      loadReportsReadout({
        accessToken: "session-token",
        month: "2026-06",
        search: "harbour",
        client: client as unknown as ReportsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({
      status: "loaded",
      report: monthlyReport,
      searchRows: [visibleBill]
    });
    expect(client.getMonthlyReport).toHaveBeenCalledWith(
      { accessToken: "session-token" },
      { month: "2026-06", groupId: null }
    );
    expect(client.listPersonalBills).toHaveBeenCalledWith(
      { accessToken: "session-token" },
      { ...reportsSearchQuery, search: "harbour" }
    );
  });

  it("reports unavailable when generated read methods are missing", async () => {
    const result = await loadReportsReadout({
      accessToken: "session-token",
      month: "2026-06",
      client: { getMonthlyReport: vi.fn() }
    });

    expect(result).toMatchObject({
      status: "unavailable",
      missingMethods: ["listPersonalBills"],
      searchRows: []
    });
    expect(getMissingReportReadMethods({})).toEqual(["getMonthlyReport", "listPersonalBills"]);
  });

  it("summarizes only server-returned report fields", () => {
    expect(normalizeReportMonth("2026-06")).toBe("2026-06");
    expect(normalizeReportMonth("not-a-month")).toMatch(/^\d{4}-\d{2}$/);
    expect(summarizeReportTotals(monthlyReport.totalByCurrency)).toEqual([{ label: "HKD", value: "220.00 HKD" }]);
    expect(summarizeReportCounts(monthlyReport.reconciliationCounts)).toEqual([
      { label: "unreconciled", value: "2" }
    ]);
  });
});
