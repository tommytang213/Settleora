import { describe, expect, it, vi } from "vitest";
import { normalizeRouteId } from "./App";
import {
  formatPaymentVisibility,
  loadProfilePaymentReadout,
  summarizePaymentConfiguration,
  type ProfilePaymentReadoutOptions
} from "./profileReadout";
import { SettleoraApiError, type SelfPaymentDetailsResponse, type SelfUserProfileResponse } from "../../../packages/client-web/src/generated";

const visibleProfile: SelfUserProfileResponse = {
  id: "profile-1",
  displayName: "Tommy Tang",
  defaultCurrency: "HKD",
  createdAtUtc: "2026-06-28T10:00:00Z",
  updatedAtUtc: "2026-06-28T10:15:00Z"
};

const configuredPaymentDetails: SelfPaymentDetailsResponse = {
  isConfigured: true,
  id: "payment-profile-1",
  preferredMethodLabel: "FPS",
  paymentHandle: "tommy@example.test",
  paymentNote: "Use the dinner reference",
  visibility: "settlement_counterparties_only",
  qrFile: {
    id: "file-1",
    contentType: "image/png",
    sizeBytes: 1024,
    updatedAtUtc: "2026-06-28T10:20:00Z"
  },
  createdAtUtc: "2026-06-28T10:00:00Z",
  updatedAtUtc: "2026-06-28T10:20:00Z"
};

describe("profile payment details readout adapter", () => {
  it("does not call generated profile or payment methods without a verified credential", async () => {
    const client = {
      getSelfUserProfile: vi.fn(),
      getSelfPaymentDetails: vi.fn()
    };

    const result = await loadProfilePaymentReadout({
      accessToken: null,
      client: client as unknown as ProfilePaymentReadoutOptions["client"]
    });

    expect(result).toMatchObject({ status: "auth_required" });
    expect(result).not.toHaveProperty("profile");
    expect(result).not.toHaveProperty("paymentDetails");
    expect(client.getSelfUserProfile).not.toHaveBeenCalled();
    expect(client.getSelfPaymentDetails).not.toHaveBeenCalled();
  });

  it("loads self profile and payment metadata through generated client read methods", async () => {
    const client = {
      getSelfUserProfile: vi.fn().mockResolvedValue(visibleProfile),
      getSelfPaymentDetails: vi.fn().mockResolvedValue(configuredPaymentDetails)
    };

    await expect(
      loadProfilePaymentReadout({
        accessToken: "session-token",
        client: client as unknown as ProfilePaymentReadoutOptions["client"]
      })
    ).resolves.toMatchObject({
      status: "loaded",
      profile: visibleProfile,
      paymentDetails: configuredPaymentDetails
    });
    expect(client.getSelfUserProfile).toHaveBeenCalledWith({ accessToken: "session-token" });
    expect(client.getSelfPaymentDetails).toHaveBeenCalledWith({ accessToken: "session-token" });
  });

  it("keeps payment QR handling metadata-only and scoped to self reads", async () => {
    const client = {
      getSelfUserProfile: vi.fn().mockResolvedValue(visibleProfile),
      getSelfPaymentDetails: vi.fn().mockResolvedValue(configuredPaymentDetails),
      getSelfPaymentQrContent: vi.fn(),
      getSettlementCounterpartyPaymentDetails: vi.fn()
    };

    const result = await loadProfilePaymentReadout({
      accessToken: "session-token",
      client: client as unknown as ProfilePaymentReadoutOptions["client"]
    });

    expect(result.paymentDetails?.qrFile).toMatchObject({
      id: "file-1",
      contentType: "image/png",
      sizeBytes: 1024
    });
    expect(client.getSelfPaymentQrContent).not.toHaveBeenCalled();
    expect(client.getSettlementCounterpartyPaymentDetails).not.toHaveBeenCalled();
  });

  it("reports unavailable and error states without fake profile or payment data", async () => {
    const unavailableResult = await loadProfilePaymentReadout({
      accessToken: "session-token",
      client: {
        getSelfUserProfile: vi.fn().mockRejectedValue(new SettleoraApiError(403, "Forbidden", {})),
        getSelfPaymentDetails: vi.fn()
      } as unknown as ProfilePaymentReadoutOptions["client"]
    });

    expect(unavailableResult).toMatchObject({ status: "unavailable" });
    expect(unavailableResult).not.toHaveProperty("profile");
    expect(unavailableResult).not.toHaveProperty("paymentDetails");

    await expect(
      loadProfilePaymentReadout({
        accessToken: "session-token",
        client: {
          getSelfUserProfile: vi.fn().mockRejectedValue(new Error("network")),
          getSelfPaymentDetails: vi.fn()
        } as unknown as ProfilePaymentReadoutOptions["client"]
      })
    ).resolves.toMatchObject({
      status: "error"
    });
  });

  it("summarizes visibility and unconfigured payment details for presentation only", () => {
    expect(formatPaymentVisibility("settlement_counterparties_only")).toBe("Settlement Counterparties Only");
    expect(summarizePaymentConfiguration({ ...configuredPaymentDetails, isConfigured: false, qrFile: null })).toEqual([
      { label: "Payment details", value: "Not configured" },
      { label: "QR metadata", value: "Not linked" },
      { label: "Visibility", value: "Settlement Counterparties Only" }
    ]);
  });

  it("normalizes the canonical profile hash route", () => {
    expect(normalizeRouteId("profile")).toBe("profile");
    expect(normalizeRouteId("settle")).toBe("settlements");
    expect(normalizeRouteId("unknown")).toBe("home");
  });
});
