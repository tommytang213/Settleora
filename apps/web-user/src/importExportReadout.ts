import { SettleoraApiClient } from "../../../packages/client-web/src/generated";

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

const operationMethods = [
  "exportPersonalBillsCsv",
  "exportPersonalBillsJson",
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
      "CSV and JSON export methods are present, but this web slice does not start a browser download.",
    summaryWhenMissing:
      "Personal bill export methods are not available in this web client build.",
    methods: ["exportPersonalBillsCsv", "exportPersonalBillsJson"],
    followUps: [
      "Needs export readiness metadata before controls can describe formats, row limits, privacy rules, and audit expectations.",
      "Future export runtime must use server authorization and a reviewed browser download flow."
    ]
  },
  {
    id: "group-bill-export",
    title: "Group bill export",
    summaryWhenPresent:
      "Group-scoped CSV and JSON export methods are present, but no group export action is started here.",
    summaryWhenMissing:
      "Group bill export methods are not available in this web client build.",
    methods: ["exportGroupBillsCsv", "exportGroupBillsJson"],
    followUps: [
      "Needs export readiness metadata and group-scope selection before a user can confirm what leaves the workspace.",
      "Future group export must preserve API authorization, privacy redactions, and audit coverage."
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
  "Export readiness metadata is not available yet.",
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
    ? ["Readout only", "Operation method exists", "Needs readiness endpoint"]
    : ["Readout only", "Needs readiness endpoint"];
}

function hasMethod(client: object, method: OperationMethod): boolean {
  return typeof (client as Record<string, unknown>)[method] === "function";
}
