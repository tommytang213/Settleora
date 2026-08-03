import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  chownSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  verifyInstalledSemanticRecoveryNativeProducer,
  verifySemanticRecoveryNativeInstallPlan,
} from "./semantic-recovery-native-producer.mjs";
import { semanticRecoveryProtectedLayout } from "./semantic-recovery-protected-store.mjs";
import { validateNativeInstallJournal } from "./semantic-recovery-native-install-journal.mjs";

export const nativeInstallOwnerJournalRoot = "/workspace/logs/auto-runner/Settleora/manual-root-install-journals";
export const nativeInstallRootJournalRoot = "/etc/settleora-auto-runner/.semantic-recovery-native-install-journals";
export const nativeInstallRootResultRoot = "/etc/settleora-auto-runner/.semantic-recovery-native-install-results";

const correlationPattern = /^[a-z0-9][a-z0-9._:-]{7,127}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;
const shaPattern = /^[a-f0-9]{40}$/u;

export function publishFixedNativeInstallRootResult(value) {
  if (process.getuid?.() !== 0 || process.geteuid?.() !== 0) throw new Error("native install root result writer identity invalid");
  validateFixedNativeInstallRootResult(value);
  ensureRootResultDirectory();
  const finalPath = path.join(nativeInstallRootResultRoot, `${value.operationId}.json`);
  const temporary = path.join(nativeInstallRootResultRoot, `.${value.operationId}.${randomBytes(12).toString("hex")}.tmp`);
  const bytes = canonicalBytes(value);
  const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o400);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  chownSync(temporary, 0, 0);
  chmodSync(temporary, 0o444);
  fsyncFile(temporary);
  renameSync(temporary, finalPath);
  fsyncDirectory(nativeInstallRootResultRoot);
  const readback = readFixedNativeInstallRootResult(value.operationId);
  if (!readback || !canonicalBytes(readback).equals(bytes)) throw new Error("native install root result readback failed");
  return readback;
}

export function readFixedNativeInstallRootResult(operationId) {
  if (!digestPattern.test(String(operationId || ""))) throw new Error("native install root result selector invalid");
  if (!existsSync(nativeInstallRootResultRoot)) return null;
  assertRootDirectory("/etc");
  assertRootDirectory("/etc/settleora-auto-runner");
  assertRootDirectory(nativeInstallRootResultRoot);
  const finalPath = path.join(nativeInstallRootResultRoot, `${operationId}.json`);
  if (!existsSync(finalPath)) return null;
  const fd = openSync(finalPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    const first = fstatSync(fd);
    const pathname = lstatSync(finalPath);
    if (!first.isFile() || first.isSymbolicLink() || first.uid !== 0 || first.gid !== 0 || first.nlink !== 1
        || (first.mode & 0o7777) !== 0o444 || realpathSync(finalPath) !== finalPath || first.size < 1 || first.size > 64 * 1024
        || fileIdentity(first) !== fileIdentity(pathname)) throw new Error("native install root result file unsafe");
    bytes = readFileSync(fd);
    const second = fstatSync(fd);
    const final = lstatSync(finalPath);
    if (fileIdentity(first) !== fileIdentity(second) || fileIdentity(first) !== fileIdentity(final) || bytes.length !== first.size) {
      throw new Error("native install root result changed during read");
    }
  } finally { closeSync(fd); }
  const value = parseCanonicalJson(bytes);
  validateFixedNativeInstallRootResult(value);
  if (value.operationId !== operationId) throw new Error("native install root result identity mismatch");
  return value;
}

function validateFixedNativeInstallRootResult(value) {
  assertExactKeys(value, [
    "contract", "correlation", "installedDigest", "operationId", "outcome", "planDigest", "reasonCode", "repository",
    "rootJournalDigest", "sourceCommit", "state", "version",
  ]);
  if (value.contract !== "settleora_semantic_recovery_native_install_root_result" || value.version !== 1
      || !correlationPattern.test(String(value.correlation || "")) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(String(value.repository || ""))
      || !shaPattern.test(String(value.sourceCommit || "")) || !digestPattern.test(String(value.operationId || ""))
      || !digestPattern.test(String(value.rootJournalDigest || ""))
      || !["publication_ambiguous", "installed_verified", "adopted_verified", "blocked", "completed"].includes(value.state)
      || !/^(ambiguous|verified|adopted|blocked|completed)$/u.test(String(value.outcome || ""))
      || !/^[a-z0-9][a-z0-9_]{2,127}$/u.test(String(value.reasonCode || ""))
      || ["planDigest", "installedDigest"].some((field) => value[field] !== null && !digestPattern.test(String(value[field])))) {
    throw new Error("native install root result invalid");
  }
  return value;
}

function ensureRootResultDirectory() {
  const parent = "/etc/settleora-auto-runner";
  assertRootDirectory("/etc");
  assertRootDirectory(parent);
  if (!existsSync(nativeInstallRootResultRoot)) {
    mkdirSync(nativeInstallRootResultRoot, { mode: 0o755 });
    chownSync(nativeInstallRootResultRoot, 0, 0);
    chmodSync(nativeInstallRootResultRoot, 0o755);
    fsyncDirectory(parent);
  }
  assertRootDirectory(nativeInstallRootResultRoot);
}

export function verifyDurableInstalledNativeInstall({ installPackage, filesystem } = {}) {
  if (!verifySemanticRecoveryNativeInstallPlan(installPackage).ok || !filesystem) throw new Error("native install durable readback dependencies invalid");
  assertPublicationFilesystem(filesystem);
  filesystem.assertAuthorityBoundary();
  if (!filesystem.finalExists()) return { ok: false, reasonCode: "native_install_final_root_absent" };
  const first = verifyInstalledSemanticRecoveryNativeProducer({ plan: installPackage.plan, filesystem: filesystem.finalView() });
  if (!first.ok) return { ok: false, reasonCode: "native_install_final_readback_invalid" };
  filesystem.fsyncInstalled(installPackage.plan);
  const second = verifyInstalledSemanticRecoveryNativeProducer({ plan: installPackage.plan, filesystem: filesystem.finalView() });
  if (!second.ok) return { ok: false, reasonCode: "native_install_final_changed_during_readback" };
  return { ok: true, reasonCode: "native_install_final_durable_readback_verified", planDigest: installPackage.plan.planDigest, installedDigest: installedIdentity(installPackage.plan) };
}

/*
 * The adapter is deliberately an effect capability rather than a path. The live
 * adapter below has only the fixed protected root; tests inject an in-memory
 * implementation. No caller can select an arbitrary publication destination.
 */
export function publishOrAdoptVerifiedNativeInstall({ installPackage, correlation, filesystem, journal } = {}) {
  if (!verifySemanticRecoveryNativeInstallPlan(installPackage).ok || !correlationPattern.test(String(correlation || ""))
      || !filesystem || !journal || typeof journal.transition !== "function") {
    throw new Error("native install publication dependencies invalid");
  }
  assertPublicationFilesystem(filesystem);
  filesystem.assertAuthorityBoundary();
  if (filesystem.finalExists()) {
    const adopted = verifyInstalledSemanticRecoveryNativeProducer({ plan: installPackage.plan, filesystem: filesystem.finalView() });
    if (!adopted.ok) throw new Error("native install existing state conflicts with root plan");
    filesystem.assertNoPublicationResidue(correlation);
    filesystem.fsyncInstalled(installPackage.plan);
    const durable = verifyInstalledSemanticRecoveryNativeProducer({ plan: installPackage.plan, filesystem: filesystem.finalView() });
    if (!durable.ok) throw new Error("native install adopted state changed during durability readback");
    journal.transition("root_plan_verified", "adopted_verified", {
      outcome: "adopted",
      reasonCode: "native_install_exact_state_adopted",
      planDigest: installPackage.plan.planDigest,
      installedDigest: installedIdentity(installPackage.plan),
    });
    return { ok: true, adopted: true, installed: false, reasonCode: "native_install_exact_state_adopted", planDigest: installPackage.plan.planDigest };
  }

  filesystem.assertNoPublicationResidue(correlation);
  const stage = filesystem.createStage(correlation, 0o700, 0, 0);
  const directories = [...installPackage.plan.directories]
    .filter((entry) => entry.destination !== semanticRecoveryProtectedLayout.root)
    .sort((left, right) => depth(left.destination) - depth(right.destination) || left.destination.localeCompare(right.destination));
  for (const directory of directories) {
    const relative = relativeProtectedPath(directory.destination);
    filesystem.createDirectory(stage, relative, directory.mode, directory.uid, directory.gid);
    filesystem.fsyncDirectory(stage, relative);
    filesystem.fsyncDirectory(stage, path.posix.dirname(relative));
  }
  for (const artifact of installPackage.artifacts) {
    const relative = relativeProtectedPath(artifact.destination);
    filesystem.createFile(stage, relative, artifact.bytes, artifact.mode, artifact.uid, artifact.gid);
    filesystem.fsyncFile(stage, relative);
    filesystem.fsyncDirectory(stage, path.posix.dirname(relative));
  }
  // The sealed root becomes 0755 only while its containing directory remains
  // root-only 0700. Uncommitted authority bytes are never enumerable by an
  // unprivileged process.
  filesystem.sealStage(stage, 0o755, 0, 0);
  filesystem.fsyncDirectory(stage, ".");
  filesystem.fsyncPublicationParent();
  const staged = verifyInstalledSemanticRecoveryNativeProducer({ plan: installPackage.plan, filesystem: filesystem.stageView(stage) });
  if (!staged.ok) throw new Error("native install staged readback invalid");
  journal.transition("root_plan_verified", "publication_intent_durable", {
    outcome: "none",
    reasonCode: "native_install_publication_intent_durable",
    planDigest: installPackage.plan.planDigest,
  });
  journal.transition("publication_intent_durable", "publication_started", {
    outcome: "ambiguous",
    reasonCode: "native_install_publication_started",
    planDigest: installPackage.plan.planDigest,
  });
  try {
    filesystem.publishNoReplace(stage);
    filesystem.finalizePublishedStage(stage);
    filesystem.fsyncPublicationParent();
    filesystem.fsyncPublicationAncestor();
    const installed = verifyInstalledSemanticRecoveryNativeProducer({ plan: installPackage.plan, filesystem: filesystem.finalView() });
    if (!installed.ok) throw new Error("native install publication readback ambiguous");
    journal.transition("publication_started", "installed_verified", {
      outcome: "verified",
      reasonCode: "native_install_publication_verified",
      planDigest: installPackage.plan.planDigest,
      installedDigest: installedIdentity(installPackage.plan),
    });
    return { ok: true, adopted: false, installed: true, reasonCode: "native_install_publication_verified", planDigest: installPackage.plan.planDigest };
  } catch {
    const ambiguousReadback = filesystem.finalExists()
      ? verifyInstalledSemanticRecoveryNativeProducer({ plan: installPackage.plan, filesystem: filesystem.finalView() })
      : { ok: false };
    journal.transition("publication_started", "publication_ambiguous", {
      outcome: "ambiguous",
      reasonCode: "native_install_publication_transport_ambiguous",
      planDigest: installPackage.plan.planDigest,
    });
    if (!ambiguousReadback.ok || filesystem.stageExists(stage) || filesystem.stageResidueExists(stage)) {
      throw new Error("native install publication transport ambiguous");
    }
    filesystem.fsyncPublicationParent();
    filesystem.fsyncPublicationAncestor();
    journal.transition("publication_ambiguous", "installed_verified", {
      outcome: "verified",
      reasonCode: "native_install_ambiguous_publication_verified",
      planDigest: installPackage.plan.planDigest,
      installedDigest: installedIdentity(installPackage.plan),
    });
    return { ok: true, adopted: false, installed: true, reasonCode: "native_install_ambiguous_publication_verified", planDigest: installPackage.plan.planDigest };
  }
}

export function persistNativeInstallJournalTransition({ previous, next, store } = {}) {
  validateNativeInstallJournal(previous);
  validateNativeInstallJournal(next);
  if (!store || typeof store.read !== "function" || typeof store.claimTransition !== "function" || typeof store.writeExclusive !== "function"
      || typeof store.fsyncFile !== "function" || typeof store.replace !== "function" || typeof store.fsyncDirectory !== "function") {
    throw new Error("native install journal store invalid");
  }
  const current = store.read();
  validateNativeInstallJournal(current);
  if (current.journalDigest !== previous.journalDigest || next.previousState !== previous.state || next.sequence !== previous.sequence + 1) {
    throw new Error("native install journal compare-and-swap failed");
  }
  store.claimTransition(previous, next);
  const bytes = canonicalBytes(next);
  const temporary = store.writeExclusive(bytes);
  store.fsyncFile(temporary);
  store.replace(temporary);
  store.fsyncDirectory();
  const readback = store.read();
  validateNativeInstallJournal(readback);
  if (readback.journalDigest !== next.journalDigest || !canonicalBytes(readback).equals(bytes)) {
    throw new Error("native install journal readback failed");
  }
  return readback;
}

export function createFixedNativeInstallJournalStore({ scope, correlation, operationId = null } = {}) {
  if (!["owner", "root"].includes(scope) || !correlationPattern.test(String(correlation || ""))
      || !/^[a-f0-9]{64}$/u.test(String(operationId || ""))) {
    throw new Error("native install journal store selector invalid");
  }
  const root = scope === "root" ? nativeInstallRootJournalRoot : nativeInstallOwnerJournalRoot;
  const ownerAuthority = scope === "owner" ? lstatSync("/workspace/logs/auto-runner/Settleora") : null;
  const expectedUid = scope === "root" ? 0 : ownerAuthority.uid;
  const expectedGid = scope === "root" ? 0 : ownerAuthority.gid;
  if (!Number.isSafeInteger(expectedUid) || !Number.isSafeInteger(expectedGid)
      || (scope === "root" && (process.getuid?.() !== 0 || process.geteuid?.() !== 0))
      || (scope === "owner" && process.geteuid?.() !== 0 && (process.getuid?.() !== expectedUid || process.geteuid?.() !== expectedUid))) {
    throw new Error("native install journal process identity invalid");
  }
  ensurePrivateDirectory(root, expectedUid, expectedGid, scope);
  const selector = operationId;
  const finalPath = path.join(root, `${selector}.json`);
  const packagePath = path.join(root, `${selector}.package.json`);
  return {
    path: finalPath,
    exists: () => existsSync(finalPath),
    read() {
      assertPrivateRegularFile(finalPath, expectedUid, expectedGid);
      let current = parseCanonicalJson(readFileSync(finalPath));
      validateNativeInstallJournal(current);
      const prefix = `.${selector}.transition-${current.sequence + 1}-${current.journalDigest}.json`;
      const claims = readdirSync(root).filter((name) => name === prefix);
      if (claims.length > 1) throw new Error("native install journal transition claim ambiguous");
      if (claims.length === 1) {
        const claimPath = path.join(root, claims[0]);
        assertPrivateRegularFile(claimPath, expectedUid, expectedGid);
        const claim = parseCanonicalJson(readFileSync(claimPath));
        assertExactKeys(claim, ["next", "previousDigest", "sequence"]);
        validateNativeInstallJournal(claim.next);
        if (claim.previousDigest !== current.journalDigest || claim.sequence !== current.sequence + 1
            || claim.next.previousState !== current.state || claim.next.sequence !== claim.sequence) {
          throw new Error("native install journal transition claim invalid");
        }
        const temporary = path.join(root, `.${selector}.${randomBytes(12).toString("hex")}.recover.tmp`);
        const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
        try { writeFileSync(fd, canonicalBytes(claim.next)); fsyncSync(fd); } finally { closeSync(fd); }
        chownSync(temporary, expectedUid, expectedGid);
        chmodSync(temporary, 0o600);
        renameSync(temporary, finalPath);
        fsyncDirectory(root);
        current = claim.next;
      }
      return current;
    },
    writeInitial(bytes) {
      if (existsSync(finalPath)) throw new Error("native install journal already exists");
      const fd = openSync(finalPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
      chownSync(finalPath, expectedUid, expectedGid);
      chmodSync(finalPath, 0o600);
      fsyncFile(finalPath);
      fsyncDirectory(root);
    },
    writePlanSnapshot(bytes) {
      if (scope !== "root" || !Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > 32 * 1024 * 1024
          || existsSync(packagePath)) throw new Error("native install root plan snapshot write invalid");
      const fd = openSync(packagePath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
      chownSync(packagePath, 0, 0);
      chmodSync(packagePath, 0o600);
      fsyncFile(packagePath);
      fsyncDirectory(root);
      if (!readFileSync(packagePath).equals(bytes)) throw new Error("native install root plan snapshot readback failed");
    },
    readPlanSnapshot() {
      if (scope !== "root" || !existsSync(packagePath)) return null;
      assertPrivateRegularFile(packagePath, 0, 0);
      const bytes = readFileSync(packagePath);
      if (bytes.length < 1 || bytes.length > 32 * 1024 * 1024) throw new Error("native install root plan snapshot invalid");
      return Buffer.from(bytes);
    },
    writeExclusive(bytes) {
      const temporary = path.join(root, `.${selector}.${randomBytes(12).toString("hex")}.tmp`);
      const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { writeFileSync(fd, bytes); } finally { closeSync(fd); }
      chownSync(temporary, expectedUid, expectedGid);
      chmodSync(temporary, 0o600);
      return temporary;
    },
    claimTransition(previous, next) {
      const claim = path.join(root, `.${selector}.transition-${next.sequence}-${previous.journalDigest}.json`);
      const bytes = canonicalBytes({ next, previousDigest: previous.journalDigest, sequence: next.sequence });
      const fd = openSync(claim, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
      chownSync(claim, expectedUid, expectedGid);
      chmodSync(claim, 0o600);
      fsyncFile(claim);
      fsyncDirectory(root);
    },
    fsyncFile(target) { fsyncFile(target); },
    replace(temporary) {
      assertPrivateRegularFile(temporary, expectedUid, expectedGid);
      renameSync(temporary, finalPath);
    },
    fsyncDirectory() { fsyncDirectory(root); },
  };
}

export function createLiveNativeInstallFilesystem({ renameNoReplace } = {}) {
  if (process.getuid?.() !== 0 || process.geteuid?.() !== 0 || process.getgid?.() !== 0 || process.getegid?.() !== 0) {
    throw new Error("native install live filesystem requires real and effective root");
  }
  const protectedRoot = semanticRecoveryProtectedLayout.root;
  const publicationParent = path.posix.dirname(protectedRoot);
  const publicationAncestor = path.posix.dirname(publicationParent);
  if (typeof renameNoReplace !== "function") throw new Error("native install rename_noreplace capability required");
  return {
    assertAuthorityBoundary() {
      for (const target of ["/etc", publicationAncestor]) assertRootDirectory(target);
      if (existsSync(publicationParent)) assertRootDirectory(publicationParent);
    },
    finalExists: () => existsSync(protectedRoot),
    assertNoPublicationResidue(correlation) {
      if (!existsSync(publicationParent)) return;
      const expected = new Set([
        path.posix.basename(protectedRoot),
        path.posix.basename(nativeInstallRootJournalRoot),
        path.posix.basename(nativeInstallRootResultRoot),
      ]);
      for (const name of readdirSync(publicationParent)) {
        if (name.startsWith(`.semantic-recovery-authority.install-${correlation}`) || name.startsWith(".semantic-recovery-authority.retired-")
            || name.startsWith(".semantic-recovery-authority.backup-") || (!expected.has(name) && name.includes("semantic-recovery-authority"))) {
          throw new Error("native install publication residue present");
        }
      }
    },
    createStage(correlation, mode, uid, gid) {
      if (!existsSync(publicationParent)) {
        mkdirSync(publicationParent, { mode: 0o755 });
        chownSync(publicationParent, 0, 0);
        chmodSync(publicationParent, 0o755);
        fsyncDirectory(publicationAncestor);
      }
      const container = path.posix.join(publicationParent, `.semantic-recovery-authority.install-${correlation}`);
      mkdirSync(container, { mode: 0o700 });
      chownSync(container, 0, 0);
      chmodSync(container, 0o700);
      fsyncDirectory(publicationParent);
      const stage = path.posix.join(container, "root");
      mkdirSync(stage, { mode });
      chownSync(stage, uid, gid);
      chmodSync(stage, mode);
      fsyncDirectory(stage);
      fsyncDirectory(container);
      return stage;
    },
    createDirectory(stage, relative, mode, uid, gid) {
      const target = stageTarget(stage, relative);
      mkdirSync(target, { mode });
      chownSync(target, uid, gid);
      chmodSync(target, mode);
      assertWithinStage(stage, target);
    },
    createFile(stage, relative, bytes, mode, uid, gid) {
      const target = stageTarget(stage, relative);
      const fd = openSync(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, mode);
      try { writeFileSync(fd, bytes); } finally { closeSync(fd); }
      chownSync(target, uid, gid);
      chmodSync(target, mode);
      assertWithinStage(stage, target);
    },
    sealStage(stage, mode, uid, gid) {
      const info = lstatSync(stage);
      if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== 0 || info.gid !== 0 || (info.mode & 0o7777) !== 0o700
          || realpathSync(stage) !== stage) throw new Error("native install private stage changed before seal");
      chownSync(stage, uid, gid);
      chmodSync(stage, mode);
    },
    fsyncFile(stage, relative) { fsyncFile(stageTarget(stage, relative)); },
    fsyncDirectory(stage, relative) { fsyncDirectory(stageTarget(stage, relative)); },
    fsyncInstalled(plan) {
      for (const file of [...plan.files].sort((left, right) => left.destination.localeCompare(right.destination))) fsyncFile(file.destination);
      for (const directory of [...plan.directories].sort((left, right) => depth(right.destination) - depth(left.destination))) fsyncDirectory(directory.destination);
      fsyncDirectory(publicationParent);
      fsyncDirectory(publicationAncestor);
    },
    fsyncPublicationParent: () => fsyncDirectory(publicationParent),
    fsyncPublicationAncestor: () => fsyncDirectory(publicationAncestor),
    stageView: (stage) => createMappedReadOnlyFilesystem(stage),
    finalView: () => createMappedReadOnlyFilesystem(protectedRoot),
    publishNoReplace(stage) { renameNoReplace(stage, protectedRoot); },
    stageExists: (stage) => existsSync(stage),
    stageResidueExists: (stage) => existsSync(path.posix.dirname(stage)),
    finalizePublishedStage(stage) {
      const container = path.posix.dirname(stage);
      if (existsSync(stage) || path.posix.dirname(container) !== publicationParent
          || !path.posix.basename(container).startsWith(".semantic-recovery-authority.install-")) {
        throw new Error("native install published stage cleanup boundary invalid");
      }
      rmdirSync(container);
      fsyncDirectory(publicationParent);
    },
  };
}

function createMappedReadOnlyFilesystem(actualRoot) {
  const map = (target) => {
    const relative = relativeProtectedPath(target);
    return relative === "." ? actualRoot : path.posix.join(actualRoot, relative);
  };
  return {
    inspect(target) {
      const info = lstatSync(map(target));
      return { type: info.isDirectory() ? "directory" : info.isFile() ? "file" : "other", symlink: info.isSymbolicLink(), uid: info.uid, gid: info.gid, mode: info.mode & 0o7777, nlink: info.nlink, size: info.size, dev: info.dev, ino: info.ino, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs };
    },
    read: (target) => readFileSync(map(target)),
    list: (target) => readdirSync(map(target)),
    realpath(target) {
      const actual = realpathSync(map(target));
      const relative = path.posix.relative(actualRoot, actual);
      if (relative.startsWith("..") || path.posix.isAbsolute(relative)) return actual;
      return relative === "" ? semanticRecoveryProtectedLayout.root : path.posix.join(semanticRecoveryProtectedLayout.root, relative);
    },
  };
}

function assertPublicationFilesystem(value) {
  for (const method of [
    "assertAuthorityBoundary", "finalExists", "assertNoPublicationResidue", "createStage", "createDirectory", "createFile",
    "fsyncFile", "fsyncDirectory", "fsyncInstalled", "fsyncPublicationParent", "fsyncPublicationAncestor", "sealStage", "stageView", "finalView", "publishNoReplace",
    "stageExists", "stageResidueExists", "finalizePublishedStage",
  ]) if (typeof value[method] !== "function") throw new Error(`native install filesystem capability missing: ${method}`);
}
function relativeProtectedPath(target) {
  if (target === semanticRecoveryProtectedLayout.root) return ".";
  const prefix = `${semanticRecoveryProtectedLayout.root}/`;
  if (typeof target !== "string" || !target.startsWith(prefix) || path.posix.normalize(target) !== target) {
    throw new Error("native install destination outside protected root");
  }
  const relative = target.slice(prefix.length);
  if (relative === "" || relative.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("native install destination invalid");
  }
  return relative;
}
function stageTarget(stage, relative) {
  if (relative === ".") return stage;
  const target = path.posix.join(stage, relative);
  if (path.posix.relative(stage, target).startsWith("..")) throw new Error("native install stage escape");
  return target;
}
function assertWithinStage(stage, target) {
  const parent = path.posix.dirname(target);
  const realParent = realpathSync(parent);
  const realStage = realpathSync(stage);
  if (realParent !== parent || (realParent !== realStage && !realParent.startsWith(`${realStage}/`))) {
    throw new Error("native install stage parent unsafe");
  }
}
function installedIdentity(plan) { return createHash("sha256").update(canonicalBytes({ planDigest: plan.planDigest, files: plan.files, directories: plan.directories })).digest("hex"); }
function fileIdentity(value) { return `${value.dev}:${value.ino}:${value.size}:${value.mtimeMs}:${value.ctimeMs}:${value.mode}:${value.uid}:${value.gid}:${value.nlink}`; }
function depth(target) { return target.split("/").length; }
function ensurePrivateDirectory(target, uid, gid, scope) {
  const parent = path.dirname(target);
  if (scope === "root" && !existsSync(parent)) {
    if (parent !== "/etc/settleora-auto-runner") throw new Error("native install root journal parent invalid");
    assertRootDirectory("/etc");
    mkdirSync(parent, { mode: 0o755 });
    chownSync(parent, 0, 0);
    chmodSync(parent, 0o755);
    fsyncDirectory("/etc");
    fsyncDirectory(parent);
  }
  if (scope === "root") assertRootDirectory(parent);
  else {
    const authority = lstatSync(parent);
    if (!authority.isDirectory() || authority.isSymbolicLink() || authority.uid !== uid || authority.gid !== gid
        || (authority.mode & 0o077) !== 0 || realpathSync(parent) !== parent) throw new Error("native install owner journal parent unsafe");
  }
  if (!existsSync(target)) {
    mkdirSync(target, { mode: 0o700 });
    chownSync(target, uid, gid);
    chmodSync(target, 0o700);
    fsyncDirectory(parent);
  }
  const info = lstatSync(target);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== uid || info.gid !== gid || (info.mode & 0o7777) !== 0o700
      || realpathSync(target) !== target) throw new Error("native install journal directory unsafe");
  fsyncDirectory(target);
  fsyncDirectory(parent);
}
function assertPrivateRegularFile(target, uid, gid) {
  const first = lstatSync(target);
  const second = statSync(target);
  if (!first.isFile() || first.isSymbolicLink() || first.uid !== uid || first.gid !== gid || first.nlink !== 1
      || (first.mode & 0o7777) !== 0o600 || first.dev !== second.dev || first.ino !== second.ino || realpathSync(target) !== target) {
    throw new Error("native install journal file unsafe");
  }
}
function assertRootDirectory(target) {
  const info = lstatSync(target);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== 0 || info.gid !== 0 || (info.mode & 0o022) !== 0
      || realpathSync(target) !== target) throw new Error("native install root boundary unsafe");
}
function fsyncFile(target) { const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW); try { fsyncSync(fd); } finally { closeSync(fd); } }
function fsyncDirectory(target) { const fd = openSync(target, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); try { fsyncSync(fd); } finally { closeSync(fd); } }
function parseCanonicalJson(bytes) {
  const text = Buffer.from(bytes).toString("utf8");
  if (!Buffer.from(text).equals(Buffer.from(bytes))) throw new Error("native install journal encoding invalid");
  let value;
  try { value = JSON.parse(text); } catch { throw new Error("native install journal JSON invalid"); }
  if (!canonicalBytes(value).equals(Buffer.from(bytes))) throw new Error("native install journal JSON noncanonical");
  return value;
}
function canonicalBytes(value) { return Buffer.from(`${JSON.stringify(canonicalize(value))}\n`); }
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}
function assertExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) throw new Error("native install journal claim schema invalid");
}
