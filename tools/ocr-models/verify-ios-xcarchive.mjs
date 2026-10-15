import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyDsymByteAccounting } from "./dsym-byte-accounting.mjs";
import { hashDirectory } from "./hash-directory.mjs";
import { signedMachOCodeMatches, verifyApplicationSignature } from "./ios-code-equivalence.mjs";

const forbiddenPath = /(^|\/)(?:test|tests|fixtures?|logs?|evidence)(?:\/|[._-]|$)|integration[_-]?test|receipt[_-]?ocr[_-]?(?:acceptance|real_provider)/i;
const forbiddenContent = /IntegrationTestPlugin|dev\.flutter\.plugins\.integration_test|com\.settleora\.mobile\/receipt_ocr_acceptance|loadFixture|receipt_ocr_real_provider_test|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|BEGIN CERTIFICATE|api[_-]?token\s*[:=]/i;
const receiptText = /(?:^|[\r\n])\s*(?:TOTAL|SUBTOTAL|TAX|MERCHANT|RECEIPT)\s*[: ]+\$?\d+(?:\.\d{2})?/i;
const machoMagic = new Set([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca]);

function fail() { throw new Error("Retained xcarchive contains unreviewed or private content"); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

// Archive and dSYM metadata are unsigned and have no exported IPA counterpart.
// Parse original XML so comments and duplicate keys cannot hide arbitrary text
// behind plutil's normalized representation. Callers constrain keys and values.
function parseUnsignedInfoPlist(bytes) {
  if (bytes.length > 64 * 1024) fail();
  let xml = bytes.toString("utf8").trim();
  if (xml.includes("\ufffd")) fail();
  xml = xml.replace(/^<\?xml version=["']1\.0["'](?: encoding=["']UTF-8["'])?\?>\s*/i, "");
  xml = xml.replace(/^<!DOCTYPE plist PUBLIC "-\/\/Apple\/\/DTD PLIST 1\.0\/\/EN" "http:\/\/www\.apple\.com\/DTDs\/PropertyList-1\.0\.dtd">\s*/, "");
  const outer = /^<plist(?: version="1\.0")?>([\s\S]*)<\/plist>$/.exec(xml);
  if (!outer) fail();
  const source = outer[1];
  const tokens = source.match(/<[^>]*>|[^<]+/g) || [];
  if (tokens.join("") !== source) fail();
  let index = 0;
  const skipSpace = () => { while (index < tokens.length && /^\s+$/.test(tokens[index])) index++; };
  const scalar = (tag) => {
    if (tokens[index++] !== `<${tag}>`) fail();
    const value = tokens[index++] || "";
    if (value.startsWith("<") || tokens[index++] !== `</${tag}>` ||
        /&(?!amp;|lt;|gt;|quot;|apos;)/.test(value)) fail();
    return value.replace(/&(amp|lt|gt|quot|apos);/g,
      (_, entity) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[entity]);
  };
  const value = (depth = 0) => {
    if (depth > 3) fail();
    skipSpace();
    const tag = tokens[index];
    if (tag === "<dict/>" || tag === "<dict />") { index++; return new Map(); }
    if (tag === "<dict>") {
      index++;
      const entries = new Map();
      while (true) {
        skipSpace();
        if (tokens[index] === "</dict>") { index++; return entries; }
        if (tokens[index] !== "<key>") fail();
        const key = scalar("key");
        if (entries.has(key)) fail();
        entries.set(key, value(depth + 1));
      }
    }
    if (tag === "<array/>" || tag === "<array />") { index++; return []; }
    if (tag === "<array>") {
      index++;
      const entries = [];
      while (true) {
        skipSpace();
        if (tokens[index] === "</array>") { index++; return entries; }
        entries.push(value(depth + 1));
        if (entries.length > 8) fail();
      }
    }
    for (const kind of ["string", "integer", "date"]) {
      if (tag === `<${kind}>`) return { kind, text: scalar(kind) };
    }
    fail();
  };
  const root = value();
  skipSpace();
  if (!(root instanceof Map) || index !== tokens.length) fail();
  return root;
}

function inspectArchiveInfoPlist(bytes) {
  const root = parseUnsignedInfoPlist(bytes);
  const typed = (entry, kind, pattern) =>
    entry?.kind === kind && pattern.test(entry.text);
  const topKeys = new Set(["ApplicationProperties", "ArchiveVersion", "CreationDate", "Name", "SchemeName"]);
  for (const [key, entry] of root) {
    if (!topKeys.has(key)) fail();
    if (key === "ApplicationProperties") {
      if (!(entry instanceof Map)) fail();
      const appKeys = new Set(["ApplicationPath", "Architectures", "CFBundleIdentifier",
        "CFBundleShortVersionString", "CFBundleVersion", "SigningIdentity", "Team"]);
      for (const [appKey, appEntry] of entry) {
        if (!appKeys.has(appKey)) fail();
        if (appKey === "ApplicationPath" && !typed(appEntry, "string", /^Applications\/Runner\.app$/)) fail();
        if (appKey === "Architectures" &&
            (!Array.isArray(appEntry) || appEntry.length === 0 ||
             !appEntry.every((arch) => typed(arch, "string", /^(?:arm64|arm64e)$/)))) fail();
        if (appKey === "CFBundleIdentifier" &&
            !typed(appEntry, "string", /^com\.tommytang213\.settleora$/)) fail();
        if (["CFBundleShortVersionString", "CFBundleVersion"].includes(appKey) &&
            !typed(appEntry, "string", /^\d+(?:\.\d+){0,3}$/)) fail();
        if (appKey === "SigningIdentity" &&
            !typed(appEntry, "string", /^(?:Apple Distribution|iPhone Distribution|Apple Development|iPhone Developer): [A-Za-z .,'&()-]{1,80} \([A-Z0-9]{10}\)$/)) fail();
        if (appKey === "Team" && !typed(appEntry, "string", /^[A-Z0-9]{10}$/)) fail();
      }
    } else if (key === "ArchiveVersion" && !typed(entry, "integer", /^2$/)) fail();
    else if (key === "CreationDate" &&
        !typed(entry, "date", /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/)) fail();
    else if (["Name", "SchemeName"].includes(key) && !typed(entry, "string", /^Runner$/)) fail();
  }
}

function inspectSymbolInfoPlist(bytes, symbolName, bundlePlistXml) {
  const root = parseUnsignedInfoPlist(bytes);
  // The application's resource is authenticated and compared with the IPA.
  // Admit only its identifier or the actual symbol name, never arbitrary
  // unsigned bundle-identifying text supplied by the dSYM itself.
  const bundleIds = [...bundlePlistXml.matchAll(
    /<key>CFBundleIdentifier<\/key>\s*<string>([A-Za-z0-9][A-Za-z0-9._-]{0,254})<\/string>/g,
  )];
  if (bundleIds.length !== 1) fail();
  const identifiers = new Set([
    `com.apple.xcode.dsym.${symbolName}`,
    `com.apple.xcode.dsym.${bundleIds[0][1]}`,
  ]);
  const values = new Map([
    ["CFBundleDevelopmentRegion", /^(?:English|en)$/],
    ["CFBundleInfoDictionaryVersion", /^6\.0$/],
    ["CFBundlePackageType", /^dSYM$/],
    ["CFBundleSignature", /^\?{4}$/],
    ["CFBundleShortVersionString", /^\d+(?:\.\d+){0,3}$/],
    ["CFBundleVersion", /^\d+(?:\.\d+){0,3}$/],
  ]);
  if (!root.has("CFBundleIdentifier") || !root.has("CFBundlePackageType")) fail();
  for (const [key, entry] of root) {
    if (entry?.kind !== "string") fail();
    if (key === "CFBundleIdentifier") {
      if (!identifiers.has(entry.text)) fail();
    } else if (!values.get(key)?.test(entry.text)) fail();
  }
}

function runDwarfTool(args) {
  return execFileSync("/usr/bin/xcrun", ["dwarfdump", ...args], {
    encoding: "utf8", maxBuffer: 64 * 1024, timeout: 120_000,
    stdio: ["ignore", args[0] === "--uuid" ? "pipe" : "ignore", "ignore"],
  });
}

function dwarfUuidInventory(file, dwarfTool) {
  const output = dwarfTool(["--uuid", file]);
  if (typeof output !== "string" || output.length > 16 * 1024) fail();
  const lines = output.trim().split(/\r?\n/);
  const identities = lines.map((line) => {
    const match = /^UUID: ([0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}) \(([A-Za-z0-9_+-]+)\) .+$/.exec(line);
    if (!match) fail();
    return `${match[2]}:${match[1].toLowerCase()}`;
  });
  if (identities.length === 0 || new Set(identities).size !== identities.length) fail();
  return identities.sort().join("\n");
}

function verifyBoundDwarf(symbolFile, executableFile, dwarfTool) {
  try {
    // The magic bytes alone do not establish a valid symbol file. Verify its
    // DWARF graph, then bind every architecture UUID to signed application code.
    dwarfTool(["--verify", symbolFile]);
    if (dwarfUuidInventory(symbolFile, dwarfTool) !==
        dwarfUuidInventory(executableFile, dwarfTool)) fail();
  } catch { fail(); }
}

export function inspectXcarchive(root, ipaAppRoot, inspectPlist = (file) => execFileSync("plutil", ["-convert", "xml1", "-o", "-", file], {
  encoding: "utf8", maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "ignore"],
}), { verifySignature = verifyApplicationSignature, codeMatches = signedMachOCodeMatches,
  dwarfTool = runDwarfTool } = {}) {
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
  if (!ipaApp) fail();
  const archiveBefore = hashDirectory(root);
  const ipaBefore = hashDirectory(ipaApp);
  try {
    verifySignature(path.join(root, appRoot));
    verifySignature(ipaApp);
  } catch { fail(); }
  let appFiles = 0;
  let resignatureComparisons = 0;
  let symbolFiles = 0;
  let inspectedBytes = 0;
  const profile = createHash("sha256");
  for (const relative of [...files].sort()) {
    if (forbiddenPath.test(relative) || relative.length > 512 || relative.includes("\\")) fail();
    const isApp = relative.startsWith(`${appRoot}/`);
    const symbolPlist = /^dSYMs\/([A-Za-z0-9_.+-]+)\.(app|framework|appex)\.dSYM\/Contents\/Info\.plist$/.exec(relative);
    const symbol = /^dSYMs\/([A-Za-z0-9_.+-]+)\.(app|framework|appex)\.dSYM\/Contents\/Resources\/DWARF\/([A-Za-z0-9_.+-]+)$/.exec(relative);
    const isPlist = relative === "Info.plist" || symbolPlist != null;
    const isDwarf = symbol != null;
    if (!isApp && !isPlist && !isDwarf) fail();
    if (symbolPlist && !files.has(`dSYMs/${symbolPlist[1]}.${symbolPlist[2]}.dSYM/Contents/Resources/DWARF/${symbolPlist[1]}`)) fail();
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
    if (relative === "Info.plist") inspectArchiveInfoPlist(bytes);
    if (symbolPlist) {
      const bundleRelative = symbolPlist[2] === "app"
        ? appRoot
        : symbolPlist[2] === "framework"
          ? `${appRoot}/Frameworks/${symbolPlist[1]}.framework`
          : `${appRoot}/PlugIns/${symbolPlist[1]}.appex`;
      let bundlePlistXml;
      try {
        bundlePlistXml = inspectPlist(path.join(root, bundleRelative, "Info.plist"));
      } catch { fail(); }
      if (typeof bundlePlistXml !== "string" || bundlePlistXml.length > 1024 * 1024) fail();
      inspectSymbolInfoPlist(bytes, symbolPlist[1], bundlePlistXml);
    }
    if (isApp && relative !== `${appRoot}/embedded.mobileprovision` &&
        !relative.includes("/_CodeSignature/")) {
      const counterpart = path.join(ipaApp, relative.slice(appRoot.length + 1));
      const counterpartStat = lstatSync(counterpart);
      if (!counterpartStat.isFile() || counterpartStat.isSymbolicLink() ||
          counterpartStat.size > 1024 * 1024 * 1024) fail();
      const exportedBytes = readFileSync(counterpart);
      if (!exportedBytes.equals(bytes)) {
        try {
          if (!codeMatches(bytes, exportedBytes)) fail();
        } catch { fail(); }
        resignatureComparisons += 1;
      }
    }
    if (isDwarf) {
      if (symbol[1] !== symbol[3] || bytes.length < 4 ||
          !machoMagic.has(bytes.readUInt32BE(0)) ||
          !files.has(`dSYMs/${symbol[1]}.${symbol[2]}.dSYM/Contents/Info.plist`)) fail();
      const executableRelative = symbol[2] === "app"
        ? `${appRoot}/${symbol[1]}`
        : symbol[2] === "framework"
          ? `${appRoot}/Frameworks/${symbol[1]}.framework/${symbol[1]}`
          : `${appRoot}/PlugIns/${symbol[1]}.appex/${symbol[1]}`;
      if (!files.has(executableRelative)) fail();
      const executable = path.join(root, executableRelative);
      const executableStat = lstatSync(executable);
      if (!executableStat.isFile() || executableStat.size < 4 ||
          executableStat.size > 256 * 1024 * 1024 ||
          !machoMagic.has(readFileSync(executable).readUInt32BE(0))) fail();
      try { verifyDsymByteAccounting(bytes); } catch { fail(); }
      verifyBoundDwarf(file, executable, dwarfTool);
    }
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
  if (hashDirectory(root) !== archiveBefore || hashDirectory(ipaApp) !== ipaBefore) fail();
  return {
    archiveSha256: archiveBefore,
    exportedApplicationSha256: ipaBefore,
    applicationSignaturesVerified: true,
    resignatureComparisons,
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
