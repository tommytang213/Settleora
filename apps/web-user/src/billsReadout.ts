import {
  SettleoraApiClient,
  SettleoraApiError,
  type BillAttachmentListResponse,
  type BillRevisionListResponse,
  type CurrencyCode,
  type ExpenseBillArchiveState,
  type ExpenseBillReconciliationStatus,
  type ExpenseBillStatus,
  type PersonalBillResponse,
  type SettlementCandidateListResponse
} from "../../../packages/client-web/src/generated";

export type BillsReadoutStatus =
  | "auth_required"
  | "loading"
  | "loaded"
  | "empty"
  | "session_expired"
  | "unavailable"
  | "error";

export interface BillsReadoutState {
  status: BillsReadoutStatus;
  message: string;
  bills: PersonalBillResponse[];
}

export interface BillDetailReadoutState {
  status: BillsReadoutStatus;
  message: string;
  bill?: PersonalBillResponse;
  attachments?: BillAttachmentListResponse;
  revisions?: BillRevisionListResponse;
  settlementCandidates?: SettlementCandidateListResponse;
}

export interface BillsReadoutOptions {
  accessToken?: string | null;
  baseUrl?: string;
  client?: Pick<SettleoraApiClient, "listPersonalBills" | "getPersonalBill" | "listPersonalBillAttachments" | "listBillRevisions" | "listPersonalBillSettlementCandidates">;
}

export const billsListQuery = {
  archiveState: "all" as ExpenseBillArchiveState,
  limit: 50
};

export async function loadBillsReadout(options: BillsReadoutOptions): Promise<BillsReadoutState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can show personal bills on the web.",
      bills: []
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    const response = await client.listPersonalBills({ accessToken }, billsListQuery);

    if (response.bills.length === 0) {
      return {
        status: "empty",
        message: "No visible bills are available for this account yet.",
        bills: []
      };
    }

    return {
      status: "loaded",
      message: `${response.bills.length} visible bill${response.bills.length === 1 ? "" : "s"} loaded from Settleora.`,
      bills: response.bills
    };
  } catch (error) {
    return toBillsReadoutFailure(error, "Settleora could not load visible bills. No private bill details were shown.");
  }
}

export async function loadBillDetailReadout(
  options: BillsReadoutOptions & { billId: string }
): Promise<BillDetailReadoutState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can show bill details."
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    const [bill, attachments, revisions, settlementCandidates] = await Promise.all([
      client.getPersonalBill(options.billId, { accessToken }),
      client.listPersonalBillAttachments(options.billId, { accessToken }),
      client.listBillRevisions(options.billId, { accessToken }),
      client.listPersonalBillSettlementCandidates(options.billId, { accessToken })
    ]);

    return {
      status: "loaded",
      message: "Bill detail loaded from Settleora.",
      bill,
      attachments,
      revisions,
      settlementCandidates
    };
  } catch (error) {
    return toBillsDetailFailure(error, "Settleora could not load this bill detail. No private bill details were shown.");
  }
}

export function formatMoney(amount: string, currency: CurrencyCode): string {
  return `${amount} ${currency}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Not available";
  }

  return value.slice(0, 10);
}

export function labelize(value: string | null | undefined): string {
  if (!value) {
    return "Not available";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function summarizeStatusCounts(bills: PersonalBillResponse[]): Array<{ label: string; count: number }> {
  return countBy(bills.map((bill) => bill.status)).map(([status, count]) => ({
    label: labelize(status),
    count
  }));
}

export function summarizeCurrencyCounts(bills: PersonalBillResponse[]): Array<{ label: string; count: number }> {
  return countBy(bills.map((bill) => bill.totalCurrency)).map(([currency, count]) => ({
    label: currency,
    count
  }));
}

export function filterBillsForPresentation(
  bills: PersonalBillResponse[],
  filters: {
    search: string;
    status: ExpenseBillStatus | "all";
    reconciliationStatus: ExpenseBillReconciliationStatus | "all";
  }
): PersonalBillResponse[] {
  const search = filters.search.trim().toLowerCase();

  return bills.filter((bill) => {
    const matchesSearch =
      search.length === 0 ||
      (bill.merchantName ?? "Untitled bill").toLowerCase().includes(search) ||
      bill.billDate.includes(search) ||
      bill.totalCurrency.toLowerCase().includes(search);
    const matchesStatus = filters.status === "all" || bill.status === filters.status;
    const matchesReconciliation =
      filters.reconciliationStatus === "all" || bill.reconciliation.status === filters.reconciliationStatus;

    return matchesSearch && matchesStatus && matchesReconciliation;
  });
}

function countBy(values: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();

  values.forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return Array.from(counts.entries()).sort((left, right) => left[0].localeCompare(right[0]));
}

function toBillsReadoutFailure(error: unknown, fallback: string): BillsReadoutState {
  const detail = classifyApiFailure(error, fallback);

  return {
    status: detail.status,
    message: detail.message,
    bills: []
  };
}

function toBillsDetailFailure(error: unknown, fallback: string): BillDetailReadoutState {
  return classifyApiFailure(error, fallback);
}

function classifyApiFailure(
  error: unknown,
  fallback: string
): { status: Exclude<BillsReadoutStatus, "loading" | "loaded" | "empty">; message: string } {
  if (error instanceof SettleoraApiError && error.status === 401) {
    return {
      status: "session_expired",
      message: "Your session could not be verified. Sign in again before opening bills."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 403) {
    return {
      status: "unavailable",
      message: "This account cannot open the requested bill information."
    };
  }

  return {
    status: "error",
    message: fallback
  };
}
