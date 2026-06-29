import { SettleoraApiClient } from "../../../packages/client-web/src/generated";
import {
  SettleoraApiError,
  type CurrencyCode,
  type ExpenseBillArchiveState,
  type ExpenseBillExportFormat,
  type ExpenseBillExportReadinessResponse,
  type ExpenseBillExportResponse,
  type ExpenseBillReconciliationStatus,
  type ExpenseBillStatus,
  type BillCsvImportConfirmationResponse,
  type BillCsvImportConfirmRequest,
  type BillCsvImportPreflightResponse,
  type BillCsvImportSessionResponse
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
export type BillImportPreflightScope = "personal" | "group";
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

export type BillImportPreflightRuntimeStatus =
  | "idle"
  | "auth_required"
  | "checking"
  | "ready"
  | "needs_correction"
  | "session_expired"
  | "unavailable"
  | "error";
export type BillImportSessionRuntimeStatus =
  | "idle"
  | "auth_required"
  | "creating"
  | "ready"
  | "needs_correction"
  | "confirming"
  | "confirmed"
  | "discarding"
  | "discarded"
  | "session_expired"
  | "unavailable"
  | "conflict"
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

export interface BillImportPreflightRuntimeClient {
  preflightPersonalBillsCsvImport?: SettleoraApiClient["preflightPersonalBillsCsvImport"];
  preflightGroupBillsCsvImport?: SettleoraApiClient["preflightGroupBillsCsvImport"];
  listGroups?: SettleoraApiClient["listGroups"];
}

export interface BillImportSessionRuntimeClient {
  createPersonalBillCsvImportSession?: SettleoraApiClient["createPersonalBillCsvImportSession"];
  createGroupBillCsvImportSession?: SettleoraApiClient["createGroupBillCsvImportSession"];
  getBillCsvImportSession?: SettleoraApiClient["getBillCsvImportSession"];
  confirmBillCsvImportSession?: SettleoraApiClient["confirmBillCsvImportSession"];
  discardBillCsvImportSession?: SettleoraApiClient["discardBillCsvImportSession"];
  listGroups?: SettleoraApiClient["listGroups"];
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

export interface BillImportPreflightRuntimeState {
  status: BillImportPreflightRuntimeStatus;
  message: string;
  response?: BillCsvImportPreflightResponse;
}

export interface BillImportSessionRuntimeState {
  status: BillImportSessionRuntimeStatus;
  message: string;
  session?: BillCsvImportSessionResponse;
  confirmationResult?: BillCsvImportConfirmationResponse;
}

export interface BillImportPreflightRuntimeOptions {
  accessToken?: string | null;
  scope: BillImportPreflightScope;
  groupId?: string | null;
  csvText?: string | null;
  baseUrl?: string;
  client?: BillImportPreflightRuntimeClient;
}

export interface BillImportSessionRuntimeOptions {
  accessToken?: string | null;
  scope: BillImportPreflightScope;
  groupId?: string | null;
  csvText?: string | null;
  baseUrl?: string;
  client?: BillImportSessionRuntimeClient;
}

export interface BillImportSessionActionOptions {
  accessToken?: string | null;
  session?: BillCsvImportSessionResponse | null;
  baseUrl?: string;
  client?: BillImportSessionRuntimeClient;
  now?: Date;
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
  "preflightPersonalBillsCsvImport",
  "preflightGroupBillsCsvImport",
  "createPersonalBillCsvImportSession",
  "createGroupBillCsvImportSession",
  "getBillCsvImportSession",
  "confirmBillCsvImportSession",
  "discardBillCsvImportSession",
  "listGroups",
  "importPersonalBillsCsv",
  "importGroupBillsCsv",
  "listSyncChanges",
  "submitSyncOperation",
  "getSyncOperation"
] as const;

type OperationMethod = (typeof operationMethods)[number];

const intentionallyNotCalledMethods: OperationMethod[] = [
  "importPersonalBillsCsv",
  "importGroupBillsCsv",
  "listSyncChanges",
  "submitSyncOperation",
  "getSyncOperation"
];

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
      "Staged personal CSV import-session methods are present for review, confirmation, and discard.",
    summaryWhenMissing:
      "Personal bill CSV import is not available in this web client build.",
    methods: [
      "preflightPersonalBillsCsvImport",
      "createPersonalBillCsvImportSession",
      "getBillCsvImportSession",
      "confirmBillCsvImportSession",
      "discardBillCsvImportSession",
      "importPersonalBillsCsv"
    ],
    followUps: [
      "Preflight sends CSV text to Settleora for review metadata only and does not call the direct import mutation.",
      "Confirmation echoes only server-returned session challenge fields and never calls the direct import mutation."
    ]
  },
  {
    id: "group-bill-import",
    title: "Group bill CSV import",
    summaryWhenPresent:
      "Staged group CSV import-session methods are present and use fresh server-returned group selection.",
    summaryWhenMissing:
      "Group bill CSV import is not available in this web client build.",
    methods: [
      "preflightGroupBillsCsvImport",
      "createGroupBillCsvImportSession",
      "getBillCsvImportSession",
      "confirmBillCsvImportSession",
      "discardBillCsvImportSession",
      "listGroups",
      "importGroupBillsCsv"
    ],
    followUps: [
      "Group preflight fails closed unless the selected group is still present in the latest server-returned group rows.",
      "Group import session creation reloads Settleora groups and fails closed when the selected group is missing."
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
  "Import confirmation uses staged server sessions only; direct CSV import remains unavailable.",
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
    intentionallyNotCalled: intentionallyNotCalledMethods,
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

export async function preflightBillCsvImport(
  options: BillImportPreflightRuntimeOptions
): Promise<BillImportPreflightRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can read or review a CSV import."
    };
  }

  const csvText = options.csvText ?? "";
  if (csvText.trim().length === 0) {
    return {
      status: "unavailable",
      message: "Choose a non-empty CSV file before requesting import review."
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    const response =
      options.scope === "personal"
        ? await callPersonalImportPreflight(client, accessToken, csvText)
        : await callGroupImportPreflight(client, accessToken, options.groupId, csvText);
    const scopeGuard = evaluateBillImportPreflightScope(response, options.scope, options.groupId);

    if (!scopeGuard.allowed) {
      return {
        status: "unavailable",
        message: scopeGuard.message,
        response
      };
    }

    return {
      status: response.available ? "ready" : "needs_correction",
      message: response.safeMessage || response.readiness,
      response
    };
  } catch (error) {
    return classifyBillImportPreflightFailure(error);
  }
}

export async function createBillCsvImportSession(
  options: BillImportSessionRuntimeOptions
): Promise<BillImportSessionRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can create a CSV import session."
    };
  }

  const csvText = options.csvText ?? "";
  if (csvText.trim().length === 0) {
    return {
      status: "unavailable",
      message: "Choose a non-empty CSV file before creating an import session."
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    const session =
      options.scope === "personal"
        ? await callPersonalImportSessionCreate(client, accessToken, csvText)
        : await callGroupImportSessionCreate(client, accessToken, options.groupId, csvText);
    const scopeGuard = evaluateBillImportSessionScope(session, options.scope, options.groupId);

    if (!scopeGuard.allowed) {
      return {
        status: "unavailable",
        message: scopeGuard.message,
        session
      };
    }

    return mapImportSessionResponse(session);
  } catch (error) {
    return classifyBillImportSessionFailure(error, "Settleora could not create the import session. No import was confirmed.");
  }
}

export async function confirmBillCsvImportSessionRuntime(
  options: BillImportSessionActionOptions
): Promise<BillImportSessionRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can confirm a CSV import session."
    };
  }

  const session = options.session;
  if (!session) {
    return {
      status: "unavailable",
      message: "Create a server import session before importing reviewed bills."
    };
  }

  const guard = evaluateBillImportSessionConfirmable(session, options.now);
  if (!guard.allowed) {
    return {
      status: guard.status,
      message: guard.message,
      session
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    await ensureGroupStillServerReturned(client, accessToken, session);

    if (typeof client.confirmBillCsvImportSession !== "function") {
      throw new MissingImportSessionMethodError("Import session confirmation is not available in this web client build.");
    }

    const confirmationResult = await client.confirmBillCsvImportSession(
      session.importSessionId,
      createImportConfirmRequestFromSession(session),
      { accessToken }
    );

    return {
      status: confirmationResult.status === "confirmed" ? "confirmed" : "conflict",
      message:
        confirmationResult.status === "confirmed"
          ? `Settleora imported ${confirmationResult.importedBillCount} reviewed bill${confirmationResult.importedBillCount === 1 ? "" : "s"}.`
          : "Settleora returned a non-confirmed import result. Review the returned status before retrying.",
      confirmationResult
    };
  } catch (error) {
    return classifyBillImportSessionFailure(error, "Settleora could not confirm the import session. No fallback import was attempted.");
  }
}

export async function discardBillCsvImportSessionRuntime(
  options: BillImportSessionActionOptions
): Promise<BillImportSessionRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can discard a CSV import session."
    };
  }

  const session = options.session;
  if (!session) {
    return {
      status: "unavailable",
      message: "Create a server import session before discarding it."
    };
  }

  if (session.status !== "ready_for_confirmation" && session.status !== "needs_correction") {
    return {
      status: session.status === "expired" ? "session_expired" : "unavailable",
      message: "Only pending import sessions can be discarded from this screen.",
      session
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    if (typeof client.discardBillCsvImportSession !== "function") {
      throw new MissingImportSessionMethodError("Import session discard is not available in this web client build.");
    }

    return mapImportSessionResponse(
      await client.discardBillCsvImportSession(session.importSessionId, { accessToken })
    );
  } catch (error) {
    return classifyBillImportSessionFailure(error, "Settleora could not discard the import session.");
  }
}

export function evaluateBillImportPreflightScope(
  response: BillCsvImportPreflightResponse,
  scope: BillImportPreflightScope,
  groupId: string | null | undefined
): { allowed: boolean; message: string } {
  if (response.scope !== scope) {
    return {
      allowed: false,
      message: "Settleora returned import review metadata for a different scope."
    };
  }

  if (scope === "personal" && response.groupId !== null) {
    return {
      allowed: false,
      message: "Settleora returned group metadata for a personal import review."
    };
  }

  if (scope === "group" && response.groupId !== groupId?.trim()) {
    return {
      allowed: false,
      message: "Settleora returned import review metadata for a different group. Select the group again."
    };
  }

  return {
    allowed: true,
    message: response.safeMessage
  };
}

export function evaluateBillImportSessionScope(
  response: BillCsvImportSessionResponse,
  scope: BillImportPreflightScope,
  groupId: string | null | undefined
): { allowed: boolean; message: string } {
  if (response.scope !== scope) {
    return {
      allowed: false,
      message: "Settleora returned import session metadata for a different scope."
    };
  }

  if (scope === "personal" && response.groupId !== null) {
    return {
      allowed: false,
      message: "Settleora returned group metadata for a personal import session."
    };
  }

  if (scope === "group" && response.groupId !== groupId?.trim()) {
    return {
      allowed: false,
      message: "Settleora returned import session metadata for a different group. Select the group again."
    };
  }

  return {
    allowed: true,
    message: response.confirmation.safeMessage
  };
}

export function evaluateBillImportSessionConfirmable(
  session: BillCsvImportSessionResponse,
  now: Date = new Date()
): { allowed: boolean; status: BillImportSessionRuntimeStatus; message: string } {
  if (session.status === "expired" || new Date(session.expiresAtUtc).getTime() <= now.getTime()) {
    return {
      allowed: false,
      status: "session_expired",
      message: "This import session expired. Create a new import session before importing bills."
    };
  }

  if (session.status !== "ready_for_confirmation" || !session.confirmation.confirmable) {
    return {
      allowed: false,
      status: session.status === "needs_correction" ? "needs_correction" : "unavailable",
      message: session.confirmation.safeMessage || "This import session is not ready for confirmation."
    };
  }

  return {
    allowed: true,
    status: "ready",
    message: session.confirmation.safeMessage
  };
}

export function createImportConfirmRequestFromSession(
  session: BillCsvImportSessionResponse
): BillCsvImportConfirmRequest {
  return {
    scope: session.scope,
    groupId: session.groupId,
    payloadDigest: session.payloadDigest,
    preflightResultVersion: session.preflightResultVersion,
    confirmationChallengeId: session.confirmationChallengeId
  };
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

async function callPersonalImportPreflight(
  client: BillImportPreflightRuntimeClient,
  accessToken: string,
  csvText: string
): Promise<BillCsvImportPreflightResponse> {
  if (typeof client.preflightPersonalBillsCsvImport !== "function") {
    throw new MissingImportPreflightMethodError("Personal CSV import review is not available in this web client build.");
  }

  return client.preflightPersonalBillsCsvImport(csvText, { accessToken });
}

async function callGroupImportPreflight(
  client: BillImportPreflightRuntimeClient,
  accessToken: string,
  groupId: string | null | undefined,
  csvText: string
): Promise<BillCsvImportPreflightResponse> {
  const normalizedGroupId = groupId?.trim();

  if (!normalizedGroupId) {
    throw new MissingImportPreflightMethodError("Select a server-returned group before requesting group import review.");
  }

  if (typeof client.listGroups !== "function") {
    throw new MissingImportPreflightMethodError("Group selection is not available in this web client build.");
  }

  const groups = await client.listGroups({ accessToken });
  if (!groups.groups.some((group) => group.id === normalizedGroupId)) {
    throw new MissingImportPreflightMethodError("The selected group is no longer available. Refresh groups and select again.");
  }

  if (typeof client.preflightGroupBillsCsvImport !== "function") {
    throw new MissingImportPreflightMethodError("Group CSV import review is not available in this web client build.");
  }

  return client.preflightGroupBillsCsvImport(normalizedGroupId, csvText, { accessToken });
}

async function callPersonalImportSessionCreate(
  client: BillImportSessionRuntimeClient,
  accessToken: string,
  csvText: string
): Promise<BillCsvImportSessionResponse> {
  if (typeof client.createPersonalBillCsvImportSession !== "function") {
    throw new MissingImportSessionMethodError("Personal CSV import sessions are not available in this web client build.");
  }

  return client.createPersonalBillCsvImportSession(csvText, { accessToken });
}

async function callGroupImportSessionCreate(
  client: BillImportSessionRuntimeClient,
  accessToken: string,
  groupId: string | null | undefined,
  csvText: string
): Promise<BillCsvImportSessionResponse> {
  const normalizedGroupId = groupId?.trim();

  if (!normalizedGroupId) {
    throw new MissingImportSessionMethodError("Select a server-returned group before creating a group import session.");
  }

  if (typeof client.listGroups !== "function") {
    throw new MissingImportSessionMethodError("Group selection is not available in this web client build.");
  }

  const groups = await client.listGroups({ accessToken });
  if (!groups.groups.some((group) => group.id === normalizedGroupId)) {
    throw new MissingImportSessionMethodError("The selected group is no longer available. Refresh groups and select again.");
  }

  if (typeof client.createGroupBillCsvImportSession !== "function") {
    throw new MissingImportSessionMethodError("Group CSV import sessions are not available in this web client build.");
  }

  return client.createGroupBillCsvImportSession(normalizedGroupId, csvText, { accessToken });
}

async function ensureGroupStillServerReturned(
  client: BillImportSessionRuntimeClient,
  accessToken: string,
  session: BillCsvImportSessionResponse
) {
  if (session.scope !== "group") {
    return;
  }

  if (!session.groupId) {
    throw new MissingImportSessionMethodError("Settleora returned a group import session without group metadata.");
  }

  if (typeof client.listGroups !== "function") {
    throw new MissingImportSessionMethodError("Group selection is not available in this web client build.");
  }

  const groups = await client.listGroups({ accessToken });
  if (!groups.groups.some((group) => group.id === session.groupId)) {
    throw new MissingImportSessionMethodError("The import session group is no longer available. Refresh groups and create a new session.");
  }
}

function mapImportSessionResponse(session: BillCsvImportSessionResponse): BillImportSessionRuntimeState {
  if (session.status === "expired") {
    return {
      status: "session_expired",
      message: "This import session expired. Create a new import session before importing bills.",
      session
    };
  }

  if (session.status === "discarded") {
    return {
      status: "discarded",
      message: "The import session was discarded. No bills were imported.",
      session
    };
  }

  if (session.status === "confirmed") {
    return {
      status: "confirmed",
      message: "Settleora reports this import session is already confirmed.",
      session
    };
  }

  if (session.status === "needs_correction") {
    return {
      status: "needs_correction",
      message: session.confirmation.safeMessage || "Correct rejected import rows before importing bills.",
      session
    };
  }

  return {
    status: session.confirmation.confirmable ? "ready" : "needs_correction",
    message: session.confirmation.safeMessage || "Review the server-returned import session before importing bills.",
    session
  };
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

function classifyBillImportPreflightFailure(error: unknown): BillImportPreflightRuntimeState {
  if (error instanceof MissingImportPreflightMethodError) {
    return {
      status: "unavailable",
      message: error.message
    };
  }

  if (error instanceof SettleoraApiError && error.status === 401) {
    return {
      status: "session_expired",
      message: "Your session could not be verified. Sign in again before reviewing a CSV import."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 403) {
    return {
      status: "unavailable",
      message: "This account cannot review CSV import for the requested bill scope."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 404) {
    return {
      status: "unavailable",
      message: "The requested import scope is not available from this Settleora server."
    };
  }

  return {
    status: "error",
    message: "Settleora could not review the CSV import. No import was confirmed."
  };
}

class MissingImportPreflightMethodError extends Error {}

function classifyBillImportSessionFailure(error: unknown, fallback: string): BillImportSessionRuntimeState {
  if (error instanceof MissingImportSessionMethodError) {
    return {
      status: "unavailable",
      message: error.message
    };
  }

  if (error instanceof SettleoraApiError && error.status === 401) {
    return {
      status: "session_expired",
      message: "Your session could not be verified. Sign in again before using CSV import sessions."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 403) {
    return {
      status: "unavailable",
      message: "This account cannot use CSV import sessions for the requested bill scope."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 404) {
    return {
      status: "unavailable",
      message: "The requested import session or scope is not available from this Settleora server."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 409) {
    return {
      status: "conflict",
      message: "Settleora could not confirm this import session because the review state changed. Create a new session before retrying."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 410) {
    return {
      status: "session_expired",
      message: "This import session expired. Create a new import session before importing bills."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 422) {
    return {
      status: "needs_correction",
      message: "Settleora rejected the import session confirmation. Review the latest session details before retrying."
    };
  }

  return {
    status: "error",
    message: fallback
  };
}

class MissingImportSessionMethodError extends Error {}

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
