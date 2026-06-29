import {
  SettleoraApiClient,
  SettleoraApiError,
  type SettlementBalanceProjectionListResponse,
  type SettlementCounterpartyPaymentDetailsResponse,
  type SettlementPaymentListResponse,
  type SettlementPaymentProofResponse,
  type SettlementRequestListResponse,
  type SettlementRequestResponse,
  type SettlementRequestStatus
} from "../../../packages/client-web/src/generated";
import { labelize } from "./billsReadout";

export type SettlementsReadoutStatus =
  | "auth_required"
  | "loading"
  | "loaded"
  | "empty"
  | "session_expired"
  | "unavailable"
  | "error";

export type SettlementPresentationFilter =
  | "all"
  | "outstanding"
  | "cleared"
  | "disputed_cancelled";

export interface SettlementsReadoutState {
  status: SettlementsReadoutStatus;
  message: string;
  settlements: SettlementRequestResponse[];
  balances?: SettlementBalanceProjectionListResponse;
}

export interface SettlementDetailReadoutState {
  status: SettlementsReadoutStatus;
  message: string;
  settlement?: SettlementRequestResponse;
  payments?: SettlementPaymentListResponse;
  counterpartyPaymentDetails?: CounterpartyPaymentDetailsReadoutState;
  proofMetadata?: SettlementProofMetadataReadoutState;
}

export interface CounterpartyPaymentDetailsReadoutState {
  status: SettlementsReadoutStatus;
  message: string;
  counterpartyUserProfileId?: string;
  details?: SettlementCounterpartyPaymentDetailsResponse;
}

export interface SettlementPaymentProofMetadata {
  paymentId: string;
  proofs: SettlementPaymentProofResponse[];
}

export interface SettlementProofMetadataReadoutState {
  status: SettlementsReadoutStatus;
  message: string;
  paymentProofs: SettlementPaymentProofMetadata[];
  missingMethods: string[];
}

export interface SettlementsReadoutOptions {
  accessToken?: string | null;
  baseUrl?: string;
  currentUserProfileId?: string | null;
  client?: Pick<
    SettleoraApiClient,
    | "listSettlementBalanceProjections"
    | "listSettlementRequests"
    | "getSettlementRequest"
    | "listSettlementPayments"
    | "getSettlementCounterpartyPaymentDetails"
  > &
    Partial<Pick<SettleoraApiClient, "listSettlementPaymentProofs">>;
}

export async function loadSettlementsReadout(
  options: SettlementsReadoutOptions
): Promise<SettlementsReadoutState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can show settlement requests on the web.",
      settlements: []
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    const [balances, settlementList] = await Promise.all([
      client.listSettlementBalanceProjections({ accessToken }),
      client.listSettlementRequests({ accessToken })
    ]);

    if (settlementList.settlements.length === 0 && balances.balances.length === 0) {
      return {
        status: "empty",
        message: "No visible settlement requests or balance rows are available for this account yet.",
        settlements: [],
        balances
      };
    }

    return {
      status: "loaded",
      message: `${settlementList.settlements.length} settlement request${settlementList.settlements.length === 1 ? "" : "s"} loaded from Settleora.`,
      settlements: settlementList.settlements,
      balances
    };
  } catch (error) {
    return toSettlementsReadoutFailure(
      error,
      "Settleora could not load visible settlements. No private settlement details were shown."
    );
  }
}

export async function loadSettlementDetailReadout(
  options: SettlementsReadoutOptions & { settlementId: string }
): Promise<SettlementDetailReadoutState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can show settlement details."
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    const [settlement, payments] = await Promise.all([
      client.getSettlementRequest(options.settlementId, { accessToken }),
      client.listSettlementPayments(options.settlementId, { accessToken })
    ]);
    const counterpartyPaymentDetails = await loadCounterpartyPaymentDetailsReadout({
      accessToken,
      client,
      currentUserProfileId: options.currentUserProfileId,
      settlement
    });
    const proofMetadata = await loadSettlementProofMetadataReadout({
      accessToken,
      client,
      payments
    });

    return {
      status: "loaded",
      message: "Settlement detail loaded from Settleora.",
      settlement,
      payments,
      counterpartyPaymentDetails,
      proofMetadata
    };
  } catch (error) {
    return toSettlementsDetailFailure(
      error,
      "Settleora could not load this settlement detail. No private settlement details were shown."
    );
  }
}

export async function loadCounterpartyPaymentDetailsReadout({
  accessToken,
  client,
  currentUserProfileId,
  settlement
}: {
  accessToken: string;
  client: Pick<SettleoraApiClient, "getSettlementCounterpartyPaymentDetails">;
  currentUserProfileId?: string | null;
  settlement: SettlementRequestResponse;
}): Promise<CounterpartyPaymentDetailsReadoutState> {
  const counterpartyUserProfileId = getSettlementCounterpartyUserProfileId(
    settlement,
    currentUserProfileId
  );

  if (!counterpartyUserProfileId) {
    return {
      status: "unavailable",
      message:
        "Counterparty payment details need the signed-in profile to match the selected settlement debtor or creditor.",
      counterpartyUserProfileId: undefined
    };
  }

  try {
    const details = await client.getSettlementCounterpartyPaymentDetails(
      settlement.id,
      counterpartyUserProfileId,
      { accessToken }
    );

    return {
      status: "loaded",
      message: details.isConfigured
        ? "Counterparty payment detail metadata loaded through this settlement."
        : "The counterparty has no visible configured payment details for this settlement.",
      counterpartyUserProfileId,
      details
    };
  } catch (error) {
    return toCounterpartyPaymentDetailsFailure(error, counterpartyUserProfileId);
  }
}

export async function loadSettlementProofMetadataReadout({
  accessToken,
  client,
  payments
}: {
  accessToken?: string | null;
  client: Partial<Pick<SettleoraApiClient, "listSettlementPaymentProofs">>;
  payments?: SettlementPaymentListResponse | null;
}): Promise<SettlementProofMetadataReadoutState> {
  const verifiedAccessToken = accessToken?.trim();

  if (!verifiedAccessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can show settlement proof metadata.",
      paymentProofs: [],
      missingMethods: []
    };
  }

  if (!payments || payments.payments.length === 0) {
    return {
      status: "unavailable",
      message: "Proof metadata needs a selected settlement with visible payment rows.",
      paymentProofs: [],
      missingMethods: []
    };
  }

  if (typeof client.listSettlementPaymentProofs !== "function") {
    return {
      status: "unavailable",
      message:
        "Settlement proof metadata is unavailable because the generated web client has no safe metadata list method.",
      paymentProofs: [],
      missingMethods: ["listSettlementPaymentProofs"]
    };
  }

  try {
    const paymentProofs = await Promise.all(
      payments.payments.map(async (payment) => {
        const proofList = await client.listSettlementPaymentProofs!(payment.paymentId, {
          accessToken: verifiedAccessToken
        });

        return {
          paymentId: payment.paymentId,
          proofs: proofList.proofs
        };
      })
    );
    const proofCount = paymentProofs.reduce((total, item) => total + item.proofs.length, 0);

    return {
      status: proofCount > 0 ? "loaded" : "empty",
      message:
        proofCount > 0
          ? `${proofCount} settlement proof metadata row${proofCount === 1 ? "" : "s"} loaded from Settleora.`
          : "No settlement proof metadata rows were returned for visible payments.",
      paymentProofs,
      missingMethods: []
    };
  } catch (error) {
    return toSettlementProofMetadataFailure(error);
  }
}

export function summarizeSettlementProofMetadata(
  readout: SettlementProofMetadataReadoutState | undefined
): Array<{ label: string; value: string }> {
  if (!readout) {
    return [
      { label: "Proof metadata", value: "Unavailable" },
      { label: "Proof files", value: "0" }
    ];
  }

  const proofCount = readout.paymentProofs.reduce((total, item) => total + item.proofs.length, 0);

  return [
    { label: "Proof metadata", value: labelize(readout.status) },
    { label: "Proof files", value: String(proofCount) }
  ];
}

export function formatProofSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "Unknown size";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const kib = sizeBytes / 1024;

  if (kib < 1024) {
    return `${kib.toFixed(kib >= 10 ? 0 : 1)} KiB`;
  }

  const mib = kib / 1024;

  return `${mib.toFixed(mib >= 10 ? 0 : 1)} MiB`;
}

export function getSettlementCounterpartyUserProfileId(
  settlement: SettlementRequestResponse,
  currentUserProfileId?: string | null
): string | null {
  const actorProfileId = currentUserProfileId?.trim();

  if (!actorProfileId) {
    return null;
  }

  if (settlement.debtorUserProfileId === actorProfileId) {
    return settlement.creditorUserProfileId;
  }

  if (settlement.creditorUserProfileId === actorProfileId) {
    return settlement.debtorUserProfileId;
  }

  return null;
}

export function summarizeCounterpartyPaymentDetails(
  details: SettlementCounterpartyPaymentDetailsResponse | undefined
): Array<{ label: string; value: string }> {
  if (!details) {
    return [
      { label: "Payment details", value: "Unavailable" },
      { label: "QR metadata", value: "Unavailable" },
      { label: "Visibility", value: "Unavailable" }
    ];
  }

  return [
    { label: "Payment details", value: details.isConfigured ? "Configured" : "Not configured" },
    { label: "QR metadata", value: details.qrFile ? "Linked metadata" : "No QR metadata" },
    { label: "Visibility", value: labelize(details.visibilityApplied) }
  ];
}

export function filterSettlementsForPresentation(
  settlements: SettlementRequestResponse[],
  filter: SettlementPresentationFilter
): SettlementRequestResponse[] {
  return settlements.filter((settlement) => {
    if (filter === "all") {
      return true;
    }

    if (filter === "outstanding") {
      return ["requested", "partially_paid", "marked_paid"].includes(settlement.status);
    }

    if (filter === "cleared") {
      return settlement.status === "confirmed";
    }

    return settlement.status === "disputed" || settlement.status === "cancelled";
  });
}

export function summarizeSettlementStatuses(
  settlements: SettlementRequestResponse[]
): Array<{ label: string; count: number }> {
  return countBy(settlements.map((settlement) => settlement.status)).map(([status, count]) => ({
    label: labelize(status),
    count
  }));
}

export function summarizeBalanceDirections(
  balances: SettlementBalanceProjectionListResponse | undefined
): Array<{ label: string; count: number }> {
  return countBy((balances?.balances ?? []).map((balance) => balance.direction)).map(([direction, count]) => ({
    label: labelize(direction),
    count
  }));
}

export const settlementFilterLabels: Record<SettlementPresentationFilter, string> = {
  all: "All requests",
  outstanding: "Outstanding",
  cleared: "Cleared",
  disputed_cancelled: "Disputed or cancelled"
};

export const settlementStatusFilters: SettlementRequestStatus[] = [
  "requested",
  "partially_paid",
  "marked_paid",
  "confirmed",
  "disputed",
  "cancelled"
];

function countBy(values: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();

  values.forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return Array.from(counts.entries()).sort((left, right) => left[0].localeCompare(right[0]));
}

function toSettlementsReadoutFailure(error: unknown, fallback: string): SettlementsReadoutState {
  const detail = classifyApiFailure(error, fallback);

  return {
    status: detail.status,
    message: detail.message,
    settlements: []
  };
}

function toSettlementsDetailFailure(error: unknown, fallback: string): SettlementDetailReadoutState {
  return classifyApiFailure(error, fallback);
}

function toCounterpartyPaymentDetailsFailure(
  error: unknown,
  counterpartyUserProfileId: string
): CounterpartyPaymentDetailsReadoutState {
  const detail = classifyApiFailure(
    error,
    "Settleora could not load counterparty payment detail metadata for this settlement."
  );

  return {
    status: detail.status,
    message: detail.message,
    counterpartyUserProfileId
  };
}

function toSettlementProofMetadataFailure(error: unknown): SettlementProofMetadataReadoutState {
  const detail = classifyApiFailure(
    error,
    "Settleora could not load settlement proof metadata. No proof bytes were fetched."
  );

  return {
    status: detail.status,
    message: detail.message,
    paymentProofs: [],
    missingMethods: []
  };
}

function classifyApiFailure(
  error: unknown,
  fallback: string
): { status: Exclude<SettlementsReadoutStatus, "loading" | "loaded" | "empty">; message: string } {
  if (error instanceof SettleoraApiError && error.status === 401) {
    return {
      status: "session_expired",
      message: "Your session could not be verified. Sign in again before opening settlements."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 403) {
    return {
      status: "unavailable",
      message: "This account cannot open the requested settlement information."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 404) {
    return {
      status: "unavailable",
      message: "The requested settlement information is not available to this account."
    };
  }

  return {
    status: "error",
    message: fallback
  };
}
