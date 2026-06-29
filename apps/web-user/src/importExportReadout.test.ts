import { describe, expect, it, vi } from "vitest";
import {
  getMissingImportExportMethods,
  getPresentImportExportMethods,
  labelImportExportStatus,
  loadImportExportReadout
} from "./importExportReadout";

function createOperationClient() {
  return {
    exportPersonalBillsCsv: vi.fn(),
    exportPersonalBillsJson: vi.fn(),
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
      "exportPersonalBillsCsv",
      "exportPersonalBillsJson",
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
          methodsPresent: ["exportPersonalBillsCsv", "exportPersonalBillsJson"]
        }),
        expect.objectContaining({
          id: "group-bill-export",
          status: "operation_method_exists",
          methodsPresent: ["exportGroupBillsCsv", "exportGroupBillsJson"]
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
      "exportPersonalBillsJson",
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
      "exportPersonalBillsCsv",
      "exportPersonalBillsJson",
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

    expect(copy).toContain("Export readiness metadata");
    expect(copy).toContain("Import preflight");
    expect(copy).toContain("Browser local backup");
    expect(copy).toContain("User-web local-mode persistence");
    expect(copy).toContain("Sync/local status");
    expect(copy).toContain("Report/export history");
    expect(copy).not.toMatch(/fake session|fake data|storage path|object key|file bytes|download started|upload started/i);
  });
});
