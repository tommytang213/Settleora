import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { prepareProductionFlutterPlugins } from "../prepare-production-flutter-plugins.mjs";

function withMetadata(metadata, callback) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "settleora-production-plugins-"));
  try {
    const file = path.join(directory, ".flutter-plugins-dependencies");
    writeFileSync(file, JSON.stringify(metadata));
    callback(file);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const metadata = () => ({
  plugins: {
    ios: [
      { name: "integration_test", dev_dependency: true, dependencies: [] },
      { name: "production_plugin", dev_dependency: false, dependencies: [] },
    ],
    android: [{ name: "integration_test", dev_dependency: true, dependencies: [] }],
  },
  dependencyGraph: [
    { name: "integration_test", dependencies: [] },
    { name: "production_plugin", dependencies: [] },
  ],
});

test("removes only the reviewed dev plugin from every production platform", () => {
  withMetadata(metadata(), (file) => {
    assert.deepEqual(
      prepareProductionFlutterPlugins(file, { requireIntegrationTest: true }),
      ["integration_test"],
    );
    const result = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(result.plugins.ios.map((plugin) => plugin.name), ["production_plugin"]);
    assert.deepEqual(result.plugins.android, []);
    assert.deepEqual(result.dependencyGraph.map((node) => node.name), ["production_plugin"]);
  });
});

test("fails closed for an unreviewed dev plugin or production dependency edge", () => {
  const unreviewed = metadata();
  unreviewed.plugins.ios.push({ name: "unknown_test_plugin", dev_dependency: true, dependencies: [] });
  withMetadata(unreviewed, (file) => {
    assert.throws(() => prepareProductionFlutterPlugins(file), /Unreviewed dev plugin/);
  });

  const dependedOn = metadata();
  dependedOn.dependencyGraph[1].dependencies.push("integration_test");
  withMetadata(dependedOn, (file) => {
    assert.throws(() => prepareProductionFlutterPlugins(file), /depends on a removed dev plugin/);
  });
});

test("requires the known test plugin when requested", () => {
  const withoutIntegrationTest = metadata();
  withoutIntegrationTest.plugins.ios = withoutIntegrationTest.plugins.ios
    .filter((plugin) => plugin.name !== "integration_test");
  withoutIntegrationTest.plugins.android = [];
  withoutIntegrationTest.dependencyGraph = withoutIntegrationTest.dependencyGraph
    .filter((node) => node.name !== "integration_test");
  withMetadata(withoutIntegrationTest, (file) => {
    assert.throws(
      () => prepareProductionFlutterPlugins(file, { requireIntegrationTest: true }),
      /was not present/,
    );
  });
});
