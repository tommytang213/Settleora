import { execFileSync } from "node:child_process";
import { closeSync, constants, fstatSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const magic = new Set([
  0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe,
  0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca,
]);

export function isMachO(bytes) {
  return bytes.length >= 4 && magic.has(bytes.readUInt32BE(0));
}

export function verifyApplicationSignature(application) {
  execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", application], {
    stdio: ["ignore", "ignore", "ignore"], timeout: 120_000,
  });
}

function removeSignature(file) {
  execFileSync("/usr/bin/codesign", ["--remove-signature", file], {
    stdio: ["ignore", "ignore", "ignore"], timeout: 120_000,
  });
}

// The caller verifies both signed files or their enclosing signed bundles,
// and checks that the original bytes remain unchanged.
// Only disposable copies are stripped. Apple handles each Mach-O architecture
// and its load commands; every remaining byte must match, not merely a UUID.
export function signedMachOCodeMatches(left, right, stripSignature = removeSignature) {
  if (!isMachO(left) || !isMachO(right)) return false;
  const root = mkdtempSync(path.join(os.tmpdir(), "settleora-code-equivalence-"));
  try {
    const files = [path.join(root, "archive"), path.join(root, "export")];
    for (const [index, bytes] of [left, right].entries()) {
      writeFileSync(files[index], bytes, { mode: 0o600, flag: "wx" });
      stripSignature(files[index]);
    }
    const normalized = files.map((file) => readFileSync(file));
    return normalized.every(isMachO) && normalized[0].equals(normalized[1]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function readRegularMachO(file) {
  const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size < 4 || before.size > 256 * 1024 * 1024) {
      throw new Error("Signed Mach-O file is missing or oversized");
    }
    const buffer = Buffer.allocUnsafe(before.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(descriptor, buffer, length, buffer.length - length, length);
      if (count === 0) break;
      length += count;
    }
    const bytes = buffer.subarray(0, length), after = fstatSync(descriptor);
    if (before.size !== length || before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || !isMachO(bytes)) {
      throw new Error("Signed Mach-O file changed or is invalid");
    }
    return { bytes, device: before.dev, inode: before.ino };
  } finally { closeSync(descriptor); }
}

// SwiftSupport keeps the toolchain library while the embedded counterpart
// may be re-signed. Validate each original signature before comparing code;
// byte equality alone must not accept unsigned or damaged libraries.
export function verifySignedMachOFiles(left, right, {
  verifySignature = verifyApplicationSignature,
  codeMatches = signedMachOCodeMatches,
} = {}) {
  const files = [left, right], originals = files.map(readRegularMachO);
  for (const file of files) verifySignature(file);
  const signatureOnlyDifference = !originals[0].bytes.equals(originals[1].bytes);
  if (signatureOnlyDifference && !codeMatches(originals[0].bytes, originals[1].bytes)) {
    throw new Error("Signed Mach-O executable content differs");
  }
  for (const [index, file] of files.entries()) {
    const after = readRegularMachO(file), before = originals[index];
    if (after.device !== before.device || after.inode !== before.inode ||
        !after.bytes.equals(before.bytes)) throw new Error("Signed Mach-O original changed");
  }
  return { signaturesVerified: true, signatureOnlyDifference };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    if (process.argv.length !== 5 || process.argv[2] !== "--compare-signed-files") {
      throw new Error("Invalid signed Mach-O comparison invocation");
    }
    verifySignedMachOFiles(process.argv[3], process.argv[4]);
    console.log("Signed Mach-O executable equivalence verified");
  } catch {
    console.error("Signed Mach-O executable equivalence verification failed");
    process.exitCode = 1;
  }
}
