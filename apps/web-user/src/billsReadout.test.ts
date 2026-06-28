import { describe, expect, it, vi } from "vitest";
import {
  billsListQuery,
  filterBillsForPresentation,
  formatMoney,
  loadBillsReadout,
  type BillsReadoutOptions
} from "./billsReadout";
import type { PersonalBillResponse } from "../../../packages/client-web/src/generated";

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

describe("bills readout adapter", () => {
  it("does not call generated bill methods without a verified credential", async () => {
    const client = {
      listPersonalBills: vi.fn()
    };

    await expect(loadBillsReadout({ accessToken: null, client: client as unknown as BillsReadoutOptions["client"] })).resolves.toMatchObject({
      status: "auth_required",
      bills: []
    });
    expect(client.listPersonalBills).not.toHaveBeenCalled();
  });

  it("loads personal bills with bounded read-only list filters", async () => {
    const client = {
      listPersonalBills: vi.fn().mockResolvedValue({ bills: [visibleBill] })
    };

    await expect(
      loadBillsReadout({ accessToken: "session-token", client: client as unknown as BillsReadoutOptions["client"] })
    ).resolves.toMatchObject({
      status: "loaded",
      bills: [visibleBill]
    });
    expect(client.listPersonalBills).toHaveBeenCalledWith({ accessToken: "session-token" }, billsListQuery);
  });

  it("filters only loaded presentation rows", () => {
    expect(formatMoney(visibleBill.totalAmount, visibleBill.totalCurrency)).toBe("128.50 HKD");
    expect(
      filterBillsForPresentation([visibleBill], {
        search: "harbour",
        status: "confirmed",
        reconciliationStatus: "unreconciled"
      })
    ).toEqual([visibleBill]);
    expect(
      filterBillsForPresentation([visibleBill], {
        search: "missing",
        status: "all",
        reconciliationStatus: "all"
      })
    ).toEqual([]);
  });
});
