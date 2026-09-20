import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    const root = path.dirname(file);
    const androidRegistrant = path.join(
      root,
      "android/app/src/main/java/io/flutter/plugins/GeneratedPluginRegistrant.java",
    );
    const iosRegistrant = path.join(root, "ios/Runner/GeneratedPluginRegistrant.m");
    mkdirSync(path.dirname(androidRegistrant), { recursive: true });
    mkdirSync(path.dirname(iosRegistrant), { recursive: true });
    writeFileSync(
      androidRegistrant,
      "production plugin\n    try {\n      flutterEngine.getPlugins().add(new dev.flutter.plugins.integration_test.IntegrationTestPlugin());\n    } catch (Exception e) {\n      Log.e(TAG, \"Error registering plugin integration_test, dev.flutter.plugins.integration_test.IntegrationTestPlugin\", e);\n    }\nproduction plugin tail\n",
    );
    writeFileSync(
      iosRegistrant,
      "production plugin\n#if __has_include(<integration_test/IntegrationTestPlugin.h>)\n#import <integration_test/IntegrationTestPlugin.h>\n#else\n@import integration_test;\n#endif\n\n@implementation GeneratedPluginRegistrant\n  [IntegrationTestPlugin registerWithRegistrar:[registry registrarForPlugin:@\"IntegrationTestPlugin\"]];\nproduction plugin tail\n",
    );
    assert.deepEqual(
      prepareProductionFlutterPlugins(file, { requireIntegrationTest: true }),
      ["integration_test"],
    );
    const result = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(result.plugins.ios.map((plugin) => plugin.name), ["production_plugin"]);
    assert.deepEqual(result.plugins.android, []);
    assert.deepEqual(result.dependencyGraph.map((node) => node.name), ["production_plugin"]);
    assert.equal(readFileSync(androidRegistrant, "utf8"), "production plugin\nproduction plugin tail\n");
    assert.equal(
      readFileSync(iosRegistrant, "utf8"),
      "production plugin\n@implementation GeneratedPluginRegistrant\nproduction plugin tail\n",
    );
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
