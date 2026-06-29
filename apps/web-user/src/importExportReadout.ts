import { SettleoraApiClient } from "../../../packages/client-web/src/generated";
import {
  SettleoraApiError,
  type CurrencyCode,
  type ExpenseBillArchiveState,
  type ExpenseBillExportFormat,
  type ExpenseBillExportReadinessResponse,
  type ExpenseBillExportResponse,
  type ExpenseBillReconciliationStatus,
  type ExpenseBillStatus
} from "../../../packages/client-web/src/generated";

export type ImportExportCapabilityStatus =
  | "readout_only"
  | "operation_method_exists"
  | "needs_readiness_endpoint"
  | "not_available_yet"
  | "future_reviewed_slice";

export interface ImportExportCapability {
  id: string;
  title: string;
  summary: string;
  status: ImportExportCapabilityStatus;
  chips: string[];
  methodsPresent: string[];
  missingMethods: string[];
  followUps: string[];
}

export interface ImportExportReadoutState {
  status: "loaded";
  message: string;
  capabilities: ImportExportCapability[];
  methodsFound: string[];
  missingMethods: string[];
  intentionallyNotCalled: string[];
  unsupportedSections: string[];
}

export interface ImportExportReadoutOptions {
  client?: Partial<SettleoraApiClient>;
}

export type BillExportScope = "personal" | "group";
export type BillExportRuntimeStatus =
  | "idle"
  | "auth_required"
  | "checking"
  | "ready"
  | "blocked"
  | "downloading"
  | "downloaded"
  | "session_expired"
  | "unavailable"
  | "error";

export interface BillExportFilters {
  fromDate?: string | null;
  toDate?: string | null;
  status?: ExpenseBillStatus | null;
  reconciliationStatus?: ExpenseBillReconciliationStatus | null;
  currency?: CurrencyCode | null;
  merchant?: string | null;
  search?: string | null;
  archiveState?: ExpenseBillArchiveState | null;
  limit?: number | null;
}

export interface BillExportRuntimeState {
  status: BillExportRuntimeStatus;
  message: string;
  readiness?: ExpenseBillExportReadinessResponse;
  filename?: string;
}

export interface BillExportRuntimeClient {
  getPersonalBillExportReadiness?: SettleoraApiClient["getPersonalBillExportReadiness"];
  exportPersonalBillsCsv?: SettleoraApiClient["exportPersonalBillsCsv"];
  exportPersonalBillsJson?: SettleoraApiClient["exportPersonalBillsJson"];
  getGroupBillExportReadiness?: SettleoraApiClient["getGroupBillExportReadiness"];
  exportGroupBillsCsv?: SettleoraApiClient["exportGroupBillsCsv"];
  exportGroupBillsJson?: SettleoraApiClient["exportGroupBillsJson"];
}

export interface BrowserDownloadAdapter {
  saveBlob(blob: Blob, filename: string): void;
}

export interface BillExportRuntimeOptions {
  accessToken?: string | null;
  scope: BillExportScope;
  groupId?: string | null;
  format: ExpenseBillExportFormat;
  filters?: BillExportFilters;
  baseUrl?: string;
  client?: BillExportRuntimeClient;
  now?: Date;
  downloadAdapter?: BrowserDownloadAdapter;
}

export const defaultBillExportFilters: BillExportFilters = {
  archiveState: "all",
  limit: 100
};

const operationMethods = [
  "getPersonalBillExportReadiness",
  "exportPersonalBillsCsv",
  "exportPersonalBillsJson",
  "getGroupBillExportReadiness",
  "exportGroupBillsCsv",
  "exportGroupBillsJson",
  "importPersonalBillsCsv",
  "importGroupBillsCsv",
  "listSyncChanges",
  "submitSyncOperation",
  "getSyncOperation"
] as const;

type OperationMethod = (typeof operationMethods)[number];

const capabilityDefinitions: Array<{
  id: string;
  title: string;
  summaryWhenPresent: string;
  summaryWhenMissing: string;
  methods: OperationMethod[];
  followUps: string[];
}> = [
  {
    id: "personal-bill-export",
    title: "Personal bill export",
    summaryWhenPresent:
      "Readiness and CSV/JSON export methods are present for authenticated personal bill downloads.",
    summaryWhenMissing:
      "Personal bill export methods are not available in this web client build.",
    methods: ["getPersonalBillExportReadiness", "exportPersonalBillsCsv", "exportPersonalBillsJson"],
    followUps: [
      "Checks export readiness before every download and blocks when the server denies, expires, or rejects the selected request.",
      "CSV uses the API Blob response; JSON uses the API-returned export model without browser-side financial recomputation."
    ]
  },
  {
    id: "group-bill-export",
    title: "Group bill export",
    summaryWhenPresent:
      "Group-scoped readiness and CSV/JSON export methods are present, but this route has no safe group picker.",
    summaryWhenMissing:
      "Group bill export methods are not available in this web client build.",
    methods: ["getGroupBillExportReadiness", "exportGroupBillsCsv", "exportGroupBillsJson"],
    followUps: [
      "Needs a safe group selection on the import/export route before group export can be enabled here.",
      "Future group export must preserve API authorization, privacy redactions, and audit coverage for the selected group."
    ]
  },
  {
    id: "personal-bill-import",
    title: "Personal bill CSV import",
    summaryWhenPresent:
      "A CSV import method is present, but import is a mutation path and remains unavailable from this readout.",
    summaryWhenMissing:
      "Personal bill CSV import is not available in this web client build.",
    methods: ["importPersonalBillsCsv"],
    followUps: [
      "Needs import preflight, session, and review readouts before any upload or import acceptance flow.",
      "Future import runtime must keep validation, money truth, conflict handling, and audit server-owned."
    ]
  },
  {
    id: "group-bill-import",
    title: "Group bill CSV import",
    summaryWhenPresent:
      "A group CSV import method is present, but no upload, review, or group mutation is started here.",
    summaryWhenMissing:
      "Group bill CSV import is not available in this web client build.",
    methods: ["importGroupBillsCsv"],
    followUps: [
      "Needs group-scoped import preflight, session, and row-problem readouts before runtime controls.",
      "Future group import must make group authorization and conflict handling explicit before acceptance."
    ]
  },
  {
    id: "local-backup-restore",
    title: "Local backup / restore",
    summaryWhenPresent:
      "No browser backup or restore methods are exposed for this web build.",
    summaryWhenMissing:
      "Browser local backup and restore are not supported by the current generated client.",
    methods: [],
    followUps: [
      "Needs a reviewed browser local backup/restore design before package creation, preview, confirmation, or restore.",
      "No backup package, restore preview, backup contents, or browser-local accounting state is read or written here."
    ]
  },
  {
    id: "local-server-migration",
    title: "Local mode / server mode migration",
    summaryWhenPresent:
      "User-web local-mode persistence and migration are not available from this readout.",
    summaryWhenMissing:
      "No safe local/server mode status or browser-local persistence methods are available for user web.",
    methods: [],
    followUps: [
      "Needs explicit user-web local-mode persistence design before browser-local records can exist.",
      "Future migration must be user-approved and must not silently merge local-only data into server-mode data."
    ]
  },
  {
    id: "sync-status",
    title: "Sync operation visibility/status",
    summaryWhenPresent:
      "Sync read and operation methods are present, but this screen shows availability text only.",
    summaryWhenMissing:
      "Safe user-web sync/local status is not available in this web client build.",
    methods: ["listSyncChanges", "getSyncOperation", "submitSyncOperation"],
    followUps: [
      "Needs a safe sync/local status readout before queue visibility can be shown in user web.",
      "Sync submission remains a future reviewed mutation slice."
    ]
  }
];

export const importExportUnsupportedSections = [
  "Personal CSV/JSON export is available only after sign-in and a positive server readiness check.",
  "Group CSV/JSON export needs a safe group selector on this route before it can start.",
  "Import preflight, session, and review readouts are not available yet.",
  "Browser local backup and restore are not supported in this web slice.",
  "User-web local-mode persistence is not implemented.",
  "Sync/local status is availability copy only; no sync queue or operation is submitted.",
  "Report/export history is not available when the server does not expose a safe history read."
];

export function loadImportExportReadout(
  options: ImportExportReadoutOptions = {}
): ImportExportReadoutState {
  const client = options.client ?? new SettleoraApiClient({ baseUrl: "/" });
  const methodsFound = operationMethods.filter((method) => hasMethod(client, method));
  const missingMethods = operationMethods.filter((method) => !hasMethod(client, method));

  return {
    status: "loaded",
    message:
      "Review which data portability surfaces are ready, planned, or require server support.",
    capabilities: capabilityDefinitions.map((definition) =>
      mapCapabilityDefinition(definition, client)
    ),
    methodsFound,
    missingMethods,
    intentionallyNotCalled: [...operationMethods],
    unsupportedSections: importExportUnsupportedSections
  };
}

export function getMissingImportExportMethods(client: object): string[] {
  return operationMethods.filter((method) => !hasMethod(client, method));
}

export function getPresentImportExportMethods(client: object): string[] {
  return operationMethods.filter((method) => hasMethod(client, method));
}

export function labelImportExportStatus(status: ImportExportCapabilityStatus): string {
  switch (status) {
    case "readout_only":
      return "Readout only";
    case "operation_method_exists":
      return "Operation method exists";
    case "needs_readiness_endpoint":
      return "Needs readiness endpoint";
    case "not_available_yet":
      return "Not available yet";
    case "future_reviewed_slice":
      return "Future reviewed slice";
  }
}

export async function checkBillExportReadiness(
  options: BillExportRuntimeOptions
): Promise<BillExportRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can check export readiness."
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });
  const filters = normalizeBillExportFilters(options.filters);

  try {
    const readiness =
      options.scope === "personal"
        ? await callPersonalReadiness(client, accessToken, options.format, filters)
        : await callGroupReadiness(client, accessToken, options.groupId, options.format, filters);

    const scopeGuard = evaluateBillExportScope(readiness, options.scope, options.groupId);
    if (!scopeGuard.allowed) {
      return {
        status: "blocked",
        message: scopeGuard.message,
        readiness
      };
    }

    const guard = evaluateBillExportReadiness(readiness, options.format, options.now);

    return {
      status: guard.allowed ? "ready" : "blocked",
      message: guard.message,
      readiness
    };
  } catch (error) {
    return classifyBillExportFailure(
      error,
      "Settleora could not check export readiness. No export was started."
    );
  }
}

export async function downloadBillExport(
  options: BillExportRuntimeOptions
): Promise<BillExportRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can export bills."
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });
  const filters = normalizeBillExportFilters(options.filters);

  try {
    const readiness =
      options.scope === "personal"
        ? await callPersonalReadiness(client, accessToken, options.format, filters)
        : await callGroupReadiness(client, accessToken, options.groupId, options.format, filters);
    const scopeGuard = evaluateBillExportScope(readiness, options.scope, options.groupId);
    if (!scopeGuard.allowed) {
      return {
        status: "blocked",
        message: scopeGuard.message,
        readiness
      };
    }

    const guard = evaluateBillExportReadiness(readiness, options.format, options.now);

    if (!guard.allowed) {
      return {
        status: "blocked",
        message: guard.message,
        readiness
      };
    }

    const filename = createBillExportFilename(readiness.scopeType, options.format);
    const blob =
      options.format === "csv"
        ? await callCsvExport(client, accessToken, readiness, filters)
        : createJsonExportBlob(await callJsonExport(client, accessToken, readiness, filters));

    (options.downloadAdapter ?? browserDownloadAdapter).saveBlob(blob, filename);

    return {
      status: "downloaded",
      message: `${readiness.confirmation.confirmLabel} completed. The browser received a scoped ${options.format.toUpperCase()} export.`,
      readiness,
      filename
    };
  } catch (error) {
    return classifyBillExportFailure(error, "Settleora could not complete the export. No fallback file was created.");
  }
}

function evaluateBillExportScope(
  readiness: ExpenseBillExportReadinessResponse,
  scope: BillExportScope,
  groupId: string | null | undefined
): { allowed: boolean; message: string } {
  if (readiness.scopeType !== scope) {
    return {
      allowed: false,
      message: "Settleora returned readiness for a different export scope."
    };
  }

  if (scope === "group" && readiness.groupId !== groupId?.trim()) {
    return {
      allowed: false,
      message: "Settleora returned readiness for a different group. Select the group again before exporting."
    };
  }

  if (scope === "personal" && readiness.groupId !== null) {
    return {
      allowed: false,
      message: "Settleora returned group metadata for a personal export request."
    };
  }

  return {
    allowed: true,
    message: readiness.message
  };
}

export function evaluateBillExportReadiness(
  readiness: ExpenseBillExportReadinessResponse,
  format: ExpenseBillExportFormat,
  now: Date = new Date()
): { allowed: boolean; message: string } {
  if (!readiness.available || readiness.code !== "ready") {
    return {
      allowed: false,
      message: readiness.message || "Settleora did not approve this export request."
    };
  }

  if (readiness.requestedFormat !== format || !readiness.supportedFormats.includes(format)) {
    return {
      allowed: false,
      message: "Settleora did not approve the selected export format."
    };
  }

  if (readiness.rejectedFilters.length > 0) {
    return {
      allowed: false,
      message: "Settleora rejected one or more export filters. Refresh readiness before downloading."
    };
  }

  if (readiness.includesFileBytes) {
    return {
      allowed: false,
      message: "This export would include file bytes. File-byte export needs a separate reviewed flow."
    };
  }

  if (new Date(readiness.expiresAtUtc).getTime() <= now.getTime()) {
    return {
      allowed: false,
      message: "Export readiness expired. Check readiness again before downloading."
    };
  }

  return {
    allowed: true,
    message: readiness.message || readiness.confirmation.body
  };
}

export function createBillExportFilename(
  scopeType: ExpenseBillExportReadinessResponse["scopeType"],
  format: ExpenseBillExportFormat,
  now: Date = new Date()
): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const scope = scopeType === "group" ? "group-bills" : "personal-bills";

  return `settleora-${scope}-${date}.${format}`;
}

function mapCapabilityDefinition(
  definition: (typeof capabilityDefinitions)[number],
  client: object
): ImportExportCapability {
  const methodsPresent = definition.methods.filter((method) => hasMethod(client, method));
  const missingMethods = definition.methods.filter((method) => !hasMethod(client, method));
  const hasAllMethods = definition.methods.length > 0 && missingMethods.length === 0;
  const status = statusForCapability(definition.id, definition.methods.length, hasAllMethods);

  return {
    id: definition.id,
    title: definition.title,
    summary: hasAllMethods ? definition.summaryWhenPresent : definition.summaryWhenMissing,
    status,
    chips: chipsForCapability(definition.id, hasAllMethods),
    methodsPresent,
    missingMethods,
    followUps: definition.followUps
  };
}

function statusForCapability(
  id: string,
  methodCount: number,
  hasAllMethods: boolean
): ImportExportCapabilityStatus {
  if (id === "local-backup-restore" || id === "local-server-migration") {
    return "not_available_yet";
  }

  if (id === "sync-status") {
    return hasAllMethods ? "readout_only" : "needs_readiness_endpoint";
  }

  if (methodCount > 0 && hasAllMethods) {
    return "operation_method_exists";
  }

  return "needs_readiness_endpoint";
}

function chipsForCapability(id: string, hasAllMethods: boolean): string[] {
  if (id === "local-backup-restore") {
    return ["Not available yet", "Future reviewed slice"];
  }

  if (id === "local-server-migration") {
    return ["Not available yet", "Future reviewed slice"];
  }

  if (id === "sync-status") {
    return hasAllMethods
      ? ["Readout only", "Operation method exists", "Future reviewed slice"]
      : ["Readout only", "Needs readiness endpoint"];
  }

  return hasAllMethods
    ? ["Readiness gated", "Operation method exists", "Future reviewed slice"]
    : ["Readout only", "Needs readiness endpoint"];
}

function hasMethod(client: object, method: OperationMethod): boolean {
  return typeof (client as Record<string, unknown>)[method] === "function";
}

function normalizeBillExportFilters(filters: BillExportFilters = {}): BillExportFilters {
  return {
    ...defaultBillExportFilters,
    ...filters,
    search: normalizeOptionalString(filters.search),
    merchant: normalizeOptionalString(filters.merchant)
  };
}

function normalizeOptionalString(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

async function callPersonalReadiness(
  client: BillExportRuntimeClient,
  accessToken: string,
  format: ExpenseBillExportFormat,
  filters: BillExportFilters
): Promise<ExpenseBillExportReadinessResponse> {
  if (typeof client.getPersonalBillExportReadiness !== "function") {
    throw new MissingExportMethodError("Personal export readiness is not available in this web client build.");
  }

  return client.getPersonalBillExportReadiness({ accessToken }, { ...filters, format });
}

async function callGroupReadiness(
  client: BillExportRuntimeClient,
  accessToken: string,
  groupId: string | null | undefined,
  format: ExpenseBillExportFormat,
  filters: BillExportFilters
): Promise<ExpenseBillExportReadinessResponse> {
  const normalizedGroupId = groupId?.trim();

  if (!normalizedGroupId) {
    throw new MissingExportMethodError("Select a group before checking group export readiness.");
  }

  if (typeof client.getGroupBillExportReadiness !== "function") {
    throw new MissingExportMethodError("Group export readiness is not available in this web client build.");
  }

  return client.getGroupBillExportReadiness(normalizedGroupId, { accessToken }, { ...filters, format });
}

async function callCsvExport(
  client: BillExportRuntimeClient,
  accessToken: string,
  readiness: ExpenseBillExportReadinessResponse,
  filters: BillExportFilters
): Promise<Blob> {
  if (readiness.scopeType === "group") {
    if (!readiness.groupId || typeof client.exportGroupBillsCsv !== "function") {
      throw new MissingExportMethodError("Group CSV export is not available in this web client build.");
    }

    return client.exportGroupBillsCsv(readiness.groupId, { accessToken }, filters);
  }

  if (typeof client.exportPersonalBillsCsv !== "function") {
    throw new MissingExportMethodError("Personal CSV export is not available in this web client build.");
  }

  return client.exportPersonalBillsCsv({ accessToken }, filters);
}

async function callJsonExport(
  client: BillExportRuntimeClient,
  accessToken: string,
  readiness: ExpenseBillExportReadinessResponse,
  filters: BillExportFilters
): Promise<ExpenseBillExportResponse> {
  if (readiness.scopeType === "group") {
    if (!readiness.groupId || typeof client.exportGroupBillsJson !== "function") {
      throw new MissingExportMethodError("Group JSON export is not available in this web client build.");
    }

    return client.exportGroupBillsJson(readiness.groupId, { accessToken }, filters);
  }

  if (typeof client.exportPersonalBillsJson !== "function") {
    throw new MissingExportMethodError("Personal JSON export is not available in this web client build.");
  }

  return client.exportPersonalBillsJson({ accessToken }, filters);
}

function createJsonExportBlob(exportResponse: ExpenseBillExportResponse): Blob {
  return new Blob([JSON.stringify(exportResponse, null, 2)], {
    type: "application/json"
  });
}

function classifyBillExportFailure(error: unknown, fallback: string): BillExportRuntimeState {
  if (error instanceof MissingExportMethodError) {
    return {
      status: "unavailable",
      message: error.message
    };
  }

  if (error instanceof SettleoraApiError && error.status === 401) {
    return {
      status: "session_expired",
      message: "Your session could not be verified. Sign in again before exporting bills."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 403) {
    return {
      status: "unavailable",
      message: "This account cannot export the requested bill scope."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 404) {
    return {
      status: "unavailable",
      message: "The requested export scope is not available from this Settleora server."
    };
  }

  return {
    status: "error",
    message: fallback
  };
}

class MissingExportMethodError extends Error {}

const browserDownloadAdapter: BrowserDownloadAdapter = {
  saveBlob(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }
};
