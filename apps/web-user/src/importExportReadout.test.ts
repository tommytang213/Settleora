import { describe, expect, it, vi } from "vitest";
import {
  checkBillExportReadiness,
  confirmBillCsvImportSessionRuntime,
  createBillExportFilename,
  createLocalBackupPackageFilename,
  createBillCsvImportSession,
  createImportConfirmRequestFromSession,
  createLocalBackupRestorePreviewRuntime,
  cancelLocalBackupPackage,
  discardBillCsvImportSessionRuntime,
  discardLocalBackupPackage,
  discardLocalBackupRestorePreviewRuntime,
  downloadBillExport,
  downloadLocalBackupPackage,
  evaluateLocalBackupPackageDownloadable,
  evaluateSyncLocalStatusResponse,
  evaluateBillImportSessionConfirmable,
  evaluateBillImportPreflightScope,
  evaluateBillExportReadiness,
  getMissingImportExportMethods,
  getPresentImportExportMethods,
  labelImportExportStatus,
  loadImportExportReadout,
  loadSyncLocalStatus,
  mapLocalBackupRestorePreviewResponse,
  preflightBillCsvImport,
  refreshLocalBackupPackageStatus,
  refreshLocalBackupRestorePreviewRuntime,
  startLocalBackupPackage,
  type BillImportSessionRuntimeClient,
  type BillImportPreflightRuntimeClient,
  type BillExportRuntimeClient,
  type LocalBackupPackageRuntimeClient,
  type LocalBackupRestorePreviewRuntimeClient,
  type SyncLocalStatusRuntimeClient
} from "./importExportReadout";
import { loadGroupsReadout } from "./groupsFriendsReadout";
import { SettleoraApiError } from "../../../packages/client-web/src/generated";
import type {
  BillCsvImportConfirmationResponse,
  BillCsvImportPreflightResponse,
  BillCsvImportSessionResponse,
  ExpenseBillExportReadinessResponse,
  GroupResponse,
  LocalBackupPackageArtifactStatusResponse,
  LocalBackupPackageDownloadActionResponse,
  LocalBackupPackageGenerationStatusResponse,
  LocalBackupPackageSessionResponse,
  LocalBackupRestorePreviewResponse,
  SyncLocalStatusResponse
} from "../../../packages/client-web/src/generated";

function createOperationClient() {
  return {
    getPersonalBillExportReadiness: vi.fn(),
    exportPersonalBillsCsv: vi.fn(),
    exportPersonalBillsJson: vi.fn(),
    getGroupBillExportReadiness: vi.fn(),
    exportGroupBillsCsv: vi.fn(),
    exportGroupBillsJson: vi.fn(),
    preflightPersonalBillsCsvImport: vi.fn(),
    preflightGroupBillsCsvImport: vi.fn(),
    createPersonalBillCsvImportSession: vi.fn(),
    createGroupBillCsvImportSession: vi.fn(),
    getBillCsvImportSession: vi.fn(),
    confirmBillCsvImportSession: vi.fn(),
    discardBillCsvImportSession: vi.fn(),
    listGroups: vi.fn(),
    getSyncLocalStatus: vi.fn(),
    createLocalBackupPackageSession: vi.fn(),
    prepareLocalBackupPackageSession: vi.fn(),
    getLocalBackupPackageArtifactStatus: vi.fn(),
    createLocalBackupPackageDownloadAction: vi.fn(),
    downloadLocalBackupPackageContent: vi.fn(),
    discardLocalBackupPackageSession: vi.fn(),
    cancelLocalBackupPackageGeneration: vi.fn(),
    createLocalBackupRestorePreview: vi.fn(),
    getLocalBackupRestorePreview: vi.fn(),
    discardLocalBackupRestorePreview: vi.fn(),
    importPersonalBillsCsv: vi.fn(),
    importGroupBillsCsv: vi.fn(),
    listSyncChanges: vi.fn(),
    submitSyncOperation: vi.fn(),
    getSyncOperation: vi.fn()
  };
}

describe("import/export availability readout", () => {
  it("maps generated-client method presence to display-only statuses", () => {
    const client = createOperationClient();
    const readout = loadImportExportReadout({ client });

    expect(readout.status).toBe("loaded");
    expect(readout.methodsFound).toEqual([
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
      "importPersonalBillsCsv",
      "importGroupBillsCsv",
      "listSyncChanges",
      "submitSyncOperation",
      "getSyncOperation"
    ]);
    expect(readout.missingMethods).toEqual([]);

    expect(readout.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "personal-bill-export",
          status: "operation_method_exists",
          methodsPresent: ["getPersonalBillExportReadiness", "exportPersonalBillsCsv", "exportPersonalBillsJson"]
        }),
        expect.objectContaining({
          id: "group-bill-export",
          status: "operation_method_exists",
          methodsPresent: ["getGroupBillExportReadiness", "exportGroupBillsCsv", "exportGroupBillsJson"]
        }),
        expect.objectContaining({
          id: "personal-bill-import",
          status: "operation_method_exists",
          methodsPresent: [
            "preflightPersonalBillsCsvImport",
            "createPersonalBillCsvImportSession",
            "getBillCsvImportSession",
            "confirmBillCsvImportSession",
            "discardBillCsvImportSession",
            "importPersonalBillsCsv"
          ]
        }),
        expect.objectContaining({
          id: "group-bill-import",
          status: "operation_method_exists",
          methodsPresent: [
            "preflightGroupBillsCsvImport",
            "createGroupBillCsvImportSession",
            "getBillCsvImportSession",
            "confirmBillCsvImportSession",
            "discardBillCsvImportSession",
            "listGroups",
            "importGroupBillsCsv"
          ]
        }),
        expect.objectContaining({
          id: "local-backup-restore",
          status: "operation_method_exists",
          methodsPresent: [
            "createLocalBackupPackageSession",
            "prepareLocalBackupPackageSession",
            "getLocalBackupPackageArtifactStatus",
            "createLocalBackupPackageDownloadAction",
            "downloadLocalBackupPackageContent",
            "discardLocalBackupPackageSession",
            "cancelLocalBackupPackageGeneration",
            "createLocalBackupRestorePreview",
            "getLocalBackupRestorePreview",
            "discardLocalBackupRestorePreview"
          ]
        }),
        expect.objectContaining({
          id: "sync-status",
          status: "readout_only",
          methodsPresent: ["getSyncLocalStatus"]
        })
      ])
    );
  });

  it("reports missing methods without inventing fake availability", () => {
    const readout = loadImportExportReadout({
      client: {
        exportPersonalBillsCsv: vi.fn(),
        importPersonalBillsCsv: vi.fn()
      }
    });

    expect(readout.missingMethods).toEqual([
      "getPersonalBillExportReadiness",
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
      "importGroupBillsCsv",
      "listSyncChanges",
      "submitSyncOperation",
      "getSyncOperation"
    ]);
    expect(readout.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "group-bill-export",
          status: "needs_readiness_endpoint",
          methodsPresent: []
        }),
        expect.objectContaining({
          id: "local-backup-restore",
          status: "not_available_yet",
          methodsPresent: []
        }),
        expect.objectContaining({
          id: "local-server-migration",
          status: "not_available_yet",
          methodsPresent: []
        })
      ])
    );
    expect(getMissingImportExportMethods({})).toContain("exportPersonalBillsCsv");
    expect(getPresentImportExportMethods({ importGroupBillsCsv: vi.fn() })).toEqual(["importGroupBillsCsv"]);
  });

  it("does not call export, import, or sync operation methods at runtime", () => {
    const client = createOperationClient();

    const readout = loadImportExportReadout({ client });

    expect(readout.intentionallyNotCalled).toEqual([
      "importPersonalBillsCsv",
      "importGroupBillsCsv",
      "listSyncChanges",
      "submitSyncOperation",
      "getSyncOperation"
    ]);
    for (const method of Object.values(client)) {
      expect(method).not.toHaveBeenCalled();
    }
  });

  it("keeps unsupported and follow-up copy product-facing", () => {
    const readout = loadImportExportReadout({ client: createOperationClient() });
    const copy = [
      readout.message,
      ...readout.unsupportedSections,
      ...readout.capabilities.flatMap((capability) => [
        capability.title,
        capability.summary,
        labelImportExportStatus(capability.status),
        ...capability.chips,
        ...capability.followUps
      ])
    ].join(" ");

    expect(copy).toContain("export readiness");
    expect(copy).toContain("Personal CSV/JSON export");
    expect(copy).toContain("Group CSV/JSON export");
    expect(copy).toContain("Import");
    expect(copy).toContain("Local backup package");
    expect(copy).toContain("User-web local-mode persistence");
    expect(copy).toContain("Sync/local status");
    expect(copy).toContain("Report/export history");
    expect(copy).not.toMatch(/fake session|fake data|storage path|object key|file bytes|download started|upload started/i);
  });
});

describe("sync/local status runtime", () => {
  it("auth-gates before the generated sync/local status method is called", async () => {
    const client = createSyncLocalStatusClient();

    const result = await loadSyncLocalStatus({
      accessToken: " ",
      client
    });

    expect(result).toEqual({
      status: "auth_required",
      message: "Sign in is required before Settleora can show sync and local status."
    });
    expect(client.getSyncLocalStatus).not.toHaveBeenCalled();
  });

  it("calls only getSyncLocalStatus with the authenticated request shape", async () => {
    const forbidden = createForbiddenSyncLocalMethods();
    const client = { ...createSyncLocalStatusClient(), ...forbidden };

    const result = await loadSyncLocalStatus({
      accessToken: " token ",
      client
    });

    expect(result.status).toBe("loaded");
    expect(result.response?.stableCode).toBe("server_mode_active");
    expect(client.getSyncLocalStatus).toHaveBeenCalledWith({ accessToken: "token" });
    expectForbiddenSyncLocalMethodsNotCalled(forbidden);
  });

  it("maps server-returned sync/local status fields without inventing local data", async () => {
    const response = createSyncLocalStatusResponse({
      safeMessage: "Server mode is active for this account.",
      lastAcceptedServerVersion: 42,
      failedOperationSummary: {
        state: "available",
        count: 2,
        stableCode: "sync_failed_present",
        safeMessage: "Two server-known sync operations failed."
      },
      conflictSummary: {
        state: "available",
        count: 1,
        stableCode: "sync_conflict_present",
        safeMessage: "One server-known conflict is visible."
      }
    });
    const result = await loadSyncLocalStatus({
      accessToken: "token",
      client: createSyncLocalStatusClient({ response })
    });

    expect(result).toEqual({
      status: "loaded",
      message: "Server mode is active for this account.",
      response
    });
    expect(JSON.stringify(result)).toContain("sync_conflict_present");
    expect(JSON.stringify(result)).toContain("local_backup_restore");
    expect(JSON.stringify(result)).not.toMatch(/localStorage|sessionStorage|indexedDB|fake local|object key|storage path/i);
  });

  it("maps unavailable, empty, expired, denied, and server unavailable states fail-closed", async () => {
    expect(
      evaluateSyncLocalStatusResponse(
        createSyncLocalStatusResponse({ expiresAtUtc: "2026-06-29T00:00:00.000Z" }),
        new Date("2026-06-29T00:00:01.000Z")
      ).status
    ).toBe("stale");

    expect(
      evaluateSyncLocalStatusResponse(
        createSyncLocalStatusResponse({ lastAcceptedServerVersion: null })
      ).status
    ).toBe("empty");

    expect(
      evaluateSyncLocalStatusResponse(
        createSyncLocalStatusResponse({
          available: false,
          stableCode: "sync_status_unavailable",
          safeMessage: "Status is temporarily unavailable."
        })
      )
    ).toEqual(
      expect.objectContaining({
        status: "unavailable",
        message: "Status is temporarily unavailable."
      })
    );

    expect(
      evaluateSyncLocalStatusResponse(
        createSyncLocalStatusResponse({
          sessionState: "session_expired",
          stableCode: "session_expired",
          safeMessage: "Session expired."
        })
      ).status
    ).toBe("session_expired");

    expect(
      evaluateSyncLocalStatusResponse(
        createSyncLocalStatusResponse({
          serverReachability: "server_unavailable",
          stableCode: "server_unreachable",
          safeMessage: "Server unavailable."
        })
      ).status
    ).toBe("server_unavailable");
  });

  it("reports missing method and API failures without calling forbidden sync or storage APIs", async () => {
    const forbidden = createForbiddenSyncLocalMethods();
    const missing = await loadSyncLocalStatus({
      accessToken: "token",
      client: { ...forbidden, getSyncLocalStatus: undefined }
    });
    const expired = await loadSyncLocalStatus({
      accessToken: "token",
      client: createThrowingSyncLocalStatusClient(new SettleoraApiError(401, "Unauthorized", {}))
    });
    const denied = await loadSyncLocalStatus({
      accessToken: "token",
      client: createThrowingSyncLocalStatusClient(new SettleoraApiError(403, "Forbidden", {}))
    });
    const unavailable = await loadSyncLocalStatus({
      accessToken: "token",
      client: createThrowingSyncLocalStatusClient(new SettleoraApiError(503, "Unavailable", {}))
    });

    expect(missing.status).toBe("unavailable");
    expect(expired.status).toBe("session_expired");
    expect(denied.status).toBe("denied");
    expect(unavailable.status).toBe("server_unavailable");
    expectForbiddenSyncLocalMethodsNotCalled(forbidden);
  });
});

describe("readiness-driven bill export runtime", () => {
  it("auth-gates before readiness or export methods are called", async () => {
    const client = createExportRuntimeClient();

    const readiness = await checkBillExportReadiness({
      accessToken: " ",
      scope: "personal",
      format: "csv",
      client
    });
    const exportResult = await downloadBillExport({
      accessToken: null,
      scope: "personal",
      format: "json",
      client
    });

    expect(readiness.status).toBe("auth_required");
    expect(exportResult.status).toBe("auth_required");
    expect(client.getPersonalBillExportReadiness).not.toHaveBeenCalled();
    expect(client.exportPersonalBillsCsv).not.toHaveBeenCalled();
    expect(client.exportPersonalBillsJson).not.toHaveBeenCalled();
  });

  it("auth-gates group list, group readiness, and group export calls", async () => {
    const listGroups = vi.fn();
    const client = createExportRuntimeClient();

    const groups = await loadGroupsReadout({
      accessToken: "",
      client: { listGroups } as never
    });
    const readiness = await checkBillExportReadiness({
      accessToken: " ",
      scope: "group",
      groupId: "group-1",
      format: "csv",
      client
    });
    const exportResult = await downloadBillExport({
      accessToken: null,
      scope: "group",
      groupId: "group-1",
      format: "json",
      client
    });

    expect(groups.status).toBe("auth_required");
    expect(readiness.status).toBe("auth_required");
    expect(exportResult.status).toBe("auth_required");
    expect(listGroups).not.toHaveBeenCalled();
    expect(client.getGroupBillExportReadiness).not.toHaveBeenCalled();
    expect(client.exportGroupBillsCsv).not.toHaveBeenCalled();
    expect(client.exportGroupBillsJson).not.toHaveBeenCalled();
  });

  it("loads selectable group context only from server-returned group rows", async () => {
    const groups: GroupResponse[] = [
      createGroup({ id: "group-1", name: "Dinner crew" }),
      createGroup({ id: "group-2", name: "Travel" })
    ];
    const listGroups = vi.fn(async () => ({ groups }));

    const readout = await loadGroupsReadout({
      accessToken: "token",
      client: { listGroups } as never
    });

    expect(readout.status).toBe("loaded");
    expect(readout.groups.map((group) => group.id)).toEqual(["group-1", "group-2"]);
    expect(listGroups).toHaveBeenCalledWith({ accessToken: "token" });
  });

  it("fails group selection closed when no groups or no group read method exists", async () => {
    const noGroups = await loadGroupsReadout({
      accessToken: "token",
      client: { listGroups: vi.fn(async () => ({ groups: [] })) } as never
    });
    const missingReadMethod = await loadGroupsReadout({
      accessToken: "token",
      client: {} as never
    });

    expect(noGroups).toEqual({
      status: "empty",
      message: "No visible groups are available for this account yet.",
      groups: []
    });
    expect(missingReadMethod).toEqual({
      status: "unavailable",
      message: "Group selection is not available in this web client build.",
      groups: []
    });
  });

  it("blocks denied, expired, unsupported, or rejected readiness before export", async () => {
    const client = createExportRuntimeClient({
      readiness: createReadiness({
        available: false,
        code: "authorization_denied",
        message: "This account cannot export personal bills."
      })
    });

    const denied = await downloadBillExport({
      accessToken: "token",
      scope: "personal",
      format: "csv",
      client
    });

    expect(denied.status).toBe("blocked");
    expect(client.exportPersonalBillsCsv).not.toHaveBeenCalled();

    expect(
      evaluateBillExportReadiness(
        createReadiness({ expiresAtUtc: "2026-06-29T00:00:00.000Z" }),
        "csv",
        new Date("2026-06-29T00:00:01.000Z")
      )
    ).toEqual({
      allowed: false,
      message: "Export readiness expired. Check readiness again before downloading."
    });

    expect(
      evaluateBillExportReadiness(createReadiness({ requestedFormat: "pdf", supportedFormats: ["csv"] }), "json")
    ).toEqual({
      allowed: false,
      message: "Settleora did not approve the selected export format."
    });

    expect(
      evaluateBillExportReadiness(
        createReadiness({
          rejectedFilters: [{ field: "limit", code: "limit_exceeded", message: "Limit is too high." }]
        }),
        "csv"
      )
    ).toEqual({
      allowed: false,
      message: "Settleora rejected one or more export filters. Refresh readiness before downloading."
    });

    expect(
      evaluateBillExportReadiness(createReadiness({ includesFileBytes: true }), "csv")
    ).toEqual({
      allowed: false,
      message: "This export would include file bytes. File-byte export needs a separate reviewed flow."
    });
  });

  it("checks readiness before CSV export and saves a safe deterministic filename", async () => {
    const csvBlob = new Blob(["id,total\nbill-1,10.00\n"], { type: "text/csv" });
    const client = createExportRuntimeClient({ csvBlob });
    const saveBlob = vi.fn();

    const result = await downloadBillExport({
      accessToken: "token",
      scope: "personal",
      format: "csv",
      client,
      now: new Date("2026-06-29T10:00:00.000Z"),
      downloadAdapter: { saveBlob }
    });

    expect(result.status).toBe("downloaded");
    expect(
      vi.mocked(client.getPersonalBillExportReadiness).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(client.exportPersonalBillsCsv).mock.invocationCallOrder[0]);
    expect(client.exportPersonalBillsCsv).toHaveBeenCalledWith(
      { accessToken: "token" },
      expect.objectContaining({ archiveState: "all", limit: 100 })
    );
    expect(saveBlob).toHaveBeenCalledWith(csvBlob, expect.stringMatching(/^settleora-personal-bills-\d{8}\.csv$/));
    expect(result.filename).not.toMatch(/[\\/]|storage|object|signed|url/i);
  });

  it("checks readiness before JSON export and downloads API-returned model data", async () => {
    const exportResponse = {
      generatedAtUtc: "2026-06-29T06:41:00.000Z",
      appliedFilters: createReadiness().acceptedFilters,
      rowCount: 0,
      rows: []
    };
    const client = createExportRuntimeClient({ jsonResponse: exportResponse });
    const saveBlob = vi.fn();

    const result = await downloadBillExport({
      accessToken: "token",
      scope: "personal",
      format: "json",
      client,
      downloadAdapter: { saveBlob }
    });

    expect(result.status).toBe("downloaded");
    expect(
      vi.mocked(client.getPersonalBillExportReadiness).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(client.exportPersonalBillsJson).mock.invocationCallOrder[0]);
    expect(client.exportPersonalBillsJson).toHaveBeenCalledOnce();
    const [blob, filename] = saveBlob.mock.calls[0] as [Blob, string];
    expect(filename).toMatch(/^settleora-personal-bills-\d{8}\.json$/);
    expect(await readBlobText(blob)).toContain('"rowCount": 0');
  });

  it("supports group export only when an explicit safe group id is supplied", async () => {
    const readiness = createReadiness({ scopeType: "group", groupId: "group-1", requestedFormat: "json" });
    const client = createExportRuntimeClient({
      readiness,
      jsonResponse: {
        generatedAtUtc: "2026-06-29T06:41:00.000Z",
        appliedFilters: readiness.acceptedFilters,
        rowCount: 0,
        rows: []
      }
    });
    const saveBlob = vi.fn();

    const missingGroup = await checkBillExportReadiness({
      accessToken: "token",
      scope: "group",
      format: "json",
      client
    });
    const exported = await downloadBillExport({
      accessToken: "token",
      scope: "group",
      groupId: "group-1",
      format: "json",
      client,
      downloadAdapter: { saveBlob }
    });

    expect(missingGroup.status).toBe("unavailable");
    expect(exported.status).toBe("downloaded");
    expect(client.getGroupBillExportReadiness).toHaveBeenCalledWith(
      "group-1",
      { accessToken: "token" },
      expect.objectContaining({ format: "json" })
    );
    expect(client.exportGroupBillsJson).toHaveBeenCalledWith(
      "group-1",
      { accessToken: "token" },
      expect.objectContaining({ archiveState: "all", limit: 100 })
    );
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^settleora-group-bills-\d{8}\.json$/));
  });

  it("does not call group readiness or export without a selected server group", async () => {
    const client = createExportRuntimeClient();

    const checked = await checkBillExportReadiness({
      accessToken: "token",
      scope: "group",
      groupId: " ",
      format: "csv",
      client
    });
    const exported = await downloadBillExport({
      accessToken: "token",
      scope: "group",
      groupId: null,
      format: "csv",
      client,
      downloadAdapter: { saveBlob: vi.fn() }
    });

    expect(checked.status).toBe("unavailable");
    expect(exported.status).toBe("unavailable");
    expect(client.getGroupBillExportReadiness).not.toHaveBeenCalled();
    expect(client.exportGroupBillsCsv).not.toHaveBeenCalled();
  });

  it("reports missing group readiness method without calling group export", async () => {
    const exportGroupBillsCsv = vi.fn();

    const result = await downloadBillExport({
      accessToken: "token",
      scope: "group",
      groupId: "group-1",
      format: "csv",
      client: { exportGroupBillsCsv },
      downloadAdapter: { saveBlob: vi.fn() }
    });

    expect(result).toEqual({
      status: "unavailable",
      message: "Group export readiness is not available in this web client build."
    });
    expect(exportGroupBillsCsv).not.toHaveBeenCalled();
  });

  it("refreshes group readiness immediately before CSV export", async () => {
    const csvBlob = new Blob(["id,total\n"], { type: "text/csv" });
    const readiness = createReadiness({ scopeType: "group", groupId: "group-1", requestedFormat: "csv" });
    const client = createExportRuntimeClient({ readiness, csvBlob });
    const saveBlob = vi.fn();

    const result = await downloadBillExport({
      accessToken: "token",
      scope: "group",
      groupId: "group-1",
      format: "csv",
      filters: { merchant: "  Cafe  ", search: " " },
      client,
      downloadAdapter: { saveBlob }
    });

    expect(result.status).toBe("downloaded");
    expect(
      vi.mocked(client.getGroupBillExportReadiness).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(client.exportGroupBillsCsv).mock.invocationCallOrder[0]);
    expect(client.getGroupBillExportReadiness).toHaveBeenCalledWith(
      "group-1",
      { accessToken: "token" },
      expect.objectContaining({ archiveState: "all", limit: 100, format: "csv", merchant: "Cafe", search: null })
    );
    expect(client.exportGroupBillsCsv).toHaveBeenCalledWith(
      "group-1",
      { accessToken: "token" },
      expect.objectContaining({ archiveState: "all", limit: 100, merchant: "Cafe", search: null })
    );
    expect(saveBlob).toHaveBeenCalledWith(csvBlob, expect.stringMatching(/^settleora-group-bills-\d{8}\.csv$/));
  });

  it("blocks group export when refreshed readiness would include file bytes", async () => {
    const client = createExportRuntimeClient({
      readiness: createReadiness({ scopeType: "group", groupId: "group-1", includesFileBytes: true })
    });

    const result = await downloadBillExport({
      accessToken: "token",
      scope: "group",
      groupId: "group-1",
      format: "csv",
      client,
      downloadAdapter: { saveBlob: vi.fn() }
    });

    expect(result.status).toBe("blocked");
    expect(result.message).toContain("file bytes");
    expect(client.exportGroupBillsCsv).not.toHaveBeenCalled();
  });

  it("blocks group export when readiness does not match the selected group", async () => {
    const client = createExportRuntimeClient({
      readiness: createReadiness({ scopeType: "group", groupId: "group-2" })
    });

    const result = await downloadBillExport({
      accessToken: "token",
      scope: "group",
      groupId: "group-1",
      format: "csv",
      client,
      downloadAdapter: { saveBlob: vi.fn() }
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "blocked",
        message: "Settleora returned readiness for a different group. Select the group again before exporting."
      })
    );
    expect(client.exportGroupBillsCsv).not.toHaveBeenCalled();
  });

  it("maps group readiness API denial, not found, and generic errors to blocked states", async () => {
    const denied = await checkBillExportReadiness({
      accessToken: "token",
      scope: "group",
      groupId: "group-1",
      format: "csv",
      client: createThrowingGroupReadinessClient(new SettleoraApiError(403, "Forbidden", {}))
    });
    const notFound = await checkBillExportReadiness({
      accessToken: "token",
      scope: "group",
      groupId: "group-1",
      format: "csv",
      client: createThrowingGroupReadinessClient(new SettleoraApiError(404, "Not Found", {}))
    });
    const generic = await checkBillExportReadiness({
      accessToken: "token",
      scope: "group",
      groupId: "group-1",
      format: "csv",
      client: createThrowingGroupReadinessClient(new Error("network"))
    });

    expect(denied).toEqual({
      status: "unavailable",
      message: "This account cannot export the requested bill scope."
    });
    expect(notFound).toEqual({
      status: "unavailable",
      message: "The requested export scope is not available from this Settleora server."
    });
    expect(generic).toEqual({
      status: "error",
      message: "Settleora could not check export readiness. No export was started."
    });
  });

  it("uses browser object URLs only for allowed downloads and revokes them", async () => {
    const createObjectURL = vi.fn(() => "blob:settleora-export");
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL
    });

    try {
      const result = await downloadBillExport({
        accessToken: "token",
        scope: "group",
        groupId: "group-1",
        format: "csv",
        client: createExportRuntimeClient({
          readiness: createReadiness({ scopeType: "group", groupId: "group-1" })
        })
      });

      expect(result.status).toBe("downloaded");
      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:settleora-export");
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("does not call forbidden import or sync methods during export runtime", async () => {
    const forbidden = {
      importPersonalBillsCsv: vi.fn(),
      importGroupBillsCsv: vi.fn(),
      listSyncChanges: vi.fn(),
      submitSyncOperation: vi.fn(),
      getSyncOperation: vi.fn()
    };
    const client = { ...createExportRuntimeClient(), ...forbidden };

    await downloadBillExport({
      accessToken: "token",
      scope: "personal",
      format: "csv",
      client,
      downloadAdapter: { saveBlob: vi.fn() }
    });

    for (const method of Object.values(forbidden)) {
      expect(method).not.toHaveBeenCalled();
    }
  });

  it("creates filenames without paths or provider internals", () => {
    expect(createBillExportFilename("personal", "csv", new Date("2026-06-29T00:00:00.000Z"))).toBe(
      "settleora-personal-bills-20260629.csv"
    );
    expect(createBillExportFilename("group", "json", new Date("2026-06-29T00:00:00.000Z"))).toBe(
      "settleora-group-bills-20260629.json"
    );
  });
});

describe("local backup package runtime", () => {
  it("auth-gates before creating a package session", async () => {
    const client = createLocalBackupPackageClient();

    const result = await startLocalBackupPackage({
      accessToken: " ",
      client
    });

    expect(result).toEqual({
      status: "auth_required",
      message: "Sign in is required before Settleora can prepare a local backup package."
    });
    expect(client.createLocalBackupPackageSession).not.toHaveBeenCalled();
  });

  it("creates a session, prepares the artifact, creates a download action, and saves the API Blob", async () => {
    const packageBlob = new Blob(["{\"manifestVersion\":\"2026-06-30.manifest.v1\"}"], {
      type: "application/vnd.settleora.local-backup+json"
    });
    const client = createLocalBackupPackageClient({ packageBlob });
    const saveBlob = vi.fn();

    const prepared = await startLocalBackupPackage({
      accessToken: " token ",
      client,
      downloadAdapter: { saveBlob }
    });
    const downloaded = await downloadLocalBackupPackage({
      accessToken: "token",
      client,
      state: prepared,
      downloadAdapter: { saveBlob }
    });

    expect(prepared.status).toBe("ready_to_download");
    expect(client.createLocalBackupPackageSession).toHaveBeenCalledWith({ accessToken: "token" });
    expect(
      vi.mocked(client.createLocalBackupPackageSession).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(client.prepareLocalBackupPackageSession).mock.invocationCallOrder[0]);
    expect(client.prepareLocalBackupPackageSession).toHaveBeenCalledWith("package-session-1", { accessToken: "token" });
    expect(client.createLocalBackupPackageDownloadAction).toHaveBeenCalledWith("package-session-1", { accessToken: "token" });
    expect(client.downloadLocalBackupPackageContent).toHaveBeenCalledWith("package-session-1", "download-action-1", { accessToken: "token" });
    expect(saveBlob).toHaveBeenCalledWith(packageBlob, "settleora-local-backup-data-only-20260630.json");
    expect(downloaded).toEqual(
      expect.objectContaining({
        status: "downloaded",
        filename: "settleora-local-backup-data-only-20260630.json"
      })
    );
  });

  it("reports missing generated methods without fake package output", async () => {
    const saveBlob = vi.fn();
    const result = await startLocalBackupPackage({
      accessToken: "token",
      client: {},
      downloadAdapter: { saveBlob }
    });

    expect(result).toEqual({
      status: "unavailable",
      message: "Local backup package sessions are not available in this web client build."
    });
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("blocks download for unavailable, expired, cancelled, discarded, and stale artifact states", async () => {
    expect(
      evaluateLocalBackupPackageDownloadable(
        createLocalBackupArtifactStatus({
          status: "download_unavailable",
          canDownloadPackage: false,
          downloadAvailable: false
        })
      )
    ).toEqual(
      expect.objectContaining({
        allowed: false,
        status: "unavailable"
      })
    );
    expect(
      evaluateLocalBackupPackageDownloadable(createLocalBackupArtifactStatus({ status: "expired" }))
    ).toEqual(expect.objectContaining({ allowed: false, status: "expired" }));
    expect(
      evaluateLocalBackupPackageDownloadable(createLocalBackupArtifactStatus({ status: "cancelled" }))
    ).toEqual(expect.objectContaining({ allowed: false, status: "cancelled" }));
    expect(
      evaluateLocalBackupPackageDownloadable(createLocalBackupArtifactStatus({ status: "discarded" }))
    ).toEqual(expect.objectContaining({ allowed: false, status: "discarded" }));
    expect(
      evaluateLocalBackupPackageDownloadable(
        createLocalBackupArtifactStatus({ expiresAtUtc: "2026-06-30T05:00:00.000Z" }),
        new Date("2026-06-30T05:00:01.000Z")
      )
    ).toEqual(expect.objectContaining({ allowed: false, status: "expired" }));
  });

  it("does not call content download or save a Blob when the artifact is not downloadable", async () => {
    const client = createLocalBackupPackageClient();
    const saveBlob = vi.fn();

    const result = await downloadLocalBackupPackage({
      accessToken: "token",
      client,
      state: {
        status: "blocked",
        message: "Blocked.",
        session: createLocalBackupSession(),
        artifactStatus: createLocalBackupArtifactStatus({ artifactAvailable: false })
      },
      downloadAdapter: { saveBlob }
    });

    expect(result.status).toBe("blocked");
    expect(client.createLocalBackupPackageDownloadAction).not.toHaveBeenCalled();
    expect(client.downloadLocalBackupPackageContent).not.toHaveBeenCalled();
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("refreshes status and maps blocked server states safely", async () => {
    const blocked = createLocalBackupArtifactStatus({
      status: "blocked",
      stableCode: "temporarily_unavailable",
      safeMessage: "Package generation is temporarily unavailable."
    });
    const client = createLocalBackupPackageClient({ artifactStatus: blocked });

    const result = await refreshLocalBackupPackageStatus({
      accessToken: "token",
      client,
      state: {
        status: "ready_to_download",
        message: "Ready.",
        session: createLocalBackupSession()
      }
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "blocked",
        message: "Package generation is temporarily unavailable.",
        artifactStatus: blocked
      })
    );
    expect(client.getLocalBackupPackageArtifactStatus).toHaveBeenCalledWith("package-session-1", { accessToken: "token" });
  });

  it("cancels and discards package sessions through generated methods only", async () => {
    const client = createLocalBackupPackageClient();
    const state = {
      status: "ready_to_download" as const,
      message: "Ready.",
      session: createLocalBackupSession(),
      artifactStatus: createLocalBackupArtifactStatus()
    };

    const cancelled = await cancelLocalBackupPackage({ accessToken: "token", client, state });
    const discarded = await discardLocalBackupPackage({ accessToken: "token", client, state });

    expect(cancelled.status).toBe("cancelled");
    expect(discarded.status).toBe("discarded");
    expect(client.cancelLocalBackupPackageGeneration).toHaveBeenCalledWith("package-session-1", { accessToken: "token" });
    expect(client.discardLocalBackupPackageSession).toHaveBeenCalledWith("package-session-1", { accessToken: "token" });
  });

  it("sanitizes unsafe server filename fallback without paths or provider internals", () => {
    expect(
      createLocalBackupPackageFilename({
        safeFilename: "../storage/object-key/signed-url.json",
        contentType: "application/vnd.settleora.local-backup+json"
      })
    ).toBe("settleora-local-backup-data-only.json");
  });

  it("uses browser object URLs only for an allowed package download and revokes them", async () => {
    const createObjectURL = vi.fn(() => "blob:settleora-local-backup");
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL
    });

    try {
      const state = {
        status: "ready_to_download" as const,
        message: "Ready.",
        session: createLocalBackupSession(),
        artifactStatus: createLocalBackupArtifactStatus()
      };
      const result = await downloadLocalBackupPackage({
        accessToken: "token",
        state,
        client: createLocalBackupPackageClient()
      });

      expect(result.status).toBe("downloaded");
      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:settleora-local-backup");
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

describe("local backup restore preview runtime", () => {
  it("auth-gates before reading the selected package file or calling preview APIs", async () => {
    const client = createLocalBackupRestorePreviewClient();
    const selectedFile = createRestorePreviewFile("sensitive package content");

    const result = await createLocalBackupRestorePreviewRuntime({
      accessToken: " ",
      selectedFile,
      client
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "auth_required",
        selectedFileName: "settleora-local-backup-data-only.json",
        selectedFileSize: "sensitive package content".length
      })
    );
    expect(selectedFile.text).not.toHaveBeenCalled();
    expect(client.createLocalBackupRestorePreview).not.toHaveBeenCalled();
  });

  it("reports missing generated methods without fallback preview data", async () => {
    const selectedFile = createRestorePreviewFile("{\"packageFormatName\":\"settleora.local-backup.data-only\"}");

    const result = await createLocalBackupRestorePreviewRuntime({
      accessToken: "token",
      selectedFile,
      client: {}
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "unavailable",
        message: "Restore preview is not available in this web client build."
      })
    );
    expect(selectedFile.text).not.toHaveBeenCalled();
    expect(result.preview).toBeUndefined();
  });

  it("blocks missing and empty file content before API calls", async () => {
    const client = createLocalBackupRestorePreviewClient();
    const missing = await createLocalBackupRestorePreviewRuntime({
      accessToken: "token",
      selectedFile: null,
      client
    });
    const emptyBySize = await createLocalBackupRestorePreviewRuntime({
      accessToken: "token",
      selectedFile: createRestorePreviewFile("", { size: 0 }),
      client
    });
    const whitespace = createRestorePreviewFile("   ");
    const emptyByContent = await createLocalBackupRestorePreviewRuntime({
      accessToken: "token",
      selectedFile: whitespace,
      client
    });

    expect(missing.status).toBe("unavailable");
    expect(emptyBySize.status).toBe("unavailable");
    expect(emptyByContent.status).toBe("unavailable");
    expect(whitespace.text).toHaveBeenCalledOnce();
    expect(client.createLocalBackupRestorePreview).not.toHaveBeenCalled();
  });

  it("creates a restore preview with generated request shape and maps safe metadata", async () => {
    const packageContent = "{\"packageFormatName\":\"settleora.local-backup.data-only\",\"secret\":\"not echoed\"}";
    const selectedFile = createRestorePreviewFile(packageContent);
    const preview = createRestorePreviewResponse({
      recordSummaries: [
        {
          category: "personal_bill_safe_summary",
          totalCount: 3,
          activeCount: 2,
          archivedCount: 1,
          itemCount: 8,
          participantCount: 4,
          payerCount: 2,
          adjustmentCount: 1
        }
      ],
      warnings: ["restore_confirmation_separate_gate", "browser_local_persistence_unsupported"],
      blockedReasons: ["receipt_and_supporting_files"]
    });
    const client = createLocalBackupRestorePreviewClient({ preview });

    const result = await createLocalBackupRestorePreviewRuntime({
      accessToken: " token ",
      selectedFile,
      packageSha256: "  abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd  ",
      client
    });

    expect(result.status).toBe("ready");
    expect(result.preview).toEqual(preview);
    expect(client.createLocalBackupRestorePreview).toHaveBeenCalledWith(
      {
        packageContent,
        packageSha256: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"
      },
      { accessToken: "token" }
    );
    expect(JSON.stringify(result)).toContain("personal_bill_safe_summary");
    expect(JSON.stringify(result)).not.toContain("not echoed");
  });

  it("refreshes and discards only an existing restore preview ID", async () => {
    const preview = createRestorePreviewResponse();
    const discardedPreview = createRestorePreviewResponse({
      status: "discarded",
      stableCode: "restore_preview_discarded",
      safeMessage: "Preview discarded.",
      discardedAtUtc: "2026-06-30T07:20:00.000Z"
    });
    const client = createLocalBackupRestorePreviewClient({ preview, discardedPreview });

    const missingRefresh = await refreshLocalBackupRestorePreviewRuntime({
      accessToken: "token",
      client,
      state: { status: "idle", message: "No preview." }
    });
    const refreshed = await refreshLocalBackupRestorePreviewRuntime({
      accessToken: "token",
      client,
      state: { status: "ready", message: "Ready.", preview }
    });
    const discarded = await discardLocalBackupRestorePreviewRuntime({
      accessToken: "token",
      client,
      state: { status: "ready", message: "Ready.", preview }
    });

    expect(missingRefresh.status).toBe("unavailable");
    expect(refreshed.status).toBe("ready");
    expect(discarded.status).toBe("discarded");
    expect(client.getLocalBackupRestorePreview).toHaveBeenCalledWith(preview.restorePreviewId, { accessToken: "token" });
    expect(client.discardLocalBackupRestorePreview).toHaveBeenCalledWith(preview.restorePreviewId, { accessToken: "token" });
    expect(client.createLocalBackupRestorePreview).not.toHaveBeenCalled();
  });

  it("maps expired, discarded, blocked, and unavailable preview responses fail-closed", () => {
    expect(
      mapLocalBackupRestorePreviewResponse(
        createRestorePreviewResponse({ expiresAtUtc: "2026-06-30T00:00:00.000Z" }),
        new Date("2026-06-30T00:00:01.000Z")
      ).status
    ).toBe("expired");

    expect(
      mapLocalBackupRestorePreviewResponse(
        createRestorePreviewResponse({ status: "discarded", stableCode: "restore_preview_discarded" })
      ).status
    ).toBe("discarded");

    expect(
      mapLocalBackupRestorePreviewResponse(
        createRestorePreviewResponse({
          stableCode: "unsupported_package_version",
          safeMessage: "Package version is unsupported."
        })
      )
    ).toEqual(expect.objectContaining({ status: "blocked", message: "Package version is unsupported." }));

    expect(
      mapLocalBackupRestorePreviewResponse(
        createRestorePreviewResponse({
          stableCode: "temporarily_unavailable",
          safeMessage: "Preview temporarily unavailable."
        })
      ).status
    ).toBe("unavailable");
  });

  it("maps errors without echoing package content", async () => {
    const packageContent = "{\"private\":\"package content must stay hidden\"}";
    const selectedFile = createRestorePreviewFile(packageContent);
    const result = await createLocalBackupRestorePreviewRuntime({
      accessToken: "token",
      selectedFile,
      client: createThrowingRestorePreviewClient(new SettleoraApiError(400, packageContent, {}))
    });

    expect(result.status).toBe("blocked");
    expect(JSON.stringify(result)).not.toContain("package content must stay hidden");
  });

  it("does not call restore confirmation, import, sync, or package generation mutations", async () => {
    const forbidden = {
      confirmLocalBackupRestorePreview: vi.fn(),
      importPersonalBillsCsv: vi.fn(),
      importGroupBillsCsv: vi.fn(),
      submitSyncOperation: vi.fn(),
      createLocalBackupPackageSession: vi.fn(),
      prepareLocalBackupPackageSession: vi.fn(),
      createLocalBackupPackageDownloadAction: vi.fn()
    };
    const client = { ...createLocalBackupRestorePreviewClient(), ...forbidden };

    await createLocalBackupRestorePreviewRuntime({
      accessToken: "token",
      selectedFile: createRestorePreviewFile("{}"),
      client
    });

    for (const method of Object.values(forbidden)) {
      expect(method).not.toHaveBeenCalled();
    }
  });
});

describe("CSV import preflight runtime", () => {
  it("auth-gates before CSV text is submitted to generated preflight methods", async () => {
    const client = createImportPreflightClient();

    const result = await preflightBillCsvImport({
      accessToken: " ",
      scope: "personal",
      csvText: "clientBillKey\nrow-1\n",
      client
    });

    expect(result).toEqual({
      status: "auth_required",
      message: "Sign in is required before Settleora can read or review a CSV import."
    });
    expect(client.preflightPersonalBillsCsvImport).not.toHaveBeenCalled();
    expect(client.preflightGroupBillsCsvImport).not.toHaveBeenCalled();
    expect(client.listGroups).not.toHaveBeenCalled();
  });

  it("submits personal CSV text only to the non-mutating personal preflight method", async () => {
    const client = createImportPreflightClient();
    const csvText = "clientBillKey,billDate,currency,itemName,itemAmount\npersonal-1,2026-05-17,USD,Lunch,10.00\n";

    const result = await preflightBillCsvImport({
      accessToken: "token",
      scope: "personal",
      csvText,
      client
    });

    expect(result.status).toBe("ready");
    expect(result.response?.scope).toBe("personal");
    expect(client.preflightPersonalBillsCsvImport).toHaveBeenCalledWith(csvText, { accessToken: "token" });
    expect(client.listGroups).not.toHaveBeenCalled();
    expect(client.preflightGroupBillsCsvImport).not.toHaveBeenCalled();
  });

  it("returns needs-correction review state with row-level safe metadata", async () => {
    const response = createImportPreflightResponse({
      available: false,
      statusCode: "needs_correction",
      safeMessage: "Correct rejected rows before import can continue.",
      rejectedRowCount: 1,
      rejectedFields: ["currency"],
      reviewItems: [
        {
          rowNumber: 2,
          state: "rejected",
          severity: "error",
          codes: ["currency_invalid"],
          safeMessage: "Currency is not supported.",
          normalizedCandidate: null,
          fields: ["currency"]
        }
      ]
    });
    const client = createImportPreflightClient({ response });

    const result = await preflightBillCsvImport({
      accessToken: "token",
      scope: "personal",
      csvText: "bad csv",
      client
    });

    expect(result.status).toBe("needs_correction");
    expect(result.response?.rejectedFields).toEqual(["currency"]);
    expect(result.response?.reviewItems[0]).toEqual(expect.objectContaining({
      state: "rejected",
      safeMessage: "Currency is not supported."
    }));
  });

  it("loads groups and fails closed before group preflight when selected group is not server-returned", async () => {
    const client = createImportPreflightClient({
      groups: [createGroup({ id: "group-2" })]
    });

    const result = await preflightBillCsvImport({
      accessToken: "token",
      scope: "group",
      groupId: "group-1",
      csvText: "clientBillKey\nrow-1\n",
      client
    });

    expect(result).toEqual({
      status: "unavailable",
      message: "The selected group is no longer available. Refresh groups and select again."
    });
    expect(client.listGroups).toHaveBeenCalledWith({ accessToken: "token" });
    expect(client.preflightGroupBillsCsvImport).not.toHaveBeenCalled();
  });

  it("uses only a latest server-returned group id for group CSV preflight", async () => {
    const response = createImportPreflightResponse({ scope: "group", groupId: "group-1" });
    const client = createImportPreflightClient({ response });
    const csvText = "clientBillKey,billDate,currency,itemName,itemAmount\ngroup-1,2026-05-17,USD,Dinner,12.00\n";

    const result = await preflightBillCsvImport({
      accessToken: "token",
      scope: "group",
      groupId: "group-1",
      csvText,
      client
    });

    expect(result.status).toBe("ready");
    expect(
      vi.mocked(client.listGroups).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(client.preflightGroupBillsCsvImport).mock.invocationCallOrder[0]);
    expect(client.preflightGroupBillsCsvImport).toHaveBeenCalledWith("group-1", csvText, { accessToken: "token" });
  });

  it("blocks mismatched returned preflight scope metadata", () => {
    expect(
      evaluateBillImportPreflightScope(
        createImportPreflightResponse({ scope: "group", groupId: "group-1" }),
        "personal",
        null
      )
    ).toEqual({
      allowed: false,
      message: "Settleora returned import review metadata for a different scope."
    });

    expect(
      evaluateBillImportPreflightScope(
        createImportPreflightResponse({ scope: "group", groupId: "group-2" }),
        "group",
        "group-1"
      )
    ).toEqual({
      allowed: false,
      message: "Settleora returned import review metadata for a different group. Select the group again."
    });
  });

  it("does not call direct import or sync methods during preflight runtime", async () => {
    const forbidden = {
      importPersonalBillsCsv: vi.fn(),
      importGroupBillsCsv: vi.fn(),
      listSyncChanges: vi.fn(),
      submitSyncOperation: vi.fn(),
      getSyncOperation: vi.fn()
    };
    const client = { ...createImportPreflightClient(), ...forbidden };

    await preflightBillCsvImport({
      accessToken: "token",
      scope: "personal",
      csvText: "clientBillKey\nrow-1\n",
      client
    });

    for (const method of Object.values(forbidden)) {
      expect(method).not.toHaveBeenCalled();
    }
  });

  it("maps denied, expired, missing method, and empty CSV states without fallback import", async () => {
    const denied = await preflightBillCsvImport({
      accessToken: "token",
      scope: "personal",
      csvText: "clientBillKey\nrow-1\n",
      client: createThrowingImportPreflightClient(new SettleoraApiError(403, "Forbidden", {}))
    });
    const expired = await preflightBillCsvImport({
      accessToken: "token",
      scope: "personal",
      csvText: "clientBillKey\nrow-1\n",
      client: createThrowingImportPreflightClient(new SettleoraApiError(401, "Unauthorized", {}))
    });
    const missing = await preflightBillCsvImport({
      accessToken: "token",
      scope: "personal",
      csvText: "clientBillKey\nrow-1\n",
      client: {}
    });
    const empty = await preflightBillCsvImport({
      accessToken: "token",
      scope: "personal",
      csvText: " ",
      client: createImportPreflightClient()
    });

    expect(denied.status).toBe("unavailable");
    expect(expired.status).toBe("session_expired");
    expect(missing).toEqual({
      status: "unavailable",
      message: "Personal CSV import review is not available in this web client build."
    });
    expect(empty).toEqual({
      status: "unavailable",
      message: "Choose a non-empty CSV file before requesting import review."
    });
  });
});

describe("CSV import session runtime", () => {
  it("auth-gates before session create, confirm, or discard calls", async () => {
    const client = createImportSessionClient();

    const created = await createBillCsvImportSession({
      accessToken: " ",
      scope: "personal",
      csvText: "clientBillKey\nrow-1\n",
      client
    });
    const confirmed = await confirmBillCsvImportSessionRuntime({
      accessToken: null,
      session: createImportSessionResponse(),
      client
    });
    const discarded = await discardBillCsvImportSessionRuntime({
      accessToken: "",
      session: createImportSessionResponse(),
      client
    });

    expect(created.status).toBe("auth_required");
    expect(confirmed.status).toBe("auth_required");
    expect(discarded.status).toBe("auth_required");
    expect(client.createPersonalBillCsvImportSession).not.toHaveBeenCalled();
    expect(client.createGroupBillCsvImportSession).not.toHaveBeenCalled();
    expect(client.confirmBillCsvImportSession).not.toHaveBeenCalled();
    expect(client.discardBillCsvImportSession).not.toHaveBeenCalled();
  });

  it("creates a personal import session and never calls direct import methods", async () => {
    const forbidden = {
      importPersonalBillsCsv: vi.fn(),
      importGroupBillsCsv: vi.fn()
    };
    const client = { ...createImportSessionClient(), ...forbidden };
    const csvText = "clientBillKey,billDate,currency,itemName,itemAmount\npersonal-1,2026-05-17,USD,Lunch,10.00\n";

    const result = await createBillCsvImportSession({
      accessToken: "token",
      scope: "personal",
      csvText,
      client
    });

    expect(result.status).toBe("ready");
    expect(result.session?.status).toBe("ready_for_confirmation");
    expect(client.createPersonalBillCsvImportSession).toHaveBeenCalledWith(csvText, { accessToken: "token" });
    expect(client.createGroupBillCsvImportSession).not.toHaveBeenCalled();
    expect(forbidden.importPersonalBillsCsv).not.toHaveBeenCalled();
    expect(forbidden.importGroupBillsCsv).not.toHaveBeenCalled();
  });

  it("group import session creation reloads groups and uses only server-returned selected group ids", async () => {
    const session = createImportSessionResponse({ scope: "group", groupId: "group-1" });
    const client = createImportSessionClient({ session });
    const csvText = "clientBillKey,billDate,currency,itemName,itemAmount\ngroup-1,2026-05-17,USD,Dinner,12.00\n";

    const result = await createBillCsvImportSession({
      accessToken: "token",
      scope: "group",
      groupId: "group-1",
      csvText,
      client
    });

    expect(result.status).toBe("ready");
    expect(
      vi.mocked(client.listGroups).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(client.createGroupBillCsvImportSession).mock.invocationCallOrder[0]);
    expect(client.createGroupBillCsvImportSession).toHaveBeenCalledWith("group-1", csvText, { accessToken: "token" });
  });

  it("stale or missing group selection fails closed and makes no group session call", async () => {
    const client = createImportSessionClient({ groups: [createGroup({ id: "group-2" })] });

    const result = await createBillCsvImportSession({
      accessToken: "token",
      scope: "group",
      groupId: "group-1",
      csvText: "clientBillKey\nrow-1\n",
      client
    });

    expect(result).toEqual({
      status: "unavailable",
      message: "The selected group is no longer available. Refresh groups and select again."
    });
    expect(client.listGroups).toHaveBeenCalledWith({ accessToken: "token" });
    expect(client.createGroupBillCsvImportSession).not.toHaveBeenCalled();
  });

  it("maps session response data for review, audit, confirmation, and normalized candidates", async () => {
    const session = createImportSessionResponse({
      expiresAtUtc: "2026-06-29T13:00:00.000Z",
      review: createImportPreflightResponse({
        reviewItems: [
          {
            rowNumber: 2,
            state: "defaulted",
            severity: "warning",
            codes: ["split_defaulted", "row_warning"],
            safeMessage: "Split method defaulted.",
            normalizedCandidate: {
              billDate: "2026-05-17",
              currency: "USD",
              itemAmount: "10.00",
              splitMethod: "exact_amount",
              splitBasisValue: "10.00"
            },
            fields: ["billDate", "currency", "itemAmount", "splitMethod"]
          }
        ],
        auditPreview: {
          action: "bill.csv_import_preflight",
          scope: "personal",
          safeMessage: "Final audit is written only when confirmation imports bills."
        },
        confirmation: {
          reviewLabel: "Review import",
          confirmLabel: "Import reviewed bills",
          safeMessage: "Confirm only after reviewing defaults."
        }
      }),
      confirmation: {
        confirmLabel: "Import reviewed bills",
        discardLabel: "Discard import session",
        confirmable: true,
        safeMessage: "One accepted row is ready for confirmation."
      }
    });
    const client = createImportSessionClient({ session });

    const result = await createBillCsvImportSession({
      accessToken: "token",
      scope: "personal",
      csvText: "csv text that must not be rendered by helpers",
      client
    });

    expect(result.status).toBe("ready");
    expect(result.session).toEqual(
      expect.objectContaining({
        status: "ready_for_confirmation",
        expiresAtUtc: "2026-06-29T13:00:00.000Z",
        rowCount: 1,
        acceptedRowCount: 1,
        duplicateCandidateRowCount: 0
      })
    );
    expect(result.session?.review.reviewItems[0]).toEqual(
      expect.objectContaining({
        state: "defaulted",
        codes: ["split_defaulted", "row_warning"],
        normalizedCandidate: expect.objectContaining({
          billDate: "2026-05-17",
          currency: "USD",
          itemAmount: "10.00",
          splitMethod: "exact_amount"
        })
      })
    );
    expect(JSON.stringify(result)).toContain("Final audit is written only when confirmation imports bills.");
    expect(JSON.stringify(result)).toContain("Import reviewed bills");
    expect(JSON.stringify(result)).not.toContain("csv text that must not be rendered by helpers");
  });

  it("confirmation calls the generated request shape and does not call direct import methods", async () => {
    const forbidden = {
      importPersonalBillsCsv: vi.fn(),
      importGroupBillsCsv: vi.fn()
    };
    const session = createImportSessionResponse();
    const client = { ...createImportSessionClient({ session }), ...forbidden };

    const result = await confirmBillCsvImportSessionRuntime({
      accessToken: "token",
      session,
      client
    });

    expect(result.status).toBe("confirmed");
    expect(client.confirmBillCsvImportSession).toHaveBeenCalledWith(
      session.importSessionId,
      createImportConfirmRequestFromSession(session),
      { accessToken: "token" }
    );
    expect(forbidden.importPersonalBillsCsv).not.toHaveBeenCalled();
    expect(forbidden.importGroupBillsCsv).not.toHaveBeenCalled();
  });

  it("discard calls the generated discard method and updates state from returned session", async () => {
    const discardedSession = createImportSessionResponse({
      status: "discarded",
      confirmation: {
        confirmLabel: "Import reviewed bills",
        discardLabel: "Discard import session",
        confirmable: false,
        safeMessage: "The session was discarded."
      }
    });
    const client = createImportSessionClient({ discardedSession });
    const session = createImportSessionResponse();

    const result = await discardBillCsvImportSessionRuntime({
      accessToken: "token",
      session,
      client
    });

    expect(result.status).toBe("discarded");
    expect(result.session?.status).toBe("discarded");
    expect(client.discardBillCsvImportSession).toHaveBeenCalledWith(session.importSessionId, { accessToken: "token" });
  });

  it("expired, denied, not-found, conflict, and validation states fail closed", async () => {
    expect(
      evaluateBillImportSessionConfirmable(
        createImportSessionResponse({ expiresAtUtc: "2026-06-29T00:00:00.000Z" }),
        new Date("2026-06-29T00:00:01.000Z")
      )
    ).toEqual({
      allowed: false,
      status: "session_expired",
      message: "This import session expired. Create a new import session before importing bills."
    });

    const denied = await createBillCsvImportSession({
      accessToken: "token",
      scope: "personal",
      csvText: "clientBillKey\nrow-1\n",
      client: createThrowingImportSessionClient(new SettleoraApiError(403, "Forbidden", {}))
    });
    const notFound = await confirmBillCsvImportSessionRuntime({
      accessToken: "token",
      session: createImportSessionResponse(),
      client: createThrowingImportSessionClient(new SettleoraApiError(404, "Not Found", {}))
    });
    const conflict = await confirmBillCsvImportSessionRuntime({
      accessToken: "token",
      session: createImportSessionResponse(),
      client: createThrowingImportSessionClient(new SettleoraApiError(409, "Conflict", {}))
    });
    const validation = await confirmBillCsvImportSessionRuntime({
      accessToken: "token",
      session: createImportSessionResponse(),
      client: createThrowingImportSessionClient(new SettleoraApiError(422, "Unprocessable", {}))
    });

    expect(denied.status).toBe("unavailable");
    expect(notFound.status).toBe("unavailable");
    expect(conflict.status).toBe("conflict");
    expect(validation.status).toBe("needs_correction");
  });

  it("keeps direct import unavailable when staged session methods are missing", async () => {
    const result = await createBillCsvImportSession({
      accessToken: "token",
      scope: "personal",
      csvText: "clientBillKey\nrow-1\n",
      client: { importPersonalBillsCsv: vi.fn() } as never
    });

    expect(result).toEqual({
      status: "unavailable",
      message: "Personal CSV import sessions are not available in this web client build."
    });
  });
});

function createReadiness(
  overrides: Partial<ExpenseBillExportReadinessResponse> = {}
): ExpenseBillExportReadinessResponse {
  return {
    scopeType: "personal",
    groupId: null,
    requestedFormat: "csv",
    supportedFormats: ["csv", "json"],
    available: true,
    code: "ready",
    message: "Export is ready.",
    acceptedFilters: {
      fromDate: null,
      toDate: null,
      status: null,
      reconciliationStatus: null,
      currency: null,
      merchant: null,
      search: null,
      archiveState: "all",
      limit: 100
    },
    defaultedFilters: [{ field: "archiveState", value: "all", reason: "Default export scope." }],
    rejectedFilters: [],
    rowLimit: 1000,
    estimatedRows: 2,
    sizeLimitBytes: 500000,
    estimatedSizeBytes: 2500,
    includesFileBytes: false,
    redactions: [{ category: "files", handling: "excluded", message: "File bytes are excluded." }],
    auditPreview: {
      action: "bill.export",
      scopeType: "personal",
      groupId: null,
      format: "csv",
      writesAuditOnReadiness: false,
      writesAuditOnExport: true
    },
    confirmation: {
      title: "Export personal bills",
      body: "Download a scoped copy of visible bills.",
      confirmLabel: "Download export"
    },
    expiresAtUtc: "2999-01-01T00:00:00.000Z",
    ...overrides
  };
}

function createSyncLocalStatusResponse(
  overrides: Partial<SyncLocalStatusResponse> = {}
): SyncLocalStatusResponse {
  return {
    mode: "server_mode",
    available: true,
    stableCode: "server_mode_active",
    safeMessage: "Server mode sync status is active.",
    sessionState: "authenticated",
    serverReachability: "reachable",
    generatedAtUtc: "2026-06-29T14:20:00.000Z",
    expiresAtUtc: "2999-01-01T00:00:00.000Z",
    serverMode: {
      state: "available",
      stableCode: "server_mode_active",
      safeMessage: "Server mode is active."
    },
    localModeSupport: {
      state: "unsupported",
      stableCode: "local_mode_unsupported",
      safeMessage: "Browser local mode is not supported in this web build."
    },
    backupRestoreSupport: {
      state: "unsupported",
      stableCode: "backup_restore_unsupported",
      safeMessage: "Browser backup and restore are not supported in this web build."
    },
    syncMutationSupport: {
      state: "unsupported",
      stableCode: "sync_mutation_unsupported",
      safeMessage: "Sync mutation is not available from this readout."
    },
    lastAcceptedServerVersion: 7,
    pendingOperationSummary: {
      state: "unavailable",
      count: null,
      stableCode: "sync_status_unavailable",
      safeMessage: "Pending operation count is not available."
    },
    failedOperationSummary: {
      state: "available",
      count: 0,
      stableCode: "sync_status_ready",
      safeMessage: "No failed sync operations were returned."
    },
    conflictSummary: {
      state: "available",
      count: 0,
      stableCode: "sync_status_ready",
      safeMessage: "No conflicts were returned."
    },
    unsupportedFeatures: [
      {
        feature: "browser_local_mode",
        stableCode: "local_mode_unsupported",
        safeMessage: "Browser local mode is unsupported."
      },
      {
        feature: "browser_local_persistence",
        stableCode: "local_persistence_unsupported",
        safeMessage: "Browser persistence is unsupported."
      },
      {
        feature: "local_backup_restore",
        stableCode: "backup_restore_unsupported",
        safeMessage: "Local backup and restore are unsupported."
      },
      {
        feature: "sync_mutation",
        stableCode: "sync_mutation_unsupported",
        safeMessage: "Sync mutation is unsupported."
      },
      {
        feature: "conflict_resolution",
        stableCode: "sync_conflict_present",
        safeMessage: "Conflict resolution is unsupported from this screen."
      }
    ],
    privacyBoundary: "No file bytes, storage internals, raw payloads, tokens, or hidden records are returned.",
    ...overrides
  };
}

function createLocalBackupSession(
  overrides: Partial<LocalBackupPackageSessionResponse> = {}
): LocalBackupPackageSessionResponse {
  return {
    packageSessionId: "package-session-1",
    status: "ready_to_download",
    stableCode: "package_ready_to_download",
    scope: "server_mode_copy_data_only",
    serverModePosture: "server_authoritative",
    availableForPackageGeneration: true,
    safeMessage: "Data-only package session is ready.",
    readiness: {
      canPreparePackage: true,
      canDownloadPackage: true,
      canRestorePackage: false,
      stableCode: "package_ready_to_download",
      safeMessage: "Package can be prepared and downloaded."
    },
    manifestPreview: {
      manifestAvailable: true,
      manifestStableCode: "package_ready_to_download",
      safeDescription: "Data-only manifest metadata."
    },
    confirmationCopy: "Prepare backup package",
    unsupportedFeatures: ["browser_local_persistence", "restore_preview", "restore_confirmation", "local_mode_authority"],
    privacyBoundary: "No hidden records, file bytes, storage paths, or credentials are returned.",
    dataEgressBoundary: "Downloaded files are user-controlled copies.",
    createdAtUtc: "2026-06-30T05:52:00.000Z",
    expiresAtUtc: "2999-01-01T00:00:00.000Z",
    discardedAtUtc: null,
    cancelledAtUtc: null,
    generatedAtUtc: "2026-06-30T05:52:00.000Z",
    ...overrides
  };
}

function createLocalBackupArtifactStatus(
  overrides: Partial<LocalBackupPackageArtifactStatusResponse> = {}
): LocalBackupPackageArtifactStatusResponse {
  return {
    packageSessionId: "package-session-1",
    status: "ready",
    stableCode: "package_ready_to_download",
    safeMessage: "Data-only package artifact is ready.",
    canPreparePackage: true,
    artifactAvailable: true,
    canDownloadPackage: true,
    downloadAvailable: true,
    generatedAtUtc: "2026-06-30T05:53:00.000Z",
    artifactExpiresAtUtc: "2999-01-01T00:00:00.000Z",
    safeFilename: "settleora-local-backup-data-only-20260630.json",
    contentType: "application/vnd.settleora.local-backup+json",
    contentLengthBytes: 512,
    packageSha256: "sha256-package",
    expiresAtUtc: "2999-01-01T00:00:00.000Z",
    privacyBoundary: "No file bytes, hidden records, storage paths, or credentials are exposed in metadata.",
    dataEgressBoundary: "Download creates a user-controlled copy.",
    unsupportedFeatures: ["browser_local_persistence", "restore_preview", "restore_confirmation", "local_mode_authority"],
    nextAllowedActions: ["create_download_action", "discard_package_session"],
    responseGeneratedAtUtc: "2026-06-30T05:53:00.000Z",
    ...overrides
  };
}

function createLocalBackupGenerationStatus(
  overrides: Partial<LocalBackupPackageGenerationStatusResponse> = {}
): LocalBackupPackageGenerationStatusResponse {
  return {
    ...createLocalBackupArtifactStatus(),
    ...overrides
  };
}

function createLocalBackupDownloadAction(
  overrides: Partial<LocalBackupPackageDownloadActionResponse> = {}
): LocalBackupPackageDownloadActionResponse {
  return {
    packageSessionId: "package-session-1",
    status: "download_action_ready",
    stableCode: "package_download_action_ready",
    safeMessage: "Short-lived same-API download action is ready.",
    downloadAvailable: true,
    canDownloadPackage: true,
    artifactAvailable: true,
    expiresAtUtc: "2999-01-01T00:00:00.000Z",
    downloadActionId: "download-action-1",
    downloadActionExpiresAtUtc: "2999-01-01T00:00:00.000Z",
    contentPath: "/api/v1/local-backup/package-sessions/package-session-1/download-actions/download-action-1/content",
    safeFilename: "settleora-local-backup-data-only-20260630.json",
    contentType: "application/vnd.settleora.local-backup+json",
    contentLengthBytes: 512,
    packageSha256: "sha256-package",
    privacyBoundary: "No storage internals are returned.",
    dataEgressBoundary: "Download creates a user-controlled copy.",
    unsupportedFeatures: ["browser_local_persistence", "restore_preview", "restore_confirmation", "local_mode_authority"],
    nextAllowedActions: ["discard_package_session"],
    responseGeneratedAtUtc: "2026-06-30T05:54:00.000Z",
    ...overrides
  };
}

function createLocalBackupPackageClient({
  session = createLocalBackupSession(),
  artifactStatus = createLocalBackupArtifactStatus(),
  generationStatus = createLocalBackupGenerationStatus(artifactStatus),
  downloadAction = createLocalBackupDownloadAction(),
  packageBlob = new Blob(["{}"], { type: "application/vnd.settleora.local-backup+json" })
}: {
  session?: LocalBackupPackageSessionResponse;
  artifactStatus?: LocalBackupPackageArtifactStatusResponse;
  generationStatus?: LocalBackupPackageGenerationStatusResponse;
  downloadAction?: LocalBackupPackageDownloadActionResponse;
  packageBlob?: Blob;
} = {}): Required<LocalBackupPackageRuntimeClient> {
  return {
    createLocalBackupPackageSession: vi.fn(async () => session),
    prepareLocalBackupPackageSession: vi.fn(async () => generationStatus),
    getLocalBackupPackageArtifactStatus: vi.fn(async () => artifactStatus),
    createLocalBackupPackageDownloadAction: vi.fn(async () => downloadAction),
    downloadLocalBackupPackageContent: vi.fn(async () => packageBlob),
    discardLocalBackupPackageSession: vi.fn(async () =>
      createLocalBackupSession({ status: "discarded", stableCode: "package_session_discarded" })
    ),
    cancelLocalBackupPackageGeneration: vi.fn(async () =>
      createLocalBackupGenerationStatus({
        status: "cancelled",
        stableCode: "package_generation_cancelled",
        safeMessage: "Package generation was cancelled."
      })
    )
  };
}

function createSyncLocalStatusClient({
  response = createSyncLocalStatusResponse()
}: {
  response?: SyncLocalStatusResponse;
} = {}): Required<SyncLocalStatusRuntimeClient> {
  return {
    getSyncLocalStatus: vi.fn(async () => response)
  };
}

function createThrowingSyncLocalStatusClient(error: unknown): SyncLocalStatusRuntimeClient {
  return {
    getSyncLocalStatus: vi.fn(async () => {
      throw error;
    })
  };
}

function createForbiddenSyncLocalMethods() {
  return {
    listSyncChanges: vi.fn(),
    submitSyncOperation: vi.fn(),
    getSyncOperation: vi.fn(),
    importPersonalBillsCsv: vi.fn(),
    importGroupBillsCsv: vi.fn(),
    localStorage: vi.fn(),
    sessionStorage: vi.fn(),
    indexedDB: vi.fn()
  };
}

function expectForbiddenSyncLocalMethodsNotCalled(forbidden: ReturnType<typeof createForbiddenSyncLocalMethods>) {
  for (const method of Object.values(forbidden)) {
    expect(method).not.toHaveBeenCalled();
  }
}

function createExportRuntimeClient({
  readiness = createReadiness(),
  csvBlob = new Blob(["id\n"], { type: "text/csv" }),
  jsonResponse = {
    generatedAtUtc: "2026-06-29T06:41:00.000Z",
    appliedFilters: readiness.acceptedFilters,
    rowCount: 0,
    rows: []
  }
}: {
  readiness?: ExpenseBillExportReadinessResponse;
  csvBlob?: Blob;
  jsonResponse?: Awaited<ReturnType<NonNullable<BillExportRuntimeClient["exportPersonalBillsJson"]>>>;
} = {}): Required<BillExportRuntimeClient> {
  return {
    getPersonalBillExportReadiness: vi.fn(async (_options, query) => ({
      ...readiness,
      requestedFormat: query.format ?? readiness.requestedFormat
    })),
    exportPersonalBillsCsv: vi.fn(async () => csvBlob),
    exportPersonalBillsJson: vi.fn(async () => jsonResponse),
    getGroupBillExportReadiness: vi.fn(async (_groupId, _options, query) => ({
      ...readiness,
      requestedFormat: query.format ?? readiness.requestedFormat
    })),
    exportGroupBillsCsv: vi.fn(async () => csvBlob),
    exportGroupBillsJson: vi.fn(async () => jsonResponse)
  };
}

function createThrowingGroupReadinessClient(error: unknown): BillExportRuntimeClient {
  return {
    getGroupBillExportReadiness: vi.fn(async () => {
      throw error;
    })
  };
}

function createGroup(overrides: Partial<GroupResponse> = {}): GroupResponse {
  return {
    id: "group-1",
    name: "Server group",
    currentUserRole: "member",
    currentUserStatus: "active",
    createdAtUtc: "2026-06-29T00:00:00.000Z",
    updatedAtUtc: "2026-06-29T00:00:00.000Z",
    ...overrides
  };
}

function createImportPreflightResponse(
  overrides: Partial<BillCsvImportPreflightResponse> = {}
): BillCsvImportPreflightResponse {
  return {
    scope: "personal",
    groupId: null,
    available: true,
    statusCode: "ready_for_review",
    safeMessage: "CSV import is ready for review.",
    rowCount: 1,
    acceptedRowCount: 1,
    warningRowCount: 0,
    rejectedRowCount: 0,
    acceptedFields: ["billDate", "currency", "itemAmount"],
    defaultedFields: ["splitMethod"],
    rejectedFields: [],
    reviewItems: [
      {
        rowNumber: 2,
        state: "accepted",
        severity: "info",
        codes: ["row_accepted"],
        safeMessage: "Row can be reviewed before import confirmation.",
        normalizedCandidate: {
          billDate: "2026-05-17",
          currency: "USD",
          itemAmount: "10.00",
          splitMethod: "exact_amount",
          splitBasisValue: "10.00"
        },
        fields: ["billDate", "currency", "itemAmount", "splitMethod"]
      }
    ],
    auditPreview: {
      action: "bill.csv_import_preflight",
      scope: "personal",
      safeMessage: "Preflight review does not write import audit records."
    },
    confirmation: {
      reviewLabel: "Review import",
      confirmLabel: "Import bills",
      safeMessage: "Import confirmation is unavailable in this web slice."
    },
    readiness: "Review is temporary and must be repeated before future confirmation.",
    ...overrides
  };
}

function createImportPreflightClient({
  response = createImportPreflightResponse(),
  groups = [createGroup()]
}: {
  response?: BillCsvImportPreflightResponse;
  groups?: GroupResponse[];
} = {}): Required<BillImportPreflightRuntimeClient> {
  return {
    preflightPersonalBillsCsvImport: vi.fn(async () => response),
    preflightGroupBillsCsvImport: vi.fn(async () => response),
    listGroups: vi.fn(async () => ({ groups }))
  };
}

function createThrowingImportPreflightClient(error: unknown): BillImportPreflightRuntimeClient {
  return {
    preflightPersonalBillsCsvImport: vi.fn(async () => {
      throw error;
    })
  };
}

function createImportSessionResponse(
  overrides: Partial<BillCsvImportSessionResponse> = {}
): BillCsvImportSessionResponse {
  return {
    importSessionId: "00000000-0000-4000-8000-000000000461",
    scope: "personal",
    groupId: null,
    status: "ready_for_confirmation",
    expiresAtUtc: "2999-01-01T00:00:00.000Z",
    payloadDigest: "sha256:session-digest",
    preflightResultVersion: "preflight-v1",
    confirmationChallengeId: "challenge-v1",
    rowCount: 1,
    acceptedRowCount: 1,
    warningRowCount: 0,
    rejectedRowCount: 0,
    duplicateCandidateRowCount: 0,
    confirmation: {
      confirmLabel: "Import reviewed bills",
      discardLabel: "Discard import session",
      confirmable: true,
      safeMessage: "One row is ready for confirmation."
    },
    review: createImportPreflightResponse(),
    ...overrides
  };
}

function createImportConfirmationResponse(
  overrides: Partial<BillCsvImportConfirmationResponse> = {}
): BillCsvImportConfirmationResponse {
  return {
    importSessionId: "00000000-0000-4000-8000-000000000461",
    scope: "personal",
    groupId: null,
    status: "confirmed",
    importedBillCount: 1,
    bills: [
      {
        billId: "00000000-0000-4000-8000-000000000777",
        groupId: null,
        billDate: "2026-05-17",
        status: "draft",
        totalAmount: "10.00",
        totalCurrency: "USD",
        itemCount: 1,
        participantCount: 1,
        payerCount: 1
      }
    ],
    ...overrides
  };
}

function createImportSessionClient({
  session = createImportSessionResponse(),
  confirmation = createImportConfirmationResponse(),
  discardedSession = createImportSessionResponse({ status: "discarded" }),
  groups = [createGroup()]
}: {
  session?: BillCsvImportSessionResponse;
  confirmation?: BillCsvImportConfirmationResponse;
  discardedSession?: BillCsvImportSessionResponse;
  groups?: GroupResponse[];
} = {}): Required<BillImportSessionRuntimeClient> {
  return {
    createPersonalBillCsvImportSession: vi.fn(async () => session),
    createGroupBillCsvImportSession: vi.fn(async () => session),
    getBillCsvImportSession: vi.fn(async () => session),
    confirmBillCsvImportSession: vi.fn(async () => confirmation),
    discardBillCsvImportSession: vi.fn(async () => discardedSession),
    listGroups: vi.fn(async () => ({ groups }))
  };
}

function createThrowingImportSessionClient(error: unknown): BillImportSessionRuntimeClient {
  return {
    createPersonalBillCsvImportSession: vi.fn(async () => {
      throw error;
    }),
    confirmBillCsvImportSession: vi.fn(async () => {
      throw error;
    }),
    discardBillCsvImportSession: vi.fn(async () => {
      throw error;
    }),
    listGroups: vi.fn(async () => ({ groups: [createGroup()] }))
  };
}

function createRestorePreviewResponse(
  overrides: Partial<LocalBackupRestorePreviewResponse> = {}
): LocalBackupRestorePreviewResponse {
  return {
    restorePreviewId: "00000000-0000-4000-8000-000000000619",
    status: "ready",
    stableCode: "restore_preview_ready",
    safeMessage: "Restore preview is ready. No records were restored.",
    createdAtUtc: "2026-06-30T07:15:00.000Z",
    expiresAtUtc: "2999-01-01T00:00:00.000Z",
    discardedAtUtc: null,
    sourceAuthorityBoundary: "server_authoritative_copy",
    packageFormatName: "settleora.local-backup.data-only",
    packageVersion: "2026-06-30.data-only.v1",
    manifestVersion: "2026-06-30.manifest.v1",
    packageId: "00000000-0000-4000-8000-000000000111",
    manifestId: "00000000-0000-4000-8000-000000000112",
    packageSessionId: "00000000-0000-4000-8000-000000000113",
    packageGeneratedAtUtc: "2026-06-30T07:10:00.000Z",
    packageExpiresAtUtc: "2999-01-01T00:00:00.000Z",
    packageSha256: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    totalSectionCount: 2,
    includedSectionCategories: ["current_actor_profile_summary", "personal_bill_safe_summary"],
    omittedSectionCategories: ["receipt_and_supporting_files"],
    unsupportedSectionCategories: ["raw_ocr_text", "private_notes_and_payment_details"],
    blockedSectionCategories: ["restore_preview_and_confirmation"],
    recordSummaries: [],
    warnings: ["restore_confirmation_separate_gate", "browser_local_persistence_unsupported"],
    blockedReasons: ["restore_preview_and_confirmation"],
    restoreConfirmationAvailable: false,
    restoreConfirmationState: "unsupported",
    restoreConfirmationCopy: "Restore confirmation is unavailable and requires a separate future gate.",
    nextAllowedActions: ["get_restore_preview", "discard_restore_preview"],
    privacyBoundary: "No raw package content, file bytes, storage internals, tokens, or hidden records are returned.",
    responseGeneratedAtUtc: "2026-06-30T07:15:01.000Z",
    ...overrides
  };
}

function createRestorePreviewFile(content: string, overrides: Partial<{ name: string; size: number }> = {}) {
  return {
    name: overrides.name ?? "settleora-local-backup-data-only.json",
    size: overrides.size ?? content.length,
    text: vi.fn(async () => content)
  };
}

function createLocalBackupRestorePreviewClient({
  preview = createRestorePreviewResponse(),
  discardedPreview = createRestorePreviewResponse({
    status: "discarded",
    stableCode: "restore_preview_discarded",
    safeMessage: "Preview discarded.",
    discardedAtUtc: "2026-06-30T07:20:00.000Z"
  })
}: {
  preview?: LocalBackupRestorePreviewResponse;
  discardedPreview?: LocalBackupRestorePreviewResponse;
} = {}): Required<LocalBackupRestorePreviewRuntimeClient> {
  return {
    createLocalBackupRestorePreview: vi.fn(async () => preview),
    getLocalBackupRestorePreview: vi.fn(async () => preview),
    discardLocalBackupRestorePreview: vi.fn(async () => discardedPreview)
  };
}

function createThrowingRestorePreviewClient(error: unknown): LocalBackupRestorePreviewRuntimeClient {
  return {
    createLocalBackupRestorePreview: vi.fn(async () => {
      throw error;
    })
  };
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(blob);
  });
}
