import {
  SettleoraApiClient,
  SettleoraApiError,
  type ExpenseBillArchiveState,
  type MonthlyReportResponse,
  type PersonalBillResponse
} from "../../../packages/client-web/src/generated";

export type ReportsReadoutStatus =
  | "auth_required"
  | "loading"
  | "loaded"
  | "empty"
  | "session_expired"
  | "unavailable"
  | "error";

export interface ReportsReadoutState {
  status: ReportsReadoutStatus;
  message: string;
  month: string;
  report?: MonthlyReportResponse;
  searchRows: PersonalBillResponse[];
  missingMethods: string[];
  unsupportedSections: string[];
}

export interface ReportsReadoutOptions {
  accessToken?: string | null;
  month?: string;
  search?: string;
  baseUrl?: string;
  client?: Partial<Pick<SettleoraApiClient, "getMonthlyReport" | "listPersonalBills">>;
}

export const reportsSearchQuery = {
  archiveState: "all" as ExpenseBillArchiveState,
  limit: 25
};

export const reportUnsupportedSections = [
  "CSV, JSON, and PDF downloads are not started from this readout.",
  "CSV import, upload, restore, and local backup actions are unavailable in this web slice.",
  "Report totals, reconciliation counts, settlement counts, and search eligibility come from Settleora responses."
];

export async function loadReportsReadout(options: ReportsReadoutOptions): Promise<ReportsReadoutState> {
  const accessToken = options.accessToken?.trim();
  const month = normalizeReportMonth(options.month);
  const search = options.search?.trim() ?? "";

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can show reports and search results on the web.",
      month,
      searchRows: [],
      missingMethods: [],
      unsupportedSections: reportUnsupportedSections
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });
  const missingMethods = getMissingReportReadMethods(client);

  if (missingMethods.length > 0) {
    return {
      status: "unavailable",
      message: "Report and search reads are not available in this web client build yet.",
      month,
      searchRows: [],
      missingMethods,
      unsupportedSections: reportUnsupportedSections
    };
  }

  const reportClient = client as Pick<SettleoraApiClient, "getMonthlyReport" | "listPersonalBills">;

  try {
    const [report, billList] = await Promise.all([
      reportClient.getMonthlyReport({ accessToken }, { month, groupId: null }),
      reportClient.listPersonalBills(
        { accessToken },
        {
          ...reportsSearchQuery,
          search: search.length > 0 ? search : null
        }
      )
    ]);

    const hasReportRows =
      report.billCount > 0 ||
      report.totalByCurrency.length > 0 ||
      report.actorShareByCurrency.length > 0 ||
      report.actorPaidByCurrency.length > 0 ||
      report.reconciliationCounts.length > 0 ||
      report.settlementRequestCounts.length > 0 ||
      report.settlementPaymentCounts.length > 0;

    return {
      status: hasReportRows || billList.bills.length > 0 ? "loaded" : "empty",
      message:
        hasReportRows || billList.bills.length > 0
          ? "Monthly report and bill search rows loaded from Settleora."
          : "No visible report or search rows are available for this month and query.",
      month,
      report,
      searchRows: billList.bills,
      missingMethods: [],
      unsupportedSections: reportUnsupportedSections
    };
  } catch (error) {
    return toReportsReadoutFailure(
      error,
      month,
      "Settleora could not load reports or search results. No private report details were shown."
    );
  }
}

export function getMissingReportReadMethods(client: object): string[] {
  return ["getMonthlyReport", "listPersonalBills"].filter((method) => {
    return typeof (client as Record<string, unknown>)[method] !== "function";
  });
}

export function normalizeReportMonth(value?: string): string {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    return value;
  }

  return new Date().toISOString().slice(0, 7);
}

export function summarizeReportTotals(
  totals: MonthlyReportResponse["totalByCurrency"]
): Array<{ label: string; value: string }> {
  return totals.map((total) => ({
    label: total.currency,
    value: `${total.amount} ${total.currency}`
  }));
}

export function summarizeReportCounts(
  counts: MonthlyReportResponse["reconciliationCounts"]
): Array<{ label: string; value: string }> {
  return counts.map((count) => ({
    label: count.status,
    value: String(count.count)
  }));
}

function toReportsReadoutFailure(error: unknown, month: string, fallback: string): ReportsReadoutState {
  const detail = classifyApiFailure(error, fallback);

  return {
    status: detail.status,
    message: detail.message,
    month,
    searchRows: [],
    missingMethods: [],
    unsupportedSections: reportUnsupportedSections
  };
}

function classifyApiFailure(
  error: unknown,
  fallback: string
): { status: Exclude<ReportsReadoutStatus, "loading" | "loaded" | "empty">; message: string } {
  if (error instanceof SettleoraApiError && error.status === 401) {
    return {
      status: "session_expired",
      message: "Your session could not be verified. Sign in again before opening reports and search."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 403) {
    return {
      status: "unavailable",
      message: "This account cannot open the requested report or search information."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 404) {
    return {
      status: "unavailable",
      message: "The requested report or search read is not available from this Settleora server."
    };
  }

  return {
    status: "error",
    message: fallback
  };
}
