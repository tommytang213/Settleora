#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function removeExactlyOnce(value, pattern, name) {
  const matches = value.match(new RegExp(pattern.source, `${pattern.flags}g`));
  if (matches?.length !== 1) throw new Error(`expected one ${name}`);
  return value.replace(pattern, "");
}

export function verifyIosTestPodfileLock(productionLock, testLock) {
  let projected = testLock;
  projected = removeExactlyOnce(
    projected,
    /^  - integration_test \(0\.0\.1\):\n    - Flutter\n/m,
    "integration_test pod",
  );
  projected = removeExactlyOnce(
    projected,
    /^  - integration_test \(from `\.symlinks\/plugins\/integration_test\/ios`\)\n/m,
    "integration_test dependency",
  );
  projected = removeExactlyOnce(
    projected,
    /^  integration_test:\n    :path: "\.symlinks\/plugins\/integration_test\/ios"\n/m,
    "integration_test external source",
  );
  projected = removeExactlyOnce(
    projected,
    /^  integration_test: [0-9a-f]{40}\n/m,
    "integration_test checksum",
  );
  if (projected !== productionLock) {
    throw new Error("test CocoaPods graph differs beyond the reviewed integration_test projection");
  }
}

function main(args) {
  if (args.length !== 2 || args.some((value) => !path.isAbsolute(value))) {
    throw new Error("Usage: verify-ios-test-podfile-lock.mjs <production-lock> <test-lock>");
  }
  verifyIosTestPodfileLock(readFileSync(args[0], "utf8"), readFileSync(args[1], "utf8"));
  process.stdout.write("Verified test-only iOS CocoaPods projection\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main(process.argv.slice(2));
  } catch {
    process.stderr.write("iOS test CocoaPods projection verification failed\n");
    process.exitCode = 1;
  }
}
