import {
  SettleoraApiClient,
  SettleoraApiError,
  type SettlementBalanceProjectionListResponse,
  type SettlementPaymentListResponse,
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
}

export interface SettlementsReadoutOptions {
  accessToken?: string | null;
  baseUrl?: string;
  client?: Pick<
    SettleoraApiClient,
    "listSettlementBalanceProjections" | "listSettlementRequests" | "getSettlementRequest" | "listSettlementPayments"
  >;
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

    return {
      status: "loaded",
      message: "Settlement detail loaded from Settleora.",
      settlement,
      payments
    };
  } catch (error) {
    return toSettlementsDetailFailure(
      error,
      "Settleora could not load this settlement detail. No private settlement details were shown."
    );
  }
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

  return {
    status: "error",
    message: fallback
  };
}
