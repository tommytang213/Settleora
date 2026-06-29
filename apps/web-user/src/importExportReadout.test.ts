import { describe, expect, it, vi } from "vitest";
import {
  checkBillExportReadiness,
  confirmBillCsvImportSessionRuntime,
  createBillExportFilename,
  createBillCsvImportSession,
  createImportConfirmRequestFromSession,
  discardBillCsvImportSessionRuntime,
  downloadBillExport,
  evaluateBillImportSessionConfirmable,
  evaluateBillImportPreflightScope,
  evaluateBillExportReadiness,
  getMissingImportExportMethods,
  getPresentImportExportMethods,
  labelImportExportStatus,
  loadImportExportReadout,
  preflightBillCsvImport,
  type BillImportSessionRuntimeClient,
  type BillImportPreflightRuntimeClient,
  type BillExportRuntimeClient
} from "./importExportReadout";
import { loadGroupsReadout } from "./groupsFriendsReadout";
import { SettleoraApiError } from "../../../packages/client-web/src/generated";
import type {
  BillCsvImportConfirmationResponse,
  BillCsvImportPreflightResponse,
  BillCsvImportSessionResponse,
  ExpenseBillExportReadinessResponse,
  GroupResponse
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
          id: "sync-status",
          status: "readout_only",
          methodsPresent: ["listSyncChanges", "getSyncOperation", "submitSyncOperation"]
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
    expect(copy).toContain("Browser local backup");
    expect(copy).toContain("User-web local-mode persistence");
    expect(copy).toContain("Sync/local status");
    expect(copy).toContain("Report/export history");
    expect(copy).not.toMatch(/fake session|fake data|storage path|object key|file bytes|download started|upload started/i);
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

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(blob);
  });
}
