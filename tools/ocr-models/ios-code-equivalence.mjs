import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

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

// The caller verifies both complete signed bundles and their unchanged hashes.
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
