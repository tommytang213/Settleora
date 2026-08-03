#!/usr/bin/node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync, chownSync, closeSync, constants, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  authenticateNativeInstallGitSource,
  gitObjectOid,
  materializeAuthenticatedNativeInstallClosure,
  nativeInstallRenameNoReplaceHelper,
  normalizeNativeInstallSourceHint,
  reverifyMaterializedNativeInstallClosure,
  verifyAuthenticatedNativeInstallSource,
} from "./lib/semantic-recovery-native-install-source.mjs";
import { independentlyVerifyRootNativeInstallPackage } from "./lib/semantic-recovery-native-install-verifier.mjs";
import {
  buildNativeInstallSudoArgv,
  createNativeInstallJournal,
  nativeInstallOperationIdentity,
  nativeInstallTrustedBootstrapPath,
  resumeNativeInstallProtocol,
  sanitizeNativeInstallProcessResult,
  transitionNativeInstallJournal,
  validateInteractiveSudoBoundary,
  validateNativeInstallJournal,
} from "./lib/semantic-recovery-native-install-journal.mjs";
import {
  createFixedNativeInstallJournalStore,
  createLiveNativeInstallFilesystem,
  completeVerifiedNativeInstallResult,
  persistNativeInstallJournalTransition,
  publishFixedNativeInstallRootResult,
  publishOrAdoptVerifiedNativeInstall,
  readFixedNativeInstallRootResult,
  nativeInstallRootJournalRoot,
  verifyDurableInstalledNativeInstall,
} from "./lib/semantic-recovery-native-install-publication.mjs";
import {
  deriveSemanticRecoveryNativeInstallPackageFromRoot,
  deriveSemanticRecoveryNativeAuthorityProjectionsFromRoot,
  deriveSemanticRecoveryNativeProducerRequestFromRoot,
} from "./semantic-recovery-native-producer.mjs";

const fixedNode = "/usr/bin/node";
const fixedGit = "/usr/bin/git";
const fixedPython = "/usr/bin/python3";
const authorityDocumentName = ".native-install-source-authority.json";
const maximumInputBytes = 64 * 1024;
const modes = new Set(["--prepare", "--arm-interactive-sudo", "--resume", "--root-bootstrap", "--root-authority-internal", "--root-plan-reader-internal", "--root-verify-reader-internal"]);

export async function main(argv = process.argv.slice(2), input = process.stdin) {
  if (argv.length !== 1 || !modes.has(argv[0])) throw new Error("one closed native install mode is required");
  const value = await readCanonicalInput(input);
  if (["--root-plan-reader-internal", "--root-verify-reader-internal"].includes(argv[0])) return rootSourceReader(argv[0], value);
  const hint = normalizeNativeInstallSourceHint(value);
  if (argv[0] === "--prepare") return prepare(hint);
  if (argv[0] === "--arm-interactive-sudo") return armInteractiveSudo(hint);
  if (argv[0] === "--resume") return resume(hint);
  if (argv[0] === "--root-bootstrap") return rootBootstrap(hint);
  return rootAuthority(hint);
}

function armInteractiveSudo(hint) {
  assertUnprivilegedOwner();
  verifyTrustedBootstrapPrerequisite(hint);
  const operationId = operationIdentity(hint);
  const store = createFixedNativeInstallJournalStore({ scope: "owner", correlation: hint.taskCorrelation, operationId });
  const current = store.read();
  assertHintCorrelation(hint, current);
  let journal = transitionNativeInstallJournal({
    current,
    expectedState: "awaiting_interactive_sudo",
    nextState: "sudo_started",
    observedAt: new Date().toISOString(),
    result: journalResult({ outcome: "none", reasonCode: "native_install_interactive_sudo_armed" }),
    persist: (value) => persistNativeInstallJournalTransition({ ...value, store }),
  });
  const ownerJournalBytes = readFileSync(store.path);
  const ownerJournalSha256 = sha256(ownerJournalBytes);
  const sudoArgv = buildNativeInstallSudoArgv({
    sourceCommit: hint.sourceCommit,
    bootstrapBlob: hint.bootstrapBlob,
    correlation: hint.taskCorrelation,
    operationId,
    ownerJournalDigest: journal.journalDigest,
    ownerJournalSha256,
  });
  validateInteractiveSudoBoundary({
    argv: sudoArgv,
    env: {},
    tty: realTtyAvailable(),
    stdinKind: "tty_password_only_no_program_bytes",
    stdoutKind: "bounded_capture",
    stderrKind: "bounded_capture",
  });
  const tty = openSync("/dev/tty", constants.O_RDWR | constants.O_NOFOLLOW);
  let child;
  try {
    child = spawnSync(sudoArgv[0], sudoArgv.slice(1), {
      cwd: "/",
      env: {},
      stdio: [tty, "pipe", "pipe"],
      encoding: "utf8",
      maxBuffer: 64 * 1024,
      timeout: 10 * 60 * 1000,
    });
  } finally { closeSync(tty); }
  const process = sanitizeNativeInstallProcessResult({
    status: child.status,
    signal: child.signal,
    stdout: child.stdout || "",
    stderr: child.stderr || "",
    timedOut: child.error?.code === "ETIMEDOUT",
    processLost: Boolean(child.error && child.error.code !== "ETIMEDOUT"),
  });
  const rootResult = readFixedNativeInstallRootResult(operationId);
  if (rootResult?.state === "completed" && rootResult.correlation === hint.taskCorrelation
      && rootResult.repository.toLowerCase() === hint.repository.toLowerCase() && rootResult.sourceCommit === hint.sourceCommit
      && child.status === 0 && child.signal === null && !child.error) {
    journal = transitionNativeInstallJournal({
      current: journal,
      expectedState: "sudo_started",
      nextState: "completed",
      observedAt: new Date().toISOString(),
      result: journalResult({
        outcome: "completed",
        reasonCode: "native_install_root_result_durably_read",
        planDigest: rootResult.planDigest,
        installedDigest: rootResult.installedDigest,
        process,
      }),
      persist: (value) => persistNativeInstallJournalTransition({ ...value, store }),
    });
  }
  return writeResult({
    ok: journal.state === "completed",
    reasonCode: journal.state === "completed" ? "native_install_interactive_handoff_completed" : "native_install_interactive_handoff_requires_readback",
    correlation: journal.correlation,
    sourceCommit: journal.sourceCommit,
    sudoAttemptCount: journal.sudoAttemptCount,
    process,
    nextAction: journal.state === "completed" ? "none" : "resume_readback_only_no_second_sudo",
  });
}

function prepare(hint) {
  assertUnprivilegedOwner();
  verifyTrustedBootstrapPrerequisite(hint);
  const operationId = operationIdentity(hint);
  const store = createFixedNativeInstallJournalStore({ scope: "owner", correlation: hint.taskCorrelation, operationId });
  let journal = createNativeInstallJournal({
    correlation: hint.taskCorrelation,
    repository: hint.repository,
    sourceCommit: hint.sourceCommit,
    operationId,
    observedAt: new Date().toISOString(),
  });
  store.writeInitial(canonicalBytes(journal));
  journal = transitionNativeInstallJournal({
    current: journal,
    expectedState: "prepared",
    nextState: "awaiting_interactive_sudo",
    observedAt: new Date().toISOString(),
    persist: (transition) => persistNativeInstallJournalTransition({ ...transition, store }),
  });
  return writeResult({
    ok: true,
    reasonCode: "native_install_awaiting_fixed_root_bootstrap_handoff",
    correlation: journal.correlation,
    sourceCommit: journal.sourceCommit,
    sudoAttemptCount: journal.sudoAttemptCount,
    nextAction: "verify_fixed_root_bootstrap_prerequisite_then_run_arm_interactive_sudo_once",
  });
}

function resume(hint) {
  assertUnprivilegedOwner();
  const store = createFixedNativeInstallJournalStore({ scope: "owner", correlation: hint.taskCorrelation, operationId: operationIdentity(hint) });
  let journal = store.read();
  validateNativeInstallJournal(journal);
  assertHintCorrelation(hint, journal);
  const rootResult = readFixedNativeInstallRootResult(journal.operationId);
  if (journal.state === "sudo_started" && rootResult?.state === "completed"
      && rootResult.correlation === journal.correlation && rootResult.repository.toLowerCase() === journal.repository.toLowerCase()
      && rootResult.sourceCommit === journal.sourceCommit) {
    journal = transitionNativeInstallJournal({
      current: journal,
      expectedState: "sudo_started",
      nextState: "completed",
      observedAt: new Date().toISOString(),
      result: journalResult({ outcome: "completed", reasonCode: "native_install_root_result_durably_read", planDigest: rootResult.planDigest, installedDigest: rootResult.installedDigest }),
      persist: (value) => persistNativeInstallJournalTransition({ ...value, store }),
    });
  }
  return writeResult({ ...resumeNativeInstallProtocol({ ownerJournal: journal }), correlation: journal.correlation, sourceCommit: journal.sourceCommit, rootResult });
}

function rootBootstrap(hint) {
  assertRootBootstrapBoundary();
  loadRootReceipt(hint);
  const checkoutRoot = authenticatedCheckoutRoot();
  const authenticatedSource = authenticateNativeInstallGitSource({ hint, objectReader: createRootGitObjectReader(checkoutRoot, hint) });
  const materializedRoot = materializeAuthenticatedNativeInstallClosure({ authenticatedSource });
  chmodSync(materializedRoot, 0o700);
  writeSourceAuthorityDocument(materializedRoot, { checkoutRoot, manifest: authenticatedSource.manifest });
  chmodSync(materializedRoot, 0o555);
  fsyncPath(materializedRoot, true);
  fsyncPath(path.dirname(materializedRoot), true);
  const entrypoint = path.join(materializedRoot, "tools/auto-runner/semantic-recovery-native-install.mjs");
  let child;
  try {
    child = spawnSync(fixedNode, [entrypoint, "--root-authority-internal"], {
      cwd: materializedRoot,
      env: { HOME: "/root", LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" },
      input: canonicalBytes(hint),
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 5 * 60 * 1000,
    });
  } finally {
    if (path.dirname(materializedRoot) !== "/tmp" || !path.basename(materializedRoot).startsWith("settleora-native-install-root-")) {
      throw new Error("native install materialized cleanup boundary invalid");
    }
    chmodSync(materializedRoot, 0o700);
    rmSync(materializedRoot, { recursive: true, force: false, maxRetries: 0 });
  }
  if (child.error || child.signal || child.status !== 0 || child.stderr !== "") {
    throw new Error("native install root authority subprocess blocked");
  }
  const result = parseCanonicalJson(Buffer.from(child.stdout));
  return writeResult(result);
}

function rootAuthority(hint) {
  assertRootMaterializedBoundary();
  const materializedRoot = authenticatedCheckoutRoot();
  loadMaterializedSource(hint);
  const receipt = loadRootReceipt(hint);
  const operationId = operationIdentity(hint);
  const store = createFixedNativeInstallJournalStore({ scope: "root", correlation: hint.taskCorrelation, operationId });
  const filesystem = liveFilesystem(materializedRoot);
  if (store.exists()) return reconcileRootResult({ hint, receipt, store, filesystem });
  let journal = createNativeInstallJournal({
    correlation: hint.taskCorrelation,
    repository: hint.repository,
    sourceCommit: hint.sourceCommit,
    operationId,
    ownerTransitionDigest: receipt.ownerJournalDigest,
    observedAt: receipt.observedAt,
  });
  store.writeInitial(canonicalBytes(journal));
  const advanceRoot = (expectedState, nextState, partial = null) => {
    const result = partial === null ? null : journalResult(partial);
    journal = transitionNativeInstallJournal({
      current: journal,
      expectedState,
      nextState,
      observedAt: new Date().toISOString(),
      result,
      persist: (value) => persistNativeInstallJournalTransition({ ...value, store }),
    });
    return journal;
  };
  advanceRoot("prepared", "awaiting_interactive_sudo");
  advanceRoot("awaiting_interactive_sudo", "sudo_started", { outcome: "none", reasonCode: "native_install_interactive_root_started" });

  try {
    const verified = runIndependentRootReaders(hint, journal.observedAt);
    store.writePlanSnapshot(canonicalBytes({
      contract: "settleora_semantic_recovery_native_install_root_plan_snapshot",
      version: 1,
      observedAt: journal.observedAt,
      requestDigest: verified.requestDigest,
      sourceManifestDigest: verified.sourceManifestDigest,
      planDigest: verified.planDigest,
      package: encodeInstallPackage(verified.package),
    }));
    advanceRoot("sudo_started", "root_authority_rederived", {
      outcome: "verified",
      reasonCode: "native_install_root_authority_rederived",
      requestDigest: verified.requestDigest,
      sourceManifestDigest: verified.sourceManifestDigest,
    });
    advanceRoot("root_authority_rederived", "root_plan_verified", {
      outcome: "verified",
      reasonCode: "native_install_root_plan_verified",
      requestDigest: verified.requestDigest,
      sourceManifestDigest: verified.sourceManifestDigest,
      planDigest: verified.planDigest,
    });

    const published = publishOrAdoptVerifiedNativeInstall({
      installPackage: verified.package,
      correlation: hint.taskCorrelation,
      filesystem,
      journal: { transition(expectedState, nextState, partial) { advanceRoot(expectedState, nextState, partial); } },
    });
    const completed = completeVerifiedNativeInstallResult({
      journal,
      installPackage: verified.package,
      filesystem,
      completion: {
        reasonCode: "native_install_completed",
        requestDigest: verified.requestDigest,
        sourceManifestDigest: verified.sourceManifestDigest,
        planDigest: verified.planDigest,
      },
      transition: ({ current, expectedState, nextState, result }) => {
        if (current.journalDigest !== journal.journalDigest) throw new Error("native install verified completion journal changed");
        return advanceRoot(expectedState, nextState, result);
      },
      publishResult: (current) => publishRootResult(hint, current),
    });
    journal = completed.journal;
    return writeResult({
      ok: true,
      reasonCode: published.reasonCode,
      correlation: hint.taskCorrelation,
      sourceCommit: hint.sourceCommit,
      sourceManifestDigest: verified.sourceManifestDigest,
      requestDigest: verified.requestDigest,
      planDigest: verified.planDigest,
      installed: published.installed,
      adopted: published.adopted,
    });
  } catch {
    try { journal = store.read(); } catch { /* Preserve the last authenticated in-process state. */ }
    if (["installed_verified", "adopted_verified", "completed"].includes(journal.state)) {
      try { return reconcileRootResult({ hint, receipt, store, filesystem }); }
      catch { throw new Error("native install verified result reconciliation blocked"); }
    }
    if (journal.state === "publication_started") {
      try {
        advanceRoot("publication_started", "publication_ambiguous", {
          outcome: "ambiguous",
          reasonCode: "native_install_post_publication_failure_ambiguous",
          requestDigest: journal.requestDigest,
          sourceManifestDigest: journal.result?.sourceManifestDigest,
          planDigest: journal.result?.planDigest,
          installedDigest: journal.result?.installedDigest,
        });
      } catch {
        try { journal = store.read(); } catch { /* Exact durable state is unavailable; do not issue another effect. */ }
      }
      if (["installed_verified", "adopted_verified", "completed"].includes(journal.state)) {
        try { return reconcileRootResult({ hint, receipt, store, filesystem }); }
        catch { throw new Error("native install verified result reconciliation blocked"); }
      }
    } else if (!["publication_ambiguous", "blocked", "completed", "installed_verified", "adopted_verified"].includes(journal.state)) {
      try {
        advanceRoot(journal.state, "blocked", {
          outcome: "blocked",
          reasonCode: "native_install_root_operation_blocked",
          requestDigest: journal.requestDigest,
          sourceManifestDigest: journal.result?.sourceManifestDigest,
          planDigest: journal.result?.planDigest,
          installedDigest: journal.result?.installedDigest,
        });
      } catch {
        // A durable transition claim may have won immediately before failure.
        // Never issue another effect while reconciliation is ambiguous.
        try { journal = store.read(); } catch { /* Preserve bounded failure below. */ }
      }
    }
    if (["publication_ambiguous", "blocked"].includes(journal.state)) publishRootResult(hint, journal);
    throw new Error("native install root operation blocked");
  }
}

function rootSourceReader(mode, value) {
  assertExactKeys(value, ["hint", "observedAt"]);
  const hint = normalizeNativeInstallSourceHint(value.hint);
  const observedAt = new Date(value.observedAt);
  if (!Number.isFinite(observedAt.getTime()) || observedAt.toISOString() !== value.observedAt) throw new Error("native install reader timestamp invalid");
  assertMaterializedSourceReaderBoundary();
  const authenticatedSource = loadMaterializedSource(hint);
  const request = deriveSemanticRecoveryNativeProducerRequestFromRoot({ now: observedAt });
  const producerSupport = authenticatedSource.supportFiles
    .filter((entry) => entry.source.endsWith(".mjs") && entry.source !== "tools/auto-runner/semantic-recovery-native-install.mjs")
    .map(({ gitBlobOid: _gitBlobOid, ...entry }) => entry);
  const result = mode === "--root-plan-reader-internal"
    ? { package: deriveSemanticRecoveryNativeInstallPackageFromRoot({ request, producerSourceSha: authenticatedSource.manifest.sourceCommit, supportFiles: producerSupport }) }
    : independentlyVerifyRootNativeInstallPackage({
      installPackage: null,
      authenticatedSource,
      request,
      projections: deriveSemanticRecoveryNativeAuthorityProjectionsFromRoot({ request }).projections,
    });
  const installPackage = result.package;
  return writeResult({
    package: encodeInstallPackage(installPackage),
    planDigest: installPackage.plan.planDigest,
    requestDigest: installPackage.plan.requestDigest,
    sourceManifestDigest: authenticatedSource.manifest.sourceManifestDigest,
  });
}

function runIndependentRootReaders(hint, observedAt = new Date().toISOString(), expectedPackage = null) {
  const sourceIdentity = fixedProductionSourceIdentity();
  const input = canonicalBytes({ hint, observedAt });
  const modesToRun = expectedPackage === null ? ["--root-plan-reader-internal", "--root-verify-reader-internal"] : ["--root-verify-reader-internal"];
  const outputs = modesToRun.map((mode) => {
    const child = spawnSync(fixedNode, [path.join(authenticatedCheckoutRoot(), "tools/auto-runner/semantic-recovery-native-install.mjs"), mode], {
      cwd: authenticatedCheckoutRoot(),
      env: { HOME: "/home/tommytang213", LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" },
      uid: sourceIdentity.uid,
      gid: sourceIdentity.gid,
      input,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    });
    if (child.error || child.signal || child.status !== 0 || child.stderr !== "") throw new Error("native install source authority reader blocked");
    return parseCanonicalJson(Buffer.from(child.stdout));
  });
  if (outputs.length === 2 && !canonicalBytes(outputs[0]).equals(canonicalBytes(outputs[1]))) {
    throw new Error("native install independent planner/verifier mismatch");
  }
  if (expectedPackage !== null && !canonicalBytes(outputs[0].package).equals(canonicalBytes(expectedPackage))) {
    throw new Error("native install persisted package no longer corroborated");
  }
  return { ...outputs[0], package: decodeInstallPackage(outputs[0].package) };
}

function reconcileRootResult({ hint, receipt, store, filesystem }) {
  let journal = store.read();
  assertHintCorrelation(hint, journal);
  if (journal.ownerTransitionDigest !== receipt.ownerJournalDigest) throw new Error("native install root receipt correlation mismatch");
  const snapshotBytes = store.readPlanSnapshot();
  if (snapshotBytes === null) throw new Error("native install root plan snapshot absent");
  const snapshot = parseCanonicalJson(snapshotBytes);
  assertExactKeys(snapshot, ["contract", "observedAt", "package", "planDigest", "requestDigest", "sourceManifestDigest", "version"]);
  if (snapshot.contract !== "settleora_semantic_recovery_native_install_root_plan_snapshot" || snapshot.version !== 1
      || snapshot.observedAt !== journal.observedAt || snapshot.planDigest !== journal.result?.planDigest
      || snapshot.requestDigest !== journal.requestDigest) throw new Error("native install root plan snapshot identity mismatch");
  const verified = runIndependentRootReaders(hint, snapshot.observedAt, snapshot.package);
  if (journal.result?.planDigest !== verified.planDigest) throw new Error("native install root journal plan identity mismatch");
  const advance = (expectedState, nextState, partial) => {
    journal = transitionNativeInstallJournal({ current: journal, expectedState, nextState, observedAt: new Date().toISOString(), result: journalResult(partial), persist: (value) => persistNativeInstallJournalTransition({ ...value, store }) });
    return journal;
  };
  if (journal.state === "publication_started") advance("publication_started", "publication_ambiguous", { outcome: "ambiguous", reasonCode: "native_install_restart_publication_ambiguous", planDigest: verified.planDigest });
  filesystem.assertNoPublicationResidue(hint.taskCorrelation);
  const readback = verifyDurableInstalledNativeInstall({ installPackage: verified.package, filesystem });
  if (!readback.ok) throw new Error("native install readback-only reconciliation blocked");
  if (journal.state === "publication_ambiguous") advance("publication_ambiguous", "installed_verified", { outcome: "verified", reasonCode: "native_install_restart_readback_verified", requestDigest: verified.requestDigest, sourceManifestDigest: verified.sourceManifestDigest, planDigest: verified.planDigest, installedDigest: readback.installedDigest });
  const completed = completeVerifiedNativeInstallResult({
    journal,
    installPackage: verified.package,
    filesystem,
    completion: { reasonCode: "native_install_readback_completed", requestDigest: verified.requestDigest, sourceManifestDigest: verified.sourceManifestDigest, planDigest: verified.planDigest },
    transition: ({ current, expectedState, nextState, result }) => {
      if (current.journalDigest !== journal.journalDigest) throw new Error("native install reconciliation journal changed");
      return advance(expectedState, nextState, result);
    },
    publishResult: (current) => publishRootResult(hint, current),
  });
  journal = completed.journal;
  return writeResult({ ok: true, reasonCode: "native_install_existing_result_reconciled", correlation: hint.taskCorrelation, sourceCommit: hint.sourceCommit, planDigest: verified.planDigest, installed: true, adopted: false });
}

function liveFilesystem(materializedRoot) {
  const helper = path.join(materializedRoot, nativeInstallRenameNoReplaceHelper);
  return createLiveNativeInstallFilesystem({ renameNoReplace(stage, finalRoot) {
    const child = spawnSync(fixedPython, ["-I", helper, stage, finalRoot], { cwd: "/", env: { HOME: "/root", LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" }, encoding: "utf8", maxBuffer: 64 * 1024, timeout: 30_000 });
    if (child.error || child.signal || child.status !== 0 || child.stdout !== "" || child.stderr !== "") throw new Error("native install rename_noreplace helper blocked");
  } });
}

function createRootGitObjectReader(checkoutRoot, hint) {
  return {
    resolveRepository() {
      const origin = git(checkoutRoot, ["remote", "get-url", "origin"]).toString("utf8").trim();
      const commit = git(checkoutRoot, ["rev-parse", "HEAD^{commit}"]).toString("utf8").trim();
      if (origin !== `https://github.com/${hint.repository}.git`) throw new Error("native install GitHub origin mismatch");
      return { repository: hint.repository, commit, transport: "authenticated_github_https" };
    },
    readObject(oid) {
      const type = git(checkoutRoot, ["cat-file", "-t", oid]).toString("utf8").trim();
      const bytes = git(checkoutRoot, ["cat-file", type, oid]);
      return { oid, type, bytes };
    },
  };
}

function git(checkoutRoot, args) {
  const child = spawnSync(fixedGit, [
    "-c", "core.hooksPath=/dev/null", "-c", "credential.helper=", "-c", "http.followRedirects=false",
    "-c", "transfer.fsckObjects=true", "-C", checkoutRoot, ...args,
  ], {
    cwd: "/",
    env: { HOME: "/root", LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" },
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 30_000,
  });
  if (child.error || child.signal || child.status !== 0 || child.stderr.length !== 0) throw new Error("native install authenticated Git read failed");
  return child.stdout;
}

function authenticatedCheckoutRoot() { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."); }
function assertRootBootstrapBoundary() {
  assertFixedRootRuntime();
  assertRootPrivateCheckout(authenticatedCheckoutRoot());
  if (!process.stdin.isTTY && !realTtyAvailable()) throw new Error("native install real TTY required");
}
function assertRootMaterializedBoundary() {
  assertFixedRootRuntime();
  const root = authenticatedCheckoutRoot();
  assertRootImmutableMaterializedDirectory(root);
  if (!path.basename(root).startsWith("settleora-native-install-root-")) throw new Error("native install materialized root required");
}
function assertMaterializedSourceReaderBoundary() {
  const root = authenticatedCheckoutRoot();
  assertRootImmutableMaterializedDirectory(root);
  const identity = fixedProductionSourceIdentity();
  if (process.getuid?.() !== identity.uid || process.geteuid?.() !== identity.uid
      || process.getgid?.() !== identity.gid || process.getegid?.() !== identity.gid) {
    throw new Error("native install source reader identity invalid");
  }
}
function assertFixedRootRuntime() {
  if (process.getuid?.() !== 0 || process.geteuid?.() !== 0 || process.getgid?.() !== 0 || process.getegid?.() !== 0
      || realpathSync(process.execPath) !== fixedNode) throw new Error("native install fixed root runtime required");
  const info = lstatSync(fixedNode);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || info.gid !== 0 || info.nlink !== 1 || (info.mode & 0o022) !== 0) {
    throw new Error("native install fixed root runtime unsafe");
  }
}
function assertRootPrivateCheckout(root) {
  const info = lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== 0 || info.gid !== 0 || (info.mode & 0o077) !== 0 || realpathSync(root) !== root) {
    throw new Error("native install root-owned private checkout required");
  }
}
function assertRootImmutableMaterializedDirectory(root) {
  const info = lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== 0 || info.gid !== 0 || (info.mode & 0o7777) !== 0o555
      || realpathSync(root) !== root) throw new Error("native install root-owned immutable materialization required");
}
function fixedProductionSourceIdentity() {
  const root = "/workspace/repos/Settleora";
  const info = lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid < 1 || info.gid < 1 || (info.mode & 0o022) !== 0
      || realpathSync(root) !== root) throw new Error("native install fixed production source identity invalid");
  return { uid: info.uid, gid: info.gid };
}
function realTtyAvailable() {
  try { const fd = openSync("/dev/tty", constants.O_RDWR | constants.O_NOFOLLOW); closeSync(fd); return true; } catch { return false; }
}
function assertUnprivilegedOwner() {
  const uid = process.getuid?.();
  if (!Number.isSafeInteger(uid) || uid < 1 || process.geteuid?.() !== uid || process.getgid?.() !== process.getegid?.()) {
    throw new Error("native install owner process identity invalid");
  }
}
function verifyTrustedBootstrapPrerequisite(hint) {
  const info = lstatSync(nativeInstallTrustedBootstrapPath);
  const bytes = readFileSync(nativeInstallTrustedBootstrapPath);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || info.gid !== 0 || info.nlink !== 1
      || (info.mode & 0o7777) !== 0o555 || realpathSync(nativeInstallTrustedBootstrapPath) !== nativeInstallTrustedBootstrapPath
      || gitObjectOid("blob", bytes) !== hint.bootstrapBlob) {
    throw new Error("native install trusted bootstrap prerequisite invalid");
  }
}
function writeSourceAuthorityDocument(root, value) {
  const target = path.join(root, authorityDocumentName);
  const fd = openSync(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o444);
  try { writeFileSync(fd, canonicalBytes(value)); fsyncSync(fd); } finally { closeSync(fd); }
  chownSync(target, 0, 0);
  chmodSync(target, 0o444);
  const directory = openSync(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
function loadMaterializedSource(hint) {
  const root = authenticatedCheckoutRoot();
  const authority = parseCanonicalJson(readFileSync(path.join(root, authorityDocumentName)));
  assertExactKeys(authority, ["checkoutRoot", "manifest"]);
  const supportFiles = authority.manifest.support.map((descriptor) => ({ ...descriptor, bytes: readFileSync(path.join(root, descriptor.source)) }));
  const authenticatedSource = { manifest: authority.manifest, supportFiles };
  if (!verifyAuthenticatedNativeInstallSource(authenticatedSource).ok
      || authority.manifest.repository.toLowerCase() !== hint.repository.toLowerCase()
      || authority.manifest.sourceCommit !== hint.sourceCommit || authority.manifest.bootstrapBlob !== hint.bootstrapBlob
      || authority.manifest.taskCorrelation !== hint.taskCorrelation) {
    throw new Error("native install materialized authority invalid");
  }
  reverifyMaterializedNativeInstallClosure({
    authenticatedSource,
    materializedReader(source) {
      const target = path.join(root, source);
      const info = lstatSync(target);
      return { source, type: info.isFile() ? "file" : "other", symlink: info.isSymbolicLink(), uid: info.uid, gid: info.gid, mode: info.mode & 0o7777, nlink: info.nlink, realpath: path.relative(root, realpathSync(target)).split(path.sep).join("/"), bytes: readFileSync(target) };
    },
  });
  return authenticatedSource;
}
function journalResult(value) {
  return {
    outcome: value.outcome,
    reasonCode: value.reasonCode,
    requestDigest: value.requestDigest ?? null,
    sourceManifestDigest: value.sourceManifestDigest ?? null,
    planDigest: value.planDigest ?? null,
    installedDigest: value.installedDigest ?? null,
    process: value.process ?? null,
  };
}
function operationIdentity(hint) { return nativeInstallOperationIdentity(hint); }
function assertHintCorrelation(hint, journal) {
  if (journal.correlation !== hint.taskCorrelation || journal.repository.toLowerCase() !== hint.repository.toLowerCase()
      || journal.sourceCommit !== hint.sourceCommit || journal.operationId !== operationIdentity(hint)) {
    throw new Error("native install journal hint mismatch");
  }
}
function loadRootReceipt(hint) {
  const operationId = operationIdentity(hint);
  const receiptPath = path.join(nativeInstallRootJournalRoot, `${operationId}.receipt.json`);
  const ownerSnapshotPath = path.join(nativeInstallRootJournalRoot, `${operationId}.owner.json`);
  for (const target of [receiptPath, ownerSnapshotPath]) {
    const info = lstatSync(target);
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || info.gid !== 0 || info.nlink !== 1
        || (info.mode & 0o7777) !== 0o400 || realpathSync(target) !== target || info.size < 1 || info.size > 1024 * 1024) {
      throw new Error("native install root receipt artifact unsafe");
    }
  }
  const receipt = parseCanonicalJson(readFileSync(receiptPath));
  assertExactKeys(receipt, [
    "bootstrapBlob", "contract", "observedAt", "operationId", "ownerJournalDigest", "ownerJournalSha256", "repository",
    "sourceCommit", "taskCorrelation", "version",
  ]);
  const ownerBytes = readFileSync(ownerSnapshotPath);
  const ownerJournal = parseCanonicalJson(ownerBytes);
  validateNativeInstallJournal(ownerJournal);
  if (receipt.contract !== "settleora_semantic_recovery_native_install_root_receipt" || receipt.version !== 1
      || receipt.repository.toLowerCase() !== hint.repository.toLowerCase() || receipt.sourceCommit !== hint.sourceCommit
      || receipt.bootstrapBlob !== hint.bootstrapBlob || receipt.taskCorrelation !== hint.taskCorrelation
      || receipt.operationId !== operationId || receipt.ownerJournalDigest !== ownerJournal.journalDigest
      || receipt.ownerJournalSha256 !== sha256(ownerBytes) || ownerJournal.state !== "sudo_started"
      || ownerJournal.sudoAttemptCount !== 1 || ownerJournal.operationId !== operationId
      || ownerJournal.correlation !== hint.taskCorrelation || ownerJournal.sourceCommit !== hint.sourceCommit) {
    throw new Error("native install root receipt correlation invalid");
  }
  return receipt;
}
function publishRootResult(hint, journal) {
  validateNativeInstallJournal(journal);
  if (!["publication_ambiguous", "installed_verified", "adopted_verified", "blocked", "completed"].includes(journal.state)) {
    throw new Error("native install root result state invalid");
  }
  return publishFixedNativeInstallRootResult({
    contract: "settleora_semantic_recovery_native_install_root_result",
    version: 1,
    correlation: hint.taskCorrelation,
    repository: hint.repository,
    sourceCommit: hint.sourceCommit,
    operationId: journal.operationId,
    state: journal.state,
    outcome: journal.result?.outcome || "blocked",
    reasonCode: journal.result?.reasonCode || "native_install_root_operation_blocked",
    planDigest: journal.result?.planDigest || null,
    installedDigest: journal.result?.installedDigest || null,
    rootJournalDigest: journal.journalDigest,
  });
}
async function readCanonicalInput(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) { size += chunk.length; if (size > maximumInputBytes) throw new Error("native install input too large"); chunks.push(chunk); }
  return parseCanonicalJson(Buffer.concat(chunks));
}
function parseCanonicalJson(bytes) {
  const text = Buffer.from(bytes).toString("utf8");
  if (!Buffer.from(text).equals(Buffer.from(bytes))) throw new Error("native install input encoding invalid");
  let value;
  try { value = JSON.parse(text); } catch { throw new Error("native install input JSON invalid"); }
  if (!canonicalBytes(value).equals(Buffer.from(bytes))) throw new Error("native install input must be canonical JSON");
  return value;
}
function writeResult(value) {
  if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(canonicalBytes(value));
  return value;
}
function encodeInstallPackage(value) {
  return { plan: value.plan, artifacts: value.artifacts.map(({ bytes, ...artifact }) => ({ ...artifact, bytesBase64: Buffer.from(bytes).toString("base64") })) };
}
function decodeInstallPackage(value) {
  assertExactKeys(value, ["artifacts", "plan"]);
  if (!Array.isArray(value.artifacts)) throw new Error("native install encoded package invalid");
  return { plan: value.plan, artifacts: value.artifacts.map(({ bytesBase64, ...artifact }) => ({ ...artifact, bytes: decodeBase64(bytesBase64) })) };
}
function decodeBase64(value) {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) throw new Error("native install package encoding invalid");
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new Error("native install package encoding noncanonical");
  return bytes;
}
function fsyncPath(target, directory = false) {
  const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW | (directory ? constants.O_DIRECTORY : 0));
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function canonicalBytes(value) { return Buffer.from(`${JSON.stringify(canonicalize(value))}\n`); }
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function assertExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) throw new Error("native install closed schema invalid");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`native installation blocked: ${error.message}\n`);
    process.exitCode = 1;
  });
}
