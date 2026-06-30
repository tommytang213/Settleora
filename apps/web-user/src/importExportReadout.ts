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
  type LocalBackupPackageArtifactStatusResponse,
  type LocalBackupPackageDownloadActionResponse,
  type LocalBackupPackageGenerationStatusResponse,
  type LocalBackupPackageSessionResponse,
  type LocalBackupRestoreConfirmationSessionCreateRequest,
  type LocalBackupRestoreConfirmationSessionResponse,
  type LocalBackupRestorePreviewCreateRequest,
  type LocalBackupRestorePreviewResponse,
  type BillCsvImportConfirmationResponse,
  type BillCsvImportConfirmRequest,
  type BillCsvImportPreflightResponse,
  type BillCsvImportSessionResponse,
  type SyncLocalStatusResponse
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
export type SyncLocalStatusRuntimeStatus =
  | "idle"
  | "auth_required"
  | "loading"
  | "loaded"
  | "empty"
  | "denied"
  | "session_expired"
  | "server_unavailable"
  | "stale"
  | "unavailable"
  | "error";
export type LocalBackupPackageRuntimeStatus =
  | "idle"
  | "auth_required"
  | "creating_session"
  | "preparing"
  | "ready_to_download"
  | "creating_download_action"
  | "downloading"
  | "downloaded"
  | "blocked"
  | "cancelled"
  | "discarded"
  | "expired"
  | "unavailable"
  | "error";
export type LocalBackupRestorePreviewRuntimeStatus =
  | "idle"
  | "auth_required"
  | "reading"
  | "creating"
  | "ready"
  | "blocked"
  | "expired"
  | "discarded"
  | "session_expired"
  | "unavailable"
  | "error";
export type LocalBackupRestoreConfirmationSessionRuntimeStatus =
  | "idle"
  | "auth_required"
  | "creating"
  | "ready"
  | "refreshing"
  | "discarding"
  | "blocked"
  | "expired"
  | "discarded"
  | "stale_preview"
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

export interface SyncLocalStatusRuntimeClient {
  getSyncLocalStatus?: SettleoraApiClient["getSyncLocalStatus"];
}

export interface LocalBackupPackageRuntimeClient {
  createLocalBackupPackageSession?: SettleoraApiClient["createLocalBackupPackageSession"];
  prepareLocalBackupPackageSession?: SettleoraApiClient["prepareLocalBackupPackageSession"];
  getLocalBackupPackageArtifactStatus?: SettleoraApiClient["getLocalBackupPackageArtifactStatus"];
  createLocalBackupPackageDownloadAction?: SettleoraApiClient["createLocalBackupPackageDownloadAction"];
  downloadLocalBackupPackageContent?: SettleoraApiClient["downloadLocalBackupPackageContent"];
  discardLocalBackupPackageSession?: SettleoraApiClient["discardLocalBackupPackageSession"];
  cancelLocalBackupPackageGeneration?: SettleoraApiClient["cancelLocalBackupPackageGeneration"];
}

export interface LocalBackupRestorePreviewRuntimeClient {
  createLocalBackupRestorePreview?: SettleoraApiClient["createLocalBackupRestorePreview"];
  getLocalBackupRestorePreview?: SettleoraApiClient["getLocalBackupRestorePreview"];
  discardLocalBackupRestorePreview?: SettleoraApiClient["discardLocalBackupRestorePreview"];
}

export interface LocalBackupRestoreConfirmationSessionRuntimeClient {
  createLocalBackupRestoreConfirmationSession?: SettleoraApiClient["createLocalBackupRestoreConfirmationSession"];
  getLocalBackupRestoreConfirmationSession?: SettleoraApiClient["getLocalBackupRestoreConfirmationSession"];
  discardLocalBackupRestoreConfirmationSession?: SettleoraApiClient["discardLocalBackupRestoreConfirmationSession"];
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

export interface SyncLocalStatusRuntimeState {
  status: SyncLocalStatusRuntimeStatus;
  message: string;
  response?: SyncLocalStatusResponse;
}

export interface LocalBackupPackageRuntimeState {
  status: LocalBackupPackageRuntimeStatus;
  message: string;
  session?: LocalBackupPackageSessionResponse;
  artifactStatus?: LocalBackupPackageArtifactStatusResponse | LocalBackupPackageGenerationStatusResponse;
  downloadAction?: LocalBackupPackageDownloadActionResponse;
  filename?: string;
}

export interface LocalBackupRestorePreviewSelectedFile {
  name: string;
  size: number;
  text(): Promise<string>;
}

export interface LocalBackupRestorePreviewRuntimeState {
  status: LocalBackupRestorePreviewRuntimeStatus;
  message: string;
  selectedFileName?: string;
  selectedFileSize?: number;
  preview?: LocalBackupRestorePreviewResponse;
}

export interface LocalBackupRestoreConfirmationSessionRuntimeState {
  status: LocalBackupRestoreConfirmationSessionRuntimeStatus;
  message: string;
  preview?: LocalBackupRestorePreviewResponse;
  confirmationSession?: LocalBackupRestoreConfirmationSessionResponse;
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

export interface LocalBackupPackageRuntimeOptions {
  accessToken?: string | null;
  baseUrl?: string;
  client?: LocalBackupPackageRuntimeClient;
  state?: LocalBackupPackageRuntimeState | null;
  now?: Date;
  downloadAdapter?: BrowserDownloadAdapter;
}

export interface LocalBackupRestorePreviewRuntimeOptions {
  accessToken?: string | null;
  baseUrl?: string;
  client?: LocalBackupRestorePreviewRuntimeClient;
  selectedFile?: LocalBackupRestorePreviewSelectedFile | null;
  packageSha256?: string | null;
  state?: LocalBackupRestorePreviewRuntimeState | null;
  now?: Date;
}

export interface LocalBackupRestoreConfirmationSessionRuntimeOptions {
  accessToken?: string | null;
  baseUrl?: string;
  client?: LocalBackupRestoreConfirmationSessionRuntimeClient;
  preview?: LocalBackupRestorePreviewResponse | null;
  state?: LocalBackupRestoreConfirmationSessionRuntimeState | null;
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
  "getSyncLocalStatus",
  "createLocalBackupPackageSession",
  "prepareLocalBackupPackageSession",
  "getLocalBackupPackageArtifactStatus",
  "createLocalBackupPackageDownloadAction",
  "downloadLocalBackupPackageContent",
  "discardLocalBackupPackageSession",
  "cancelLocalBackupPackageGeneration",
  "createLocalBackupRestorePreview",
  "getLocalBackupRestorePreview",
  "discardLocalBackupRestorePreview",
  "createLocalBackupRestoreConfirmationSession",
  "getLocalBackupRestoreConfirmationSession",
  "discardLocalBackupRestoreConfirmationSession",
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
    title: "Local backup package",
    summaryWhenPresent:
      "Data-only local backup package session, prepare, status, action, and same-API content methods are present.",
    summaryWhenMissing:
      "Data-only local backup package methods are not available in this web client build.",
    methods: [
      "createLocalBackupPackageSession",
      "prepareLocalBackupPackageSession",
      "getLocalBackupPackageArtifactStatus",
      "createLocalBackupPackageDownloadAction",
      "downloadLocalBackupPackageContent",
      "discardLocalBackupPackageSession",
      "cancelLocalBackupPackageGeneration",
      "createLocalBackupRestorePreview",
      "getLocalBackupRestorePreview",
      "discardLocalBackupRestorePreview",
      "createLocalBackupRestoreConfirmationSession",
      "getLocalBackupRestoreConfirmationSession",
      "discardLocalBackupRestoreConfirmationSession"
    ],
    followUps: [
      "This web surface prepares and downloads only the approved short-lived data-only package artifact.",
      "Restore preview sends a selected data-only package to Settleora for safe non-mutating metadata only.",
      "Restore confirmation sessions show metadata only; restore apply, durable encrypted storage, file-byte backup, and browser-local authority remain unavailable."
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
      "Dedicated sync/local status readout is present; sync operation methods stay out of this runtime surface.",
    summaryWhenMissing:
      "Safe user-web sync/local status is not available in this web client build.",
    methods: ["getSyncLocalStatus"],
    followUps: [
      "Status uses the server-derived read-only response and does not hydrate operation history.",
      "Sync submission, local persistence, backup/restore, and conflict resolution remain future reviewed slices."
    ]
  }
];

export const importExportUnsupportedSections = [
  "Personal CSV/JSON export is available only after sign-in and a positive server readiness check.",
  "Group CSV/JSON export needs a safe group selector on this route before it can start.",
  "Import confirmation uses staged server sessions only; direct CSV import remains unavailable.",
  "Local backup package download is data-only; restore preview and restore confirmation sessions are non-mutating metadata only.",
  "Durable encrypted backup storage, file-byte backup, restore apply, and browser-local authority are not implemented.",
  "User-web local-mode persistence is not implemented.",
  "Sync/local status is read-only; no sync queue or operation is submitted.",
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

export async function loadSyncLocalStatus(
  options: {
    accessToken?: string | null;
    baseUrl?: string;
    client?: SyncLocalStatusRuntimeClient;
    now?: Date;
  } = {}
): Promise<SyncLocalStatusRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can show sync and local status."
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  if (typeof client.getSyncLocalStatus !== "function") {
    return {
      status: "unavailable",
      message: "Sync and local status is not available in this web client build."
    };
  }

  try {
    const response = await client.getSyncLocalStatus({ accessToken });

    return evaluateSyncLocalStatusResponse(response, options.now);
  } catch (error) {
    return classifySyncLocalStatusFailure(error);
  }
}

export async function startLocalBackupPackage(
  options: LocalBackupPackageRuntimeOptions
): Promise<LocalBackupPackageRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can prepare a local backup package."
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    if (typeof client.createLocalBackupPackageSession !== "function") {
      throw new MissingLocalBackupPackageMethodError("Local backup package sessions are not available in this web client build.");
    }

    const session = await client.createLocalBackupPackageSession({ accessToken });

    return await prepareLocalBackupPackage({
      ...options,
      accessToken,
      client,
      state: {
        status: "creating_session",
        message: session.safeMessage,
        session
      }
    });
  } catch (error) {
    return classifyLocalBackupPackageFailure(error, "Settleora could not create a local backup package session. No fallback backup file was created.");
  }
}

export async function prepareLocalBackupPackage(
  options: LocalBackupPackageRuntimeOptions
): Promise<LocalBackupPackageRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can prepare a local backup package."
    };
  }

  const sessionId = getLocalBackupPackageSessionId(options.state);
  if (!sessionId) {
    return startLocalBackupPackage(options);
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    if (typeof client.prepareLocalBackupPackageSession !== "function") {
      throw new MissingLocalBackupPackageMethodError("Local backup package preparation is not available in this web client build.");
    }

    const artifactStatus = await client.prepareLocalBackupPackageSession(sessionId, { accessToken });

    return mapLocalBackupPackageArtifactStatus(artifactStatus, options.state?.session, options.now);
  } catch (error) {
    return classifyLocalBackupPackageFailure(error, "Settleora could not prepare the local backup package. No fallback backup file was created.");
  }
}

export async function refreshLocalBackupPackageStatus(
  options: LocalBackupPackageRuntimeOptions
): Promise<LocalBackupPackageRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can read local backup package status."
    };
  }

  const sessionId = getLocalBackupPackageSessionId(options.state);
  if (!sessionId) {
    return {
      status: "idle",
      message: "Prepare a backup package before reading artifact status."
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    if (typeof client.getLocalBackupPackageArtifactStatus !== "function") {
      throw new MissingLocalBackupPackageMethodError("Local backup package artifact status is not available in this web client build.");
    }

    const artifactStatus = await client.getLocalBackupPackageArtifactStatus(sessionId, { accessToken });

    return mapLocalBackupPackageArtifactStatus(artifactStatus, options.state?.session, options.now);
  } catch (error) {
    return classifyLocalBackupPackageFailure(error, "Settleora could not read local backup package status.");
  }
}

export async function downloadLocalBackupPackage(
  options: LocalBackupPackageRuntimeOptions
): Promise<LocalBackupPackageRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can download a local backup package."
    };
  }

  const sessionId = getLocalBackupPackageSessionId(options.state);
  if (!sessionId) {
    return {
      status: "unavailable",
      message: "Prepare a backup package before downloading it."
    };
  }

  const artifactGuard = evaluateLocalBackupPackageDownloadable(options.state?.artifactStatus, options.now);
  if (!artifactGuard.allowed) {
    return {
      status: artifactGuard.status,
      message: artifactGuard.message,
      session: options.state?.session,
      artifactStatus: options.state?.artifactStatus
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    if (typeof client.createLocalBackupPackageDownloadAction !== "function") {
      throw new MissingLocalBackupPackageMethodError("Local backup package download actions are not available in this web client build.");
    }

    if (typeof client.downloadLocalBackupPackageContent !== "function") {
      throw new MissingLocalBackupPackageMethodError("Local backup package content download is not available in this web client build.");
    }

    const downloadAction = await client.createLocalBackupPackageDownloadAction(sessionId, { accessToken });
    const actionGuard = evaluateLocalBackupPackageDownloadAction(downloadAction, options.now);
    if (!actionGuard.allowed) {
      return {
        status: actionGuard.status,
        message: actionGuard.message,
        session: options.state?.session,
        artifactStatus: options.state?.artifactStatus,
        downloadAction
      };
    }

    const downloadActionId = downloadAction.downloadActionId;
    if (!downloadActionId) {
      return {
        status: "blocked",
        message: "Settleora did not return a usable same-API download action.",
        session: options.state?.session,
        artifactStatus: options.state?.artifactStatus,
        downloadAction
      };
    }

    const blob = await client.downloadLocalBackupPackageContent(sessionId, downloadActionId, { accessToken });
    const filename = createLocalBackupPackageFilename(downloadAction);

    (options.downloadAdapter ?? browserDownloadAdapter).saveBlob(blob, filename);

    return {
      status: "downloaded",
      message: "Download backup package completed. The browser received a user-controlled data-only package copy.",
      session: options.state?.session,
      artifactStatus: options.state?.artifactStatus,
      downloadAction,
      filename
    };
  } catch (error) {
    return classifyLocalBackupPackageFailure(error, "Settleora could not download the local backup package. No fallback backup file was created.");
  }
}

export async function cancelLocalBackupPackage(
  options: LocalBackupPackageRuntimeOptions
): Promise<LocalBackupPackageRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can cancel package generation."
    };
  }

  const sessionId = getLocalBackupPackageSessionId(options.state);
  if (!sessionId) {
    return {
      status: "unavailable",
      message: "Create a backup package session before cancelling generation."
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    if (typeof client.cancelLocalBackupPackageGeneration !== "function") {
      throw new MissingLocalBackupPackageMethodError("Local backup package cancellation is not available in this web client build.");
    }

    const artifactStatus = await client.cancelLocalBackupPackageGeneration(sessionId, { accessToken });

    return {
      ...mapLocalBackupPackageArtifactStatus(artifactStatus, options.state?.session, options.now),
      status: "cancelled",
      message: artifactStatus.safeMessage || "Local backup package generation was cancelled."
    };
  } catch (error) {
    return classifyLocalBackupPackageFailure(error, "Settleora could not cancel package generation.");
  }
}

export async function discardLocalBackupPackage(
  options: LocalBackupPackageRuntimeOptions
): Promise<LocalBackupPackageRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can discard a backup package."
    };
  }

  const sessionId = getLocalBackupPackageSessionId(options.state);
  if (!sessionId) {
    return {
      status: "unavailable",
      message: "Create a backup package session before discarding it."
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });

  try {
    if (typeof client.discardLocalBackupPackageSession !== "function") {
      throw new MissingLocalBackupPackageMethodError("Local backup package discard is not available in this web client build.");
    }

    const session = await client.discardLocalBackupPackageSession(sessionId, { accessToken });

    return {
      status: "discarded",
      message: session.safeMessage || "The backup package session was discarded.",
      session
    };
  } catch (error) {
    return classifyLocalBackupPackageFailure(error, "Settleora could not discard the backup package session.");
  }
}

export async function createLocalBackupRestorePreviewRuntime(
  options: LocalBackupRestorePreviewRuntimeOptions
): Promise<LocalBackupRestorePreviewRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can read or preview a backup package.",
      selectedFileName: options.selectedFile?.name,
      selectedFileSize: options.selectedFile?.size
    };
  }

  const selectedFile = options.selectedFile;
  if (!selectedFile) {
    return {
      status: "unavailable",
      message: "Choose a local backup package JSON file before creating a restore preview."
    };
  }

  if (selectedFile.size <= 0) {
    return {
      status: "unavailable",
      message: "Choose a non-empty local backup package JSON file before creating a restore preview.",
      selectedFileName: selectedFile.name,
      selectedFileSize: selectedFile.size
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });
  if (typeof client.createLocalBackupRestorePreview !== "function") {
    return {
      status: "unavailable",
      message: "Restore preview is not available in this web client build.",
      selectedFileName: selectedFile.name,
      selectedFileSize: selectedFile.size
    };
  }

  try {
    const packageContent = await selectedFile.text();
    if (packageContent.trim().length === 0) {
      return {
        status: "unavailable",
        message: "Choose a non-empty local backup package JSON file before creating a restore preview.",
        selectedFileName: selectedFile.name,
        selectedFileSize: selectedFile.size
      };
    }

    const request = createRestorePreviewRequest(packageContent, options.packageSha256);
    const preview = await client.createLocalBackupRestorePreview(request, { accessToken });

    return mapLocalBackupRestorePreviewResponse(preview, options.now, selectedFile);
  } catch (error) {
    return classifyLocalBackupRestorePreviewFailure(
      error,
      "Settleora could not create the restore preview. No package content was displayed or stored.",
      selectedFile
    );
  }
}

export async function refreshLocalBackupRestorePreviewRuntime(
  options: LocalBackupRestorePreviewRuntimeOptions
): Promise<LocalBackupRestorePreviewRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can refresh a restore preview.",
      preview: options.state?.preview
    };
  }

  const previewId = options.state?.preview?.restorePreviewId;
  if (!previewId) {
    return {
      status: "unavailable",
      message: "Create a restore preview before refreshing it."
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });
  if (typeof client.getLocalBackupRestorePreview !== "function") {
    return {
      status: "unavailable",
      message: "Restore preview refresh is not available in this web client build.",
      preview: options.state?.preview
    };
  }

  try {
    const preview = await client.getLocalBackupRestorePreview(previewId, { accessToken });

    return mapLocalBackupRestorePreviewResponse(preview, options.now);
  } catch (error) {
    return classifyLocalBackupRestorePreviewFailure(
      error,
      "Settleora could not refresh the restore preview.",
      undefined,
      options.state?.preview
    );
  }
}

export async function discardLocalBackupRestorePreviewRuntime(
  options: LocalBackupRestorePreviewRuntimeOptions
): Promise<LocalBackupRestorePreviewRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can discard a restore preview.",
      preview: options.state?.preview
    };
  }

  const previewId = options.state?.preview?.restorePreviewId;
  if (!previewId) {
    return {
      status: "unavailable",
      message: "Create a restore preview before discarding it."
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });
  if (typeof client.discardLocalBackupRestorePreview !== "function") {
    return {
      status: "unavailable",
      message: "Restore preview discard is not available in this web client build.",
      preview: options.state?.preview
    };
  }

  try {
    const preview = await client.discardLocalBackupRestorePreview(previewId, { accessToken });

    return mapLocalBackupRestorePreviewResponse(preview, options.now);
  } catch (error) {
    return classifyLocalBackupRestorePreviewFailure(
      error,
      "Settleora could not discard the restore preview.",
      undefined,
      options.state?.preview
    );
  }
}

export async function createLocalBackupRestoreConfirmationSessionRuntime(
  options: LocalBackupRestoreConfirmationSessionRuntimeOptions
): Promise<LocalBackupRestoreConfirmationSessionRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can create restore confirmation metadata.",
      preview: options.preview ?? options.state?.preview
    };
  }

  const restorePreview = options.preview ?? options.state?.preview;
  const previewGuard = evaluateRestorePreviewForConfirmation(restorePreview, options.now);
  if (!previewGuard.allowed) {
    return {
      status: previewGuard.status,
      message: previewGuard.message,
      preview: restorePreview ?? undefined,
      confirmationSession: options.state?.confirmationSession
    };
  }
  if (!restorePreview) {
    return {
      status: "unavailable",
      message: "Create a restore preview before creating restore confirmation metadata.",
      confirmationSession: options.state?.confirmationSession
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });
  if (typeof client.createLocalBackupRestoreConfirmationSession !== "function") {
    return {
      status: "unavailable",
      message: "Restore confirmation metadata sessions are not available in this web client build.",
      preview: restorePreview
    };
  }

  try {
    const confirmationSession = await client.createLocalBackupRestoreConfirmationSession(
      restorePreview.restorePreviewId,
      createLocalBackupRestoreConfirmationRequestFromPreview(restorePreview),
      { accessToken }
    );

    return mapLocalBackupRestoreConfirmationSessionResponse(
      confirmationSession,
      options.now,
      restorePreview
    );
  } catch (error) {
    return classifyLocalBackupRestoreConfirmationSessionFailure(
      error,
      "Settleora could not create restore confirmation metadata. No records were restored.",
      restorePreview,
      options.state?.confirmationSession
    );
  }
}

export async function refreshLocalBackupRestoreConfirmationSessionRuntime(
  options: LocalBackupRestoreConfirmationSessionRuntimeOptions
): Promise<LocalBackupRestoreConfirmationSessionRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can refresh restore confirmation metadata.",
      preview: options.preview ?? options.state?.preview,
      confirmationSession: options.state?.confirmationSession
    };
  }

  const confirmationSessionId = options.state?.confirmationSession?.restoreConfirmationSessionId;
  if (!confirmationSessionId) {
    return {
      status: "unavailable",
      message: "Create a restore confirmation metadata session before refreshing it.",
      preview: options.preview ?? options.state?.preview
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });
  if (typeof client.getLocalBackupRestoreConfirmationSession !== "function") {
    return {
      status: "unavailable",
      message: "Restore confirmation metadata refresh is not available in this web client build.",
      preview: options.preview ?? options.state?.preview,
      confirmationSession: options.state?.confirmationSession
    };
  }

  try {
    const confirmationSession = await client.getLocalBackupRestoreConfirmationSession(
      confirmationSessionId,
      { accessToken }
    );

    return mapLocalBackupRestoreConfirmationSessionResponse(
      confirmationSession,
      options.now,
      options.preview ?? options.state?.preview
    );
  } catch (error) {
    return classifyLocalBackupRestoreConfirmationSessionFailure(
      error,
      "Settleora could not refresh restore confirmation metadata.",
      options.preview ?? options.state?.preview,
      options.state?.confirmationSession
    );
  }
}

export async function discardLocalBackupRestoreConfirmationSessionRuntime(
  options: LocalBackupRestoreConfirmationSessionRuntimeOptions
): Promise<LocalBackupRestoreConfirmationSessionRuntimeState> {
  const accessToken = options.accessToken?.trim();

  if (!accessToken) {
    return {
      status: "auth_required",
      message: "Sign in is required before Settleora can discard restore confirmation metadata.",
      preview: options.preview ?? options.state?.preview,
      confirmationSession: options.state?.confirmationSession
    };
  }

  const confirmationSessionId = options.state?.confirmationSession?.restoreConfirmationSessionId;
  if (!confirmationSessionId) {
    return {
      status: "unavailable",
      message: "Create a restore confirmation metadata session before discarding it.",
      preview: options.preview ?? options.state?.preview
    };
  }

  const client = options.client ?? new SettleoraApiClient({ baseUrl: options.baseUrl ?? "/" });
  if (typeof client.discardLocalBackupRestoreConfirmationSession !== "function") {
    return {
      status: "unavailable",
      message: "Restore confirmation metadata discard is not available in this web client build.",
      preview: options.preview ?? options.state?.preview,
      confirmationSession: options.state?.confirmationSession
    };
  }

  try {
    const confirmationSession = await client.discardLocalBackupRestoreConfirmationSession(
      confirmationSessionId,
      { accessToken }
    );

    return mapLocalBackupRestoreConfirmationSessionResponse(
      confirmationSession,
      options.now,
      options.preview ?? options.state?.preview
    );
  } catch (error) {
    return classifyLocalBackupRestoreConfirmationSessionFailure(
      error,
      "Settleora could not discard restore confirmation metadata.",
      options.preview ?? options.state?.preview,
      options.state?.confirmationSession
    );
  }
}

export function evaluateLocalBackupPackageDownloadable(
  artifactStatus: LocalBackupPackageRuntimeState["artifactStatus"] | undefined,
  now: Date = new Date()
): { allowed: boolean; status: LocalBackupPackageRuntimeStatus; message: string } {
  if (!artifactStatus) {
    return {
      allowed: false,
      status: "unavailable",
      message: "Prepare a backup package before downloading it."
    };
  }

  if (new Date(artifactStatus.expiresAtUtc).getTime() <= now.getTime()) {
    return {
      allowed: false,
      status: "expired",
      message: "This backup package status expired. Prepare a new package before downloading."
    };
  }

  if (artifactStatus.status === "expired") {
    return {
      allowed: false,
      status: "expired",
      message: artifactStatus.safeMessage || "This backup package expired."
    };
  }

  if (artifactStatus.status === "cancelled") {
    return {
      allowed: false,
      status: "cancelled",
      message: artifactStatus.safeMessage || "This backup package generation was cancelled."
    };
  }

  if (artifactStatus.status === "discarded") {
    return {
      allowed: false,
      status: "discarded",
      message: artifactStatus.safeMessage || "This backup package was discarded."
    };
  }

  if (artifactStatus.status === "blocked") {
    return {
      allowed: false,
      status: "blocked",
      message: artifactStatus.safeMessage || "Settleora blocked this backup package."
    };
  }

  if (!artifactStatus.artifactAvailable || !artifactStatus.canDownloadPackage || !artifactStatus.downloadAvailable) {
    return {
      allowed: false,
      status:
        artifactStatus.status === "generation_unavailable" || artifactStatus.status === "download_unavailable"
          ? "unavailable"
          : "blocked",
      message: artifactStatus.safeMessage || "Settleora did not return a downloadable backup package artifact."
    };
  }

  return {
    allowed: true,
    status: "ready_to_download",
    message: artifactStatus.safeMessage
  };
}

export function evaluateSyncLocalStatusResponse(
  response: SyncLocalStatusResponse,
  now: Date = new Date()
): SyncLocalStatusRuntimeState {
  if (new Date(response.expiresAtUtc).getTime() <= now.getTime()) {
    return {
      status: "stale",
      message: "Sync and local status expired. Reload status before using it as a display readout.",
      response
    };
  }

  if (response.sessionState === "session_expired") {
    return {
      status: "session_expired",
      message: response.safeMessage || "Your session expired. Sign in again before reading sync status.",
      response
    };
  }

  if (response.sessionState === "unauthenticated" || response.sessionState === "no_session") {
    return {
      status: "auth_required",
      message: response.safeMessage || "Sign in is required before Settleora can show sync and local status.",
      response
    };
  }

  if (response.serverReachability === "server_unavailable" || response.serverReachability === "offline") {
    return {
      status: "server_unavailable",
      message: response.safeMessage || "Settleora is not reachable. This web build will not switch into local mode.",
      response
    };
  }

  if (!response.available) {
    return {
      status: "unavailable",
      message: response.safeMessage || "Sync and local status is not available for this account.",
      response
    };
  }

  if (response.lastAcceptedServerVersion === null) {
    return {
      status: "empty",
      message: response.safeMessage || "Settleora returned sync status with no visible resource version yet.",
      response
    };
  }

  if (
    response.stableCode === "sync_status_unavailable" ||
    response.stableCode === "sync_unavailable" ||
    response.stableCode === "temporarily_unavailable" ||
    response.stableCode === "policy_disabled"
  ) {
    return {
      status: "unavailable",
      message: response.safeMessage || "Sync and local status is currently unavailable.",
      response
    };
  }

  return {
    status: "loaded",
    message: response.safeMessage || "Sync and local status loaded from Settleora.",
    response
  };
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

export function createLocalBackupPackageFilename(
  response: Pick<LocalBackupPackageDownloadActionResponse, "safeFilename" | "contentType">
): string {
  const safeFilename = response.safeFilename?.trim();

  if (
    safeFilename &&
    !/[\\/]/.test(safeFilename) &&
    !/(storage|object|bucket|signed|token|url|path|tmp|temp)/i.test(safeFilename)
  ) {
    return safeFilename;
  }

  return "settleora-local-backup-data-only.json";
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
    return id === "local-backup-restore" && hasAllMethods ? "operation_method_exists" : "not_available_yet";
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
    return hasAllMethods
      ? ["Data-only", "Same-API download", "Preview only"]
      : ["Not available yet", "Future reviewed slice"];
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

function getLocalBackupPackageSessionId(
  state: LocalBackupPackageRuntimeState | null | undefined
): string | null {
  return state?.session?.packageSessionId ?? state?.artifactStatus?.packageSessionId ?? state?.downloadAction?.packageSessionId ?? null;
}

function mapLocalBackupPackageArtifactStatus(
  artifactStatus: LocalBackupPackageArtifactStatusResponse | LocalBackupPackageGenerationStatusResponse,
  session: LocalBackupPackageSessionResponse | undefined,
  now: Date = new Date()
): LocalBackupPackageRuntimeState {
  if (new Date(artifactStatus.expiresAtUtc).getTime() <= now.getTime() || artifactStatus.status === "expired") {
    return {
      status: "expired",
      message: artifactStatus.safeMessage || "This backup package expired. Prepare a new package before downloading.",
      session,
      artifactStatus
    };
  }

  if (artifactStatus.status === "cancelled") {
    return {
      status: "cancelled",
      message: artifactStatus.safeMessage || "Local backup package generation was cancelled.",
      session,
      artifactStatus
    };
  }

  if (artifactStatus.status === "discarded") {
    return {
      status: "discarded",
      message: artifactStatus.safeMessage || "This backup package was discarded.",
      session,
      artifactStatus
    };
  }

  if (artifactStatus.status === "blocked") {
    return {
      status: "blocked",
      message: artifactStatus.safeMessage || "Settleora blocked this backup package.",
      session,
      artifactStatus
    };
  }

  if (artifactStatus.status === "generation_unavailable" || artifactStatus.status === "download_unavailable") {
    return {
      status: "unavailable",
      message: artifactStatus.safeMessage || "Local backup package generation or download is unavailable.",
      session,
      artifactStatus
    };
  }

  if (artifactStatus.status === "stale_recheck_required") {
    return {
      status: "blocked",
      message: artifactStatus.safeMessage || "Refresh package status before downloading.",
      session,
      artifactStatus
    };
  }

  const guard = evaluateLocalBackupPackageDownloadable(artifactStatus, now);

  return {
    status: guard.allowed ? "ready_to_download" : guard.status,
    message: guard.allowed
      ? artifactStatus.safeMessage || "The data-only backup package is ready to download."
      : guard.message,
    session,
    artifactStatus
  };
}

export function mapLocalBackupRestorePreviewResponse(
  preview: LocalBackupRestorePreviewResponse,
  now: Date = new Date(),
  selectedFile?: Pick<LocalBackupRestorePreviewSelectedFile, "name" | "size">
): LocalBackupRestorePreviewRuntimeState {
  const base = {
    selectedFileName: selectedFile?.name,
    selectedFileSize: selectedFile?.size,
    preview
  };

  if (new Date(preview.expiresAtUtc).getTime() <= now.getTime() || preview.status === "expired") {
    return {
      ...base,
      status: "expired",
      message: preview.safeMessage || "This restore preview expired. Create a new preview before reviewing it."
    };
  }

  if (preview.status === "discarded") {
    return {
      ...base,
      status: "discarded",
      message: preview.safeMessage || "This restore preview was discarded. No records were restored."
    };
  }

  if (
    ![
      "unsupported",
      "future_gate_required",
      "metadata_only",
      "unavailable",
      "blocked"
    ].includes(preview.restoreConfirmationState)
  ) {
    return {
      ...base,
      status: "blocked",
      message: "Settleora returned an unknown restore confirmation state. Restore preview is blocked."
    };
  }

  if (
    preview.status === "ready" &&
    preview.stableCode === "restore_preview_ready" &&
    preview.nextAllowedActions.every((action) => action === "get_restore_preview" || action === "discard_restore_preview")
  ) {
    return {
      ...base,
      status: "ready",
      message: preview.safeMessage || "Restore preview metadata loaded. No records were restored."
    };
  }

  if (
    preview.stableCode === "temporarily_unavailable" ||
    preview.stableCode === "missing_package_content"
  ) {
    return {
      ...base,
      status: "unavailable",
      message: preview.safeMessage || "Restore preview is unavailable for this package."
    };
  }

  return {
    ...base,
    status: "blocked",
    message: preview.safeMessage || "Settleora blocked this backup package restore preview."
  };
}

export function createLocalBackupRestoreConfirmationRequestFromPreview(
  preview: LocalBackupRestorePreviewResponse
): LocalBackupRestoreConfirmationSessionCreateRequest {
  return {
    confirmationLabel: "Restore selected records",
    selectedRestoreScope: "server_mode_copy_data_only",
    expectedRestorePreviewId: preview.restorePreviewId,
    expectedPackageSha256: preview.packageSha256,
    expectedPreviewStableCode: preview.stableCode
  };
}

export function mapLocalBackupRestoreConfirmationSessionResponse(
  confirmationSession: LocalBackupRestoreConfirmationSessionResponse,
  now: Date = new Date(),
  preview?: LocalBackupRestorePreviewResponse
): LocalBackupRestoreConfirmationSessionRuntimeState {
  const base = {
    preview,
    confirmationSession
  };

  if (
    new Date(confirmationSession.expiresAtUtc).getTime() <= now.getTime() ||
    confirmationSession.status === "expired" ||
    confirmationSession.restoreConfirmationState === "expired"
  ) {
    return {
      ...base,
      status: "expired",
      message: confirmationSession.safeMessage || "This restore confirmation metadata session expired. Create a new restore preview before retrying."
    };
  }

  if (
    confirmationSession.status === "discarded" ||
    confirmationSession.restoreConfirmationState === "discarded"
  ) {
    return {
      ...base,
      status: "discarded",
      message: confirmationSession.safeMessage || "This restore confirmation metadata session was discarded. No records were restored."
    };
  }

  if (confirmationSession.restoreConfirmationState === "stale_preview") {
    return {
      ...base,
      status: "stale_preview",
      message: confirmationSession.safeMessage || "The restore preview is stale. Create a new preview before reviewing confirmation metadata."
    };
  }

  if (
    confirmationSession.stableCode === "restore_confirmation_idempotency_conflict" ||
    confirmationSession.stableCode === "restore_current_record_conflict"
  ) {
    return {
      ...base,
      status: "conflict",
      message: confirmationSession.safeMessage || "Settleora reported a restore confirmation metadata conflict. No records were restored."
    };
  }

  if (
    confirmationSession.status === "metadata_only" &&
    confirmationSession.stableCode === "restore_confirmation_metadata_only" &&
    confirmationSession.selectedScope === "server_mode_copy_data_only" &&
    confirmationSession.canApplyRestore === false &&
    confirmationSession.mutationAvailability === "unavailable" &&
    confirmationSession.restoreConfirmationState === "future_gate_required"
  ) {
    return {
      ...base,
      status: "ready",
      message: confirmationSession.safeMessage || "Restore confirmation metadata loaded. Restore apply is unavailable and no records were restored."
    };
  }

  if (
    confirmationSession.stableCode === "restore_confirmation_unavailable" ||
    confirmationSession.stableCode === "restore_confirmation_policy_disabled" ||
    confirmationSession.stableCode === "temporarily_unavailable"
  ) {
    return {
      ...base,
      status: "unavailable",
      message: confirmationSession.safeMessage || "Restore confirmation metadata is unavailable for this preview."
    };
  }

  if (
    confirmationSession.status === "blocked" ||
    confirmationSession.restoreConfirmationState === "blocked"
  ) {
    return {
      ...base,
      status: "blocked",
      message: confirmationSession.safeMessage || "Settleora blocked this restore confirmation metadata session. No records were restored."
    };
  }

  return {
    ...base,
    status: "blocked",
    message: confirmationSession.safeMessage || "Settleora returned restore confirmation metadata that this web build cannot safely use."
  };
}

function evaluateLocalBackupPackageDownloadAction(
  action: LocalBackupPackageDownloadActionResponse,
  now: Date = new Date()
): { allowed: true; message: string } | { allowed: false; status: LocalBackupPackageRuntimeStatus; message: string } {
  if (action.status === "expired" || new Date(action.expiresAtUtc).getTime() <= now.getTime()) {
    return {
      allowed: false,
      status: "expired",
      message: action.safeMessage || "This backup package download action expired."
    };
  }

  if (action.status === "cancelled") {
    return {
      allowed: false,
      status: "cancelled",
      message: action.safeMessage || "This backup package generation was cancelled."
    };
  }

  if (action.status === "discarded") {
    return {
      allowed: false,
      status: "discarded",
      message: action.safeMessage || "This backup package was discarded."
    };
  }

  if (action.status === "blocked") {
    return {
      allowed: false,
      status: "blocked",
      message: action.safeMessage || "Settleora blocked this backup package download."
    };
  }

  if (
    !action.downloadAvailable ||
    !action.canDownloadPackage ||
    !action.artifactAvailable ||
    !action.downloadActionId ||
    !action.contentPath
  ) {
    return {
      allowed: false,
      status: action.status === "download_unavailable" ? "unavailable" : "blocked",
      message: action.safeMessage || "Settleora did not return a usable same-API download action."
    };
  }

  return {
    allowed: true,
    message: action.safeMessage
  };
}

function createRestorePreviewRequest(
  packageContent: string,
  packageSha256: string | null | undefined
): LocalBackupRestorePreviewCreateRequest {
  const normalizedPackageSha256 = packageSha256?.trim();

  return normalizedPackageSha256
    ? { packageContent, packageSha256: normalizedPackageSha256 }
    : { packageContent, packageSha256: null };
}

function evaluateRestorePreviewForConfirmation(
  preview: LocalBackupRestorePreviewResponse | null | undefined,
  now: Date = new Date()
): {
  allowed: boolean;
  status: LocalBackupRestoreConfirmationSessionRuntimeStatus;
  message: string;
} {
  if (!preview?.restorePreviewId) {
    return {
      allowed: false,
      status: "unavailable",
      message: "Create a restore preview before creating restore confirmation metadata."
    };
  }

  if (new Date(preview.expiresAtUtc).getTime() <= now.getTime() || preview.status === "expired") {
    return {
      allowed: false,
      status: "expired",
      message: "This restore preview expired. Create a new preview before creating restore confirmation metadata."
    };
  }

  if (preview.status === "discarded") {
    return {
      allowed: false,
      status: "discarded",
      message: "This restore preview was discarded. Create a new preview before creating restore confirmation metadata."
    };
  }

  if (preview.status !== "ready" || preview.stableCode !== "restore_preview_ready") {
    return {
      allowed: false,
      status: "blocked",
      message: "Settleora did not return a ready restore preview. Confirmation metadata is blocked."
    };
  }

  return {
    allowed: true,
    status: "creating",
    message: "Restore preview is ready for metadata-only confirmation."
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

function classifySyncLocalStatusFailure(error: unknown): SyncLocalStatusRuntimeState {
  if (error instanceof SettleoraApiError && error.status === 401) {
    return {
      status: "session_expired",
      message: "Your session could not be verified. Sign in again before reading sync and local status."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 403) {
    return {
      status: "denied",
      message: "This account cannot read sync and local status."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 404) {
    return {
      status: "unavailable",
      message: "Sync and local status is not available from this Settleora server."
    };
  }

  if (error instanceof SettleoraApiError && error.status >= 500) {
    return {
      status: "server_unavailable",
      message: "Settleora could not return sync and local status right now."
    };
  }

  return {
    status: "error",
    message: "Settleora could not load sync and local status. No local mode or sync queue was created."
  };
}

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

function classifyLocalBackupPackageFailure(
  error: unknown,
  fallback: string
): LocalBackupPackageRuntimeState {
  if (error instanceof MissingLocalBackupPackageMethodError) {
    return {
      status: "unavailable",
      message: error.message
    };
  }

  if (error instanceof SettleoraApiError && error.status === 401) {
    return {
      status: "expired",
      message: "Your session could not be verified. Sign in again before preparing or downloading a backup package."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 403) {
    return {
      status: "blocked",
      message: "This account cannot prepare or download the requested backup package."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 404) {
    return {
      status: "unavailable",
      message: "Local backup package runtime is not available from this Settleora server."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 409) {
    return {
      status: "blocked",
      message: "Settleora reported the backup package state changed. Refresh status before retrying."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 410) {
    return {
      status: "expired",
      message: "This backup package expired. Prepare a new package before downloading."
    };
  }

  if (error instanceof SettleoraApiError && error.status >= 500) {
    return {
      status: "unavailable",
      message: "Settleora could not prepare or download the backup package right now."
    };
  }

  return {
    status: "error",
    message: fallback
  };
}

class MissingLocalBackupPackageMethodError extends Error {}

function classifyLocalBackupRestorePreviewFailure(
  error: unknown,
  fallback: string,
  selectedFile?: Pick<LocalBackupRestorePreviewSelectedFile, "name" | "size">,
  preview?: LocalBackupRestorePreviewResponse
): LocalBackupRestorePreviewRuntimeState {
  const base = {
    selectedFileName: selectedFile?.name,
    selectedFileSize: selectedFile?.size,
    preview
  };

  if (error instanceof SettleoraApiError && error.status === 401) {
    return {
      ...base,
      status: "session_expired",
      message: "Your session could not be verified. Sign in again before creating or reading a restore preview."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 403) {
    return {
      ...base,
      status: "blocked",
      message: "This account cannot create or read the requested restore preview."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 404) {
    return {
      ...base,
      status: "unavailable",
      message: "Restore preview is not available from this Settleora server."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 409) {
    return {
      ...base,
      status: "blocked",
      message: "Settleora reported the restore preview state changed. Refresh the preview before retrying."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 410) {
    return {
      ...base,
      status: "expired",
      message: "This restore preview expired. Create a new preview before reviewing it."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 413) {
    return {
      ...base,
      status: "blocked",
      message: "Settleora rejected this backup package because it is too large for restore preview."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 400) {
    return {
      ...base,
      status: "blocked",
      message: "Settleora rejected this backup package for restore preview. No package content was displayed."
    };
  }

  if (error instanceof SettleoraApiError && error.status >= 500) {
    return {
      ...base,
      status: "unavailable",
      message: "Settleora could not create or read the restore preview right now."
    };
  }

  return {
    ...base,
    status: "error",
    message: fallback
  };
}

function classifyLocalBackupRestoreConfirmationSessionFailure(
  error: unknown,
  fallback: string,
  preview?: LocalBackupRestorePreviewResponse,
  confirmationSession?: LocalBackupRestoreConfirmationSessionResponse
): LocalBackupRestoreConfirmationSessionRuntimeState {
  const base = {
    preview,
    confirmationSession
  };

  if (error instanceof SettleoraApiError && error.status === 401) {
    return {
      ...base,
      status: "session_expired",
      message: "Your session could not be verified. Sign in again before creating or reading restore confirmation metadata."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 403) {
    return {
      ...base,
      status: "blocked",
      message: "This account cannot create or read the requested restore confirmation metadata."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 404) {
    return {
      ...base,
      status: "unavailable",
      message: "Restore confirmation metadata is not available from this Settleora server."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 409) {
    return {
      ...base,
      status: "conflict",
      message: "Settleora reported the restore preview or confirmation metadata changed. Refresh before retrying."
    };
  }

  if (error instanceof SettleoraApiError && error.status === 410) {
    return {
      ...base,
      status: "expired",
      message: "This restore confirmation metadata expired. Create a new restore preview before retrying."
    };
  }

  if (error instanceof SettleoraApiError && error.status >= 500) {
    return {
      ...base,
      status: "unavailable",
      message: "Settleora could not create or read restore confirmation metadata right now."
    };
  }

  return {
    ...base,
    status: "error",
    message: fallback
  };
}

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
