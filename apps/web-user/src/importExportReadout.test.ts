import { describe, expect, it, vi } from "vitest";
import {
  checkBillExportReadiness,
  createBillExportFilename,
  downloadBillExport,
  evaluateBillExportReadiness,
  getMissingImportExportMethods,
  getPresentImportExportMethods,
  labelImportExportStatus,
  loadImportExportReadout,
  type BillExportRuntimeClient
} from "./importExportReadout";
import { loadGroupsReadout } from "./groupsFriendsReadout";
import { SettleoraApiError } from "../../../packages/client-web/src/generated";
import type { ExpenseBillExportReadinessResponse, GroupResponse } from "../../../packages/client-web/src/generated";

function createOperationClient() {
  return {
    getPersonalBillExportReadiness: vi.fn(),
    exportPersonalBillsCsv: vi.fn(),
    exportPersonalBillsJson: vi.fn(),
    getGroupBillExportReadiness: vi.fn(),
    exportGroupBillsCsv: vi.fn(),
    exportGroupBillsJson: vi.fn(),
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
          methodsPresent: ["importPersonalBillsCsv"]
        }),
        expect.objectContaining({
          id: "group-bill-import",
          status: "operation_method_exists",
          methodsPresent: ["importGroupBillsCsv"]
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
    expect(copy).toContain("Import preflight");
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

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(blob);
  });
}
