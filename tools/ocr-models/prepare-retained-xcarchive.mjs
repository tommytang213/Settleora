import { cpSync, lstatSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashDirectory } from "./hash-directory.mjs";
import { inspectXcarchive, inspectXcarchiveStructure } from "./verify-ios-xcarchive.mjs";

function fail() { throw new Error("Retained xcarchive preparation failed"); }
function directory(location) {
  const stat = lstatSync(location);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail();
}

// The raw Xcode archive remains untouched for local diagnostics. The upload
// location receives only the signed app and constrained Info.plist, and only
// after the complete copy passes the retention verifier. No dSYM bytes are
// rewritten, newly trusted, or authenticated by a freshly observed hash.
export function prepareRetainedXcarchive(source, ipaApp, outputRoot, inspectPlist, options) {
  directory(source);
  directory(ipaApp);
  directory(path.dirname(outputRoot));
  const sourceHash = hashDirectory(source);
  inspectXcarchiveStructure(source, ipaApp, inspectPlist, options);
  mkdirSync(outputRoot); // Never reuse or overwrite an earlier artifact.
  const staging = path.join(outputRoot, "Runner.pending");
  const destination = path.join(outputRoot, "Runner.xcarchive");
  mkdirSync(staging);
  for (const name of ["Info.plist", "Products"]) {
    cpSync(path.join(source, name), path.join(staging, name), {
      recursive: true, errorOnExist: true, force: false, preserveTimestamps: true,
    });
  }
  const inventory = inspectXcarchive(staging, ipaApp, inspectPlist, options);
  if (hashDirectory(source) !== sourceHash) fail();
  // A failed inspection leaves only a .pending directory outside the upload
  // glob. The successful atomic rename is the sole entry into retention.
  renameSync(staging, destination);
  try {
    if (hashDirectory(destination) !== inventory.archiveSha256) fail();
  } catch (error) {
    renameSync(destination, staging);
    throw error;
  }
  return inventory;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    if (process.argv.length !== 2) fail();
    const build = path.resolve("build"), ios = path.join(build, "ios");
    const rawRoot = path.join(ios, "archive");
    const inspection = path.join(ios, ".settleora-ipa-inspection");
    const payload = path.join(inspection, "Payload"), app = path.join(payload, "Runner.app");
    for (const p of [build, ios, rawRoot, inspection, payload, app]) directory(p);
    const archives = readdirSync(rawRoot).filter(name => /^[A-Za-z0-9._ -]+\.xcarchive$/.test(name));
    if (archives.length !== 1) fail();
    prepareRetainedXcarchive(path.join(rawRoot, archives[0]), app, path.join(ios, "retained-archive"));
  } catch {
    process.stderr.write("xcarchive_retention_preparation_failed\n");
    process.exitCode = 1;
  }
}
