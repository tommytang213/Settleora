import { describe, expect, it, vi } from "vitest";
import {
  filterSettlementsForPresentation,
  getSettlementCounterpartyUserProfileId,
  loadSettlementDetailReadout,
  loadSettlementsReadout,
  summarizeCounterpartyPaymentDetails,
  summarizeBalanceDirections,
  summarizeSettlementStatuses,
  type SettlementsReadoutOptions
} from "./settlementsReadout";
import {
  SettleoraApiError,
  type SettlementCounterpartyPaymentDetailsResponse,
  type SettlementRequestResponse
} from "../../../packages/client-web/src/generated";

const visibleSettlement: SettlementRequestResponse = {
  id: "settlement-1",
  sourceExpenseBillId: "bill-1",
  groupId: null,
  debtorUserProfileId: "debtor-1",
  creditorUserProfileId: "creditor-1",
  amount: "128.50",
  currency: "HKD",
  status: "requested",
  requestedByUserProfileId: "creditor-1",
  requestedAtUtc: "2026-06-28T10:00:00Z",
  createdAtUtc: "2026-06-28T10:00:00Z",
  updatedAtUtc: "2026-06-28T10:00:00Z",
  lines: [
    {
      id: "line-1",
      sourceExpenseBillId: "bill-1",
      sourceBillRevisionId: null,
      sourceCandidateKey: "candidate-1",
      exactAmount: "128.50",
      currency: "HKD",
      allocationOrder: 1,
      status: "open",
      createdAtUtc: "2026-06-28T10:00:00Z",
      updatedAtUtc: "2026-06-28T10:00:00Z"
    }
  ]
};

const confirmedSettlement: SettlementRequestResponse = {
  ...visibleSettlement,
  id: "settlement-2",
  status: "confirmed"
};

const counterpartyPaymentDetails: SettlementCounterpartyPaymentDetailsResponse = {
  userProfileId: "creditor-1",
  isConfigured: true,
  preferredMethodLabel: "FPS",
  paymentHandle: "creditor@example.test",
  paymentNote: "Use the settlement reference",
  visibilityApplied: "settlement_counterparties_only",
  qrFile: {
    id: "qr-file-1",
    contentType: "image/png",
    sizeBytes: 2048,
    updatedAtUtc: "2026-06-28T10:20:00Z"
  }
};

describe("settlements readout adapter", () => {
  it("does not call generated settlement methods without a verified credential", async () => {
    const client = {
      listSettlementBalanceProjections: vi.fn(),
      listSettlementRequests: vi.fn()
    };

    await expect(
      loadSettlementsReadout({ accessToken: null, client: client as unknown as SettlementsReadoutOptions["client"] })
    ).resolves.toMatchObject({
      status: "auth_required",
      settlements: []
    });
    expect(client.listSettlementBalanceProjections).not.toHaveBeenCalled();
    expect(client.listSettlementRequests).not.toHaveBeenCalled();
  });

  it("loads settlement requests and balances through generated client read methods", async () => {
    const client = {
      listSettlementBalanceProjections: vi.fn().mockResolvedValue({
        generatedAtUtc: "2026-06-28T10:00:00Z",
        balances: [
          {
            counterpartyUserProfileId: "creditor-1",
            groupId: null,
            direction: "outgoing",
            currency: "HKD",
            selectedLineAmount: "128.50",
            pendingClaimedAmount: "0.00",
            confirmedClearedAmount: "0.00",
            remainingUnclaimedAmount: "128.50",
            confirmedRemainingResidualAmount: "0.00",
            waivedResidualAmount: "0.00",
            creditResidualAmount: "0.00",
            requestCount: 1,
            lineCount: 1,
            pendingPaymentCount: 0,
            confirmedPaymentCount: 0
          }
        ]
      }),
      listSettlementRequests: vi.fn().mockResolvedValue({ settlements: [visibleSettlement] })
    };

    await expect(
      loadSettlementsReadout({ accessToken: "session-token", client: client as unknown as SettlementsReadoutOptions["client"] })
    ).resolves.toMatchObject({
      status: "loaded",
      settlements: [visibleSettlement]
    });
    expect(client.listSettlementBalanceProjections).toHaveBeenCalledWith({ accessToken: "session-token" });
    expect(client.listSettlementRequests).toHaveBeenCalledWith({ accessToken: "session-token" });
  });

  it("loads selected settlement detail and payments through generated client read methods", async () => {
    const client = {
      getSettlementRequest: vi.fn().mockResolvedValue(visibleSettlement),
      listSettlementPayments: vi.fn().mockResolvedValue({ payments: [] }),
      getSettlementCounterpartyPaymentDetails: vi.fn().mockResolvedValue(counterpartyPaymentDetails),
      getSettlementCounterpartyPaymentDetailsQrContent: vi.fn()
    };

    await expect(
      loadSettlementDetailReadout({
        accessToken: "session-token",
        currentUserProfileId: "debtor-1",
        settlementId: visibleSettlement.id,
        client: client as unknown as SettlementsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({
      status: "loaded",
      settlement: visibleSettlement,
      payments: { payments: [] },
      counterpartyPaymentDetails: {
        status: "loaded",
        counterpartyUserProfileId: "creditor-1",
        details: counterpartyPaymentDetails
      }
    });
    expect(client.getSettlementRequest).toHaveBeenCalledWith(visibleSettlement.id, {
      accessToken: "session-token"
    });
    expect(client.listSettlementPayments).toHaveBeenCalledWith(visibleSettlement.id, {
      accessToken: "session-token"
    });
    expect(client.getSettlementCounterpartyPaymentDetails).toHaveBeenCalledWith(
      visibleSettlement.id,
      "creditor-1",
      { accessToken: "session-token" }
    );
    expect(client.getSettlementCounterpartyPaymentDetailsQrContent).not.toHaveBeenCalled();
  });

  it("does not call counterparty payment detail reads without a matching settlement-scoped context", async () => {
    const client = {
      getSettlementRequest: vi.fn().mockResolvedValue(visibleSettlement),
      listSettlementPayments: vi.fn().mockResolvedValue({ payments: [] }),
      getSettlementCounterpartyPaymentDetails: vi.fn()
    };

    await expect(
      loadSettlementDetailReadout({
        accessToken: "session-token",
        currentUserProfileId: "unrelated-profile",
        settlementId: visibleSettlement.id,
        client: client as unknown as SettlementsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({
      status: "loaded",
      counterpartyPaymentDetails: {
        status: "unavailable"
      }
    });
    expect(client.getSettlementCounterpartyPaymentDetails).not.toHaveBeenCalled();
  });

  it("filters and summarizes only returned presentation rows", () => {
    expect(filterSettlementsForPresentation([visibleSettlement, confirmedSettlement], "outstanding")).toEqual([
      visibleSettlement
    ]);
    expect(filterSettlementsForPresentation([visibleSettlement, confirmedSettlement], "cleared")).toEqual([
      confirmedSettlement
    ]);
    expect(summarizeSettlementStatuses([visibleSettlement])).toEqual([{ label: "Requested", count: 1 }]);
    expect(
      summarizeBalanceDirections({
        generatedAtUtc: "2026-06-28T10:00:00Z",
        balances: [
          {
            counterpartyUserProfileId: "creditor-1",
            groupId: null,
            direction: "incoming",
            currency: "HKD",
            selectedLineAmount: "10.00",
            pendingClaimedAmount: "0.00",
            confirmedClearedAmount: "0.00",
            remainingUnclaimedAmount: "10.00",
            confirmedRemainingResidualAmount: "0.00",
            waivedResidualAmount: "0.00",
            creditResidualAmount: "0.00",
            requestCount: 1,
            lineCount: 1,
            pendingPaymentCount: 0,
            confirmedPaymentCount: 0
          }
        ]
      })
    ).toEqual([{ label: "Incoming", count: 1 }]);
    expect(getSettlementCounterpartyUserProfileId(visibleSettlement, "debtor-1")).toBe("creditor-1");
    expect(getSettlementCounterpartyUserProfileId(visibleSettlement, "creditor-1")).toBe("debtor-1");
    expect(getSettlementCounterpartyUserProfileId(visibleSettlement, "other")).toBeNull();
    expect(summarizeCounterpartyPaymentDetails(counterpartyPaymentDetails)).toEqual([
      { label: "Payment details", value: "Configured" },
      { label: "QR metadata", value: "Linked metadata" },
      { label: "Visibility", value: "Settlement Counterparties Only" }
    ]);
  });

  it("reports unavailable and error states without fake settlement data", async () => {
    await expect(
      loadSettlementsReadout({
        accessToken: "session-token",
        client: {
          listSettlementBalanceProjections: vi.fn().mockRejectedValue(new SettleoraApiError(403, "Forbidden", {})),
          listSettlementRequests: vi.fn()
        } as unknown as SettlementsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({
      status: "unavailable",
      settlements: []
    });

    await expect(
      loadSettlementDetailReadout({
        accessToken: "session-token",
        settlementId: visibleSettlement.id,
        client: {
          getSettlementRequest: vi.fn().mockRejectedValue(new Error("network")),
          listSettlementPayments: vi.fn()
        } as unknown as SettlementsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({
      status: "error"
    });

    await expect(
      loadSettlementDetailReadout({
        accessToken: "session-token",
        currentUserProfileId: "debtor-1",
        settlementId: visibleSettlement.id,
        client: {
          getSettlementRequest: vi.fn().mockResolvedValue(visibleSettlement),
          listSettlementPayments: vi.fn().mockResolvedValue({ payments: [] }),
          getSettlementCounterpartyPaymentDetails: vi
            .fn()
            .mockRejectedValue(new SettleoraApiError(404, "Not found", {}))
        } as unknown as SettlementsReadoutOptions["client"]
      })
    ).resolves.toMatchObject({
      status: "loaded",
      counterpartyPaymentDetails: {
        status: "unavailable"
      }
    });
  });
});
