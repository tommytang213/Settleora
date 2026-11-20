import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashDirectory } from "./hash-directory.mjs";

const forbiddenPath = /(^|\/)(?:test|tests|fixtures?|logs?|evidence)(?:\/|[._-]|$)|integration[_-]?test|receipt[_-]?ocr[_-]?(?:acceptance|real_provider)/i;
const forbiddenContent = /IntegrationTestPlugin|dev\.flutter\.plugins\.integration_test|com\.settleora\.mobile\/receipt_ocr_acceptance|loadFixture|receipt_ocr_real_provider_test|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|BEGIN CERTIFICATE|api[_-]?token\s*[:=]/i;
const receiptText = /(?:^|[\r\n])\s*(?:TOTAL|SUBTOTAL|TAX|MERCHANT|RECEIPT)\s*[: ]+\$?\d+(?:\.\d{2})?/i;
const machoMagic = new Set([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca]);

function fail() { throw new Error("Retained xcarchive contains unreviewed or private content"); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

export function inspectXcarchive(root, ipaAppRoot, inspectPlist = (file) => execFileSync("plutil", ["-convert", "xml1", "-o", "-", file], {
  encoding: "utf8", maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "ignore"],
})) {
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail();
  const appRoot = "Products/Applications/Runner.app";
  const ipaApp = ipaAppRoot ? path.resolve(ipaAppRoot) : null;
  const ipaPaths = new Set();
  const ipaDirectories = new Set();
  const archiveDirectories = new Set();
  const collect = (directory, prefix, output, directories) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const current = path.join(directory, entry.name);
      const currentStat = lstatSync(current);
      if (currentStat.isSymbolicLink() || (!currentStat.isDirectory() && !currentStat.isFile())) fail();
      if (currentStat.isDirectory()) {
        directories.add(relative);
        collect(current, relative, output, directories);
      } else output.add(relative);
    }
  };
  if (ipaApp) collect(ipaApp, "", ipaPaths, ipaDirectories);
  const files = new Set();
  collect(root, "", files, archiveDirectories);
  for (const directory of archiveDirectories) {
    if (forbiddenPath.test(directory) || directory.length > 512 || directory.includes("\\") ||
        ![...files].some((file) => file.startsWith(`${directory}/`))) fail();
  }
  if (!files.has("Info.plist") || !files.has(`${appRoot}/Info.plist`) || files.size > 50000) fail();
  let appFiles = 0;
  let symbolFiles = 0;
  let inspectedBytes = 0;
  const profile = createHash("sha256");
  for (const relative of [...files].sort()) {
    if (forbiddenPath.test(relative) || relative.length > 512 || relative.includes("\\")) fail();
    const isApp = relative.startsWith(`${appRoot}/`);
    const isPlist = relative === "Info.plist" || /^dSYMs\/[A-Za-z0-9_.+-]+\.dSYM\/Contents\/Info\.plist$/.test(relative);
    const isDwarf = /^dSYMs\/[A-Za-z0-9_.+-]+\.dSYM\/Contents\/Resources\/DWARF\/[A-Za-z0-9_.+-]+$/.test(relative);
    if (!isApp && !isPlist && !isDwarf) fail();
    if (isApp) {
      appFiles += 1;
      if (!ipaApp || !ipaPaths.has(relative.slice(appRoot.length + 1))) fail();
    }
    if (isDwarf) symbolFiles += 1;
    const file = path.join(root, relative);
    const fileStat = lstatSync(file);
    if (!fileStat.isFile() || fileStat.size > 1024 * 1024 * 1024 ||
        inspectedBytes + fileStat.size > 2 * 1024 * 1024 * 1024) fail();
    inspectedBytes += fileStat.size;
    const bytes = readFileSync(file);
    if (isApp && relative !== `${appRoot}/embedded.mobileprovision` &&
        !relative.includes("/_CodeSignature/")) {
      const counterpart = path.join(ipaApp, relative.slice(appRoot.length + 1));
      const counterpartStat = lstatSync(counterpart);
      if (!counterpartStat.isFile() || counterpartStat.isSymbolicLink() ||
          counterpartStat.size !== fileStat.size || !readFileSync(counterpart).equals(bytes)) fail();
    }
    if (isDwarf && (bytes.length < 4 || !machoMagic.has(bytes.readUInt32BE(0)))) fail();
    for (let offset = 0; offset < bytes.length; offset += 1024 * 1024) {
      const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + 1024 * 1024 + 128)).toString("latin1");
      if (forbiddenContent.test(chunk) || receiptText.test(chunk)) fail();
      if ((isPlist || isDwarf) && /\xff\xd8\xff|\x89PNG|%PDF-|PK\x03\x04/.test(chunk)) fail();
    }
    if (relative.endsWith(".plist") || relative.endsWith(".xcprivacy")) {
      let xml;
      try {
        xml = inspectPlist(file);
      } catch { fail(); }
      if (xml.includes("<data>") || forbiddenContent.test(xml)) fail();
    }
    profile.update(`${relative}\0${fileStat.size}\0${sha256(bytes)}\0`);
  }
  if (ipaApp && appFiles !== ipaPaths.size) fail();
  return {
    archiveSha256: hashDirectory(root),
    inspectedFileCount: files.size,
    applicationFileCount: appFiles,
    symbolFileCount: symbolFiles,
    inventorySha256: profile.digest("hex"),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    if (process.argv.length !== 2) fail();
    const buildRoot = path.resolve("build");
    const iosRoot = path.join(buildRoot, "ios");
    const archiveRoot = path.join(iosRoot, "archive");
    const inspectionRoot = path.join(iosRoot, ".settleora-ipa-inspection");
    const appRoot = path.join(inspectionRoot, "Payload", "Runner.app");
    for (const directory of [buildRoot, iosRoot, archiveRoot, inspectionRoot,
      path.join(inspectionRoot, "Payload"), appRoot]) {
      const stat = lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail();
    }
    const archives = readdirSync(archiveRoot)
      .filter((name) => /^[A-Za-z0-9._ -]+\.xcarchive$/.test(name))
      .filter((name) => {
        const stat = lstatSync(path.join(archiveRoot, name));
        return stat.isDirectory() && !stat.isSymbolicLink();
      });
    if (archives.length !== 1) fail();
    process.stdout.write(`${JSON.stringify(inspectXcarchive(path.join(archiveRoot, archives[0]), appRoot))}\n`);
  } catch {
    process.stderr.write("xcarchive_privacy_verification_failed\n");
    process.exitCode = 1;
  }
}
