import { createHash, generateKeyPairSync } from "node:crypto";
import {
  chmodSync, closeSync, constants, fchmodSync, fchownSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync,
  readFileSync, readSync, readdirSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, unlinkSync, writeFileSync,
  mkdtempSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const trustedSshBoundaryContract = "settleora_trusted_ssh_entry_boundary_v1";
export const trustedSshPackageContract = "settleora_trusted_ssh_handoff_package_v1";
export const trustedSshPaths = Object.freeze({
  account: "settleora_handoff",
  authorizedKeys: "/etc/settleora/trusted-ssh/authorized_keys",
  closureManifest: "/etc/settleora/trusted-ssh/artifact-manifest.json",
  dispatcherModule: "/opt/settleora/trusted-ssh/lib/settleora-trusted-ssh-dispatcher.mjs",
  fdExec: "/opt/settleora/trusted-ssh/bin/settleora-trusted-ssh-fd-exec",
  handoffRoot: "/var/lib/settleora/trusted-ssh/handoffs",
  home: "/var/lib/settleora/trusted-ssh/home",
  operationClaims: "/var/lib/settleora/trusted-ssh/operation-claims",
  operationClaimsConsumed: "/var/lib/settleora/trusted-ssh/operation-claims/consumed",
  operationClaimsEntered: "/var/lib/settleora/trusted-ssh/operation-claims/entered",
  operationClaimsPending: "/var/lib/settleora/trusted-ssh/operation-claims/pending",
  pamPreauth: "/opt/settleora/trusted-ssh/bin/settleora-sudo-preauth",
  pamPreauthModule: "/opt/settleora/trusted-ssh/lib/settleora-trusted-ssh-pam-preauth.mjs",
  pamService: "/etc/pam.d/settleora-handoff-sudo",
  loginShell: "/opt/settleora/trusted-ssh/bin/settleora-trusted-ssh-entry",
  node: "/usr/bin/node",
  rootGate: "/opt/settleora/trusted-ssh/bin/settleora-root-gate",
  rootGateModule: "/opt/settleora/trusted-ssh/lib/settleora-trusted-ssh-root-gate.mjs",
  supportLibrary: "/opt/settleora/trusted-ssh/lib/trusted-ssh-boundary.mjs",
  rootBootstrap: "/usr/bin/node",
  rootBootstrapModule: "/opt/settleora/trusted-ssh/lib/settleora-authenticated-root-bootstrap.mjs",
  sshdDropIn: "/etc/ssh/sshd_config.d/90-settleora-trusted-ssh.conf",
  sudoers: "/etc/sudoers.d/settleora-trusted-ssh",
});

const digestPattern = /^[a-f0-9]{64}$/u;
const oidPattern = /^[a-f0-9]{40}$/u;
const keyPattern = /^[0-9]{8}-[0-9]{4}-[a-f0-9]{16}$/u;
const fingerprintPattern = /^SHA256:[A-Za-z0-9+/]{43}$/u;
const allowedKeyAlgorithms = Object.freeze(["sk-ssh-ed25519@openssh.com", "ssh-ed25519"]);
const livePrefixes = Object.freeze(["/etc", "/opt", "/usr/local", "/var/lib", "/run", "/sys", "/proc"]);

export function parseTrustedSshCommand(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 128 || !/^[\x20-\x7e]+$/u.test(value)) {
    throw new Error("trusted_ssh_command_invalid");
  }
  const parts = value.split(" ");
  if (parts.length !== 4 || parts.some((part) => part.length === 0)
      || parts[0] !== "settleora-handoff-v1" || !["preflight", "execute"].includes(parts[1])
      || !keyPattern.test(parts[2]) || !digestPattern.test(parts[3])) {
    throw new Error("trusted_ssh_command_invalid");
  }
  return Object.freeze({ mode: parts[1], handoffKey: parts[2], operationId: parts[3] });
}

export function reserveTrustedSshOperation({
  claimRoot = trustedSshPaths.operationClaims, handoffKey, operationId,
  expectedRootUid = 0, expectedAccountGid = process.getgid?.(),
} = {}) {
  if (!keyPattern.test(String(handoffKey || "")) || !digestPattern.test(String(operationId || ""))) {
    throw new Error("trusted_ssh_claim_identity_invalid");
  }
  assertOperationDirectory(claimRoot, expectedRootUid, expectedAccountGid, 0o710);
  const pending = path.join(claimRoot, "pending");
  assertOperationDirectory(pending, expectedRootUid, expectedAccountGid, 0o1730);
  const claim = { contract: "settleora_trusted_ssh_operation_claim_v1", handoffKey, operationId, version: 1 };
  const target = path.join(pending, `${operationId}.json`);
  writeExactFile(target, `${canonicalJson(claim)}\n`, 0o440);
  fsyncDirectory(pending);
  return Object.freeze({ path: target, reasonCode: "trusted_ssh_operation_reserved", sha256: sha256(`${canonicalJson(claim)}\n`) });
}

export function consumeTrustedSshOperation({
  claimRoot = trustedSshPaths.operationClaims, handoffKey, operationId, expectedClaimUid, expectedClaimGid,
  expectedRootUid = 0, expectedRootGid = 0,
} = {}) {
  if (!Number.isSafeInteger(expectedClaimUid) || expectedClaimUid < 1 || !Number.isSafeInteger(expectedClaimGid)
      || expectedClaimGid < 1 || !keyPattern.test(String(handoffKey || "")) || !digestPattern.test(String(operationId || ""))) {
    throw new Error("trusted_ssh_claim_consumer_identity_invalid");
  }
  assertOperationDirectory(claimRoot, expectedRootUid, expectedClaimGid, 0o710);
  const pending = path.join(claimRoot, "pending");
  const consumed = path.join(claimRoot, "consumed");
  assertOperationDirectory(pending, expectedRootUid, expectedClaimGid, 0o1730);
  assertOperationDirectory(consumed, expectedRootUid, expectedRootGid, 0o700);
  const pendingPath = path.join(pending, `${operationId}.json`);
  const fd = openSync(pendingPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.uid !== expectedClaimUid || before.gid !== expectedClaimGid
        || before.nlink !== 1 || (before.mode & 0o777) !== 0o440) throw new Error("trusted_ssh_claim_metadata_invalid");
    bytes = readFileSync(fd);
    const claim = parseCanonicalJson(bytes);
    assertExactKeys(claim, ["contract", "handoffKey", "operationId", "version"]);
    if (claim.contract !== "settleora_trusted_ssh_operation_claim_v1" || claim.version !== 1
        || claim.handoffKey !== handoffKey || claim.operationId !== operationId) throw new Error("trusted_ssh_claim_invalid");
    fchmodSync(fd, 0o400);
    fchownSync(fd, expectedRootUid, expectedRootGid);
    const held = fstatSync(fd);
    if (held.uid !== expectedRootUid || held.gid !== expectedRootGid || (held.mode & 0o777) !== 0o400) {
      throw new Error("trusted_ssh_claim_takeover_invalid");
    }
  } finally { closeSync(fd); }
  const receipt = {
    claimSha256: sha256(bytes), contract: "settleora_trusted_ssh_operation_consumed_v1",
    handoffKey, operationId, sudoAttemptCount: 1, version: 1,
  };
  const receiptPath = path.join(consumed, `${operationId}.json`);
  writeExactFile(receiptPath, `${canonicalJson(receipt)}\n`, 0o400);
  fsyncDirectory(consumed);
  return Object.freeze({ path: receiptPath, reasonCode: "trusted_ssh_operation_consumed", sudoAttemptCount: 1 });
}

export function validateTrustedSshConsumedReceipt({
  claimRoot = trustedSshPaths.operationClaims, handoffKey, operationId,
  expectedRootUid = 0, expectedRootGid = 0,
} = {}) {
  if (!keyPattern.test(String(handoffKey || "")) || !digestPattern.test(String(operationId || ""))) {
    throw new Error("trusted_ssh_receipt_identity_invalid");
  }
  const consumed = path.join(claimRoot, "consumed");
  assertOperationDirectory(consumed, expectedRootUid, expectedRootGid, 0o700);
  const receipt = parseCanonicalJson(readBoundedRegular(
    path.join(consumed, `${operationId}.json`), expectedRootUid, 4096, 0o400, expectedRootGid,
  ));
  assertExactKeys(receipt, ["claimSha256", "contract", "handoffKey", "operationId", "sudoAttemptCount", "version"]);
  if (receipt.contract !== "settleora_trusted_ssh_operation_consumed_v1" || receipt.version !== 1
      || receipt.handoffKey !== handoffKey || receipt.operationId !== operationId
      || receipt.sudoAttemptCount !== 1 || !digestPattern.test(receipt.claimSha256)) {
    throw new Error("trusted_ssh_receipt_invalid");
  }
  return Object.freeze({ reasonCode: "trusted_ssh_operation_receipt_verified", sudoAttemptCount: 1 });
}

export function enterTrustedSshRootGate({
  claimRoot = trustedSshPaths.operationClaims, handoffKey, operationId,
  expectedRootUid = 0, expectedRootGid = 0,
} = {}) {
  validateTrustedSshConsumedReceipt({ claimRoot, handoffKey, operationId, expectedRootUid, expectedRootGid });
  const consumed = path.join(claimRoot, "consumed");
  const entered = path.join(claimRoot, "entered");
  assertOperationDirectory(entered, expectedRootUid, expectedRootGid, 0o700);
  const source = path.join(consumed, `${operationId}.json`);
  const target = path.join(entered, `${operationId}.json`);
  linkSync(source, target);
  unlinkSync(source);
  fsyncDirectory(consumed);
  fsyncDirectory(entered);
  return validateTrustedSshEnteredReceipt({ claimRoot, handoffKey, operationId, expectedRootUid, expectedRootGid });
}

export function validateTrustedSshEnteredReceipt({
  claimRoot = trustedSshPaths.operationClaims, handoffKey, operationId,
  expectedRootUid = 0, expectedRootGid = 0,
} = {}) {
  if (!keyPattern.test(String(handoffKey || "")) || !digestPattern.test(String(operationId || ""))) {
    throw new Error("trusted_ssh_entered_receipt_identity_invalid");
  }
  const entered = path.join(claimRoot, "entered");
  assertOperationDirectory(entered, expectedRootUid, expectedRootGid, 0o700);
  const receipt = parseCanonicalJson(readBoundedRegular(
    path.join(entered, `${operationId}.json`), expectedRootUid, 4096, 0o400, expectedRootGid,
  ));
  assertExactKeys(receipt, ["claimSha256", "contract", "handoffKey", "operationId", "sudoAttemptCount", "version"]);
  if (receipt.contract !== "settleora_trusted_ssh_operation_consumed_v1" || receipt.version !== 1
      || receipt.handoffKey !== handoffKey || receipt.operationId !== operationId
      || receipt.sudoAttemptCount !== 1 || !digestPattern.test(receipt.claimSha256)) {
    throw new Error("trusted_ssh_entered_receipt_invalid");
  }
  return Object.freeze({ reasonCode: "trusted_ssh_root_gate_entered", sudoAttemptCount: 1 });
}

export function renderTrustedSshFixtures({ operatorKeyFingerprint }) {
  if (!fingerprintPattern.test(String(operatorKeyFingerprint || ""))) {
    throw new Error("trusted_ssh_operator_fingerprint_invalid");
  }
  const sshd = [
    "# Global defense-in-depth; OpenSSH 9.6 does not permit this keyword inside Match.",
    "PermitUserEnvironment no",
    `Match User ${trustedSshPaths.account}`,
    "    AuthenticationMethods publickey",
    "    PubkeyAuthentication yes",
    `    PubkeyAcceptedAlgorithms ${allowedKeyAlgorithms.join(",")}`,
    "    PasswordAuthentication no",
    "    KbdInteractiveAuthentication no",
    `    AuthorizedKeysFile ${trustedSshPaths.authorizedKeys}`,
    "    AuthorizedKeysCommand none",
    "    TrustedUserCAKeys none",
    "    AuthorizedPrincipalsFile none",
    "    AuthorizedPrincipalsCommand none",
    "    PermitUserRC no",
    "    DisableForwarding yes",
    "    AllowAgentForwarding no",
    "    AllowTcpForwarding no",
    "    X11Forwarding no",
    "    PermitTunnel no",
    "    GatewayPorts no",
    "    PermitTTY yes",
    "    ForceCommand settleora-handoff-v1",
    "Match all",
    "",
  ].join("\n");
  const sudoers = [
    `Defaults:${trustedSshPaths.account} env_reset,use_pty,!set_home,!preserve_groups,!rootpw,!targetpw,!runaspw,timestamp_timeout=0,passwd_tries=1,pam_service=settleora-handoff-sudo`,
    `Defaults:${trustedSshPaths.account} secure_path=/usr/sbin:/usr/bin:/sbin:/bin`,
    `${trustedSshPaths.account} ALL=(root) PASSWD: ${trustedSshPaths.rootGate} ""`,
    "",
  ].join("\n");
  const authorizedKeys = [
    `# required-fingerprint ${operatorKeyFingerprint}`,
    "restrict,pty __OPERATOR_PUBLIC_KEY_ALGORITHM__ __OPERATOR_PUBLIC_KEY_BASE64__ settleora-trusted-ssh-operator",
    "",
  ].join("\n");
  const pam = [
    `auth requisite pam_exec.so quiet seteuid ${trustedSshPaths.pamPreauth}`,
    "auth include common-auth",
    "account include common-account",
    "session include common-session-noninteractive",
    "",
  ].join("\n");
  const sudoAuthorityObservation = `${canonicalJson({
    account: trustedSshPaths.account,
    accountGroups: [{ name: trustedSshPaths.account, source: "nss-primary-group" }],
    defaults: [
      ["env_reset", true], ["use_pty", true], ["set_home", false], ["preserve_groups", false],
      ["rootpw", false], ["targetpw", false], ["runaspw", false], ["timestamp_timeout", 0],
      ["passwd_tries", 1], ["pam_service", "settleora-handoff-sudo"],
      ["secure_path", "/usr/sbin:/usr/bin:/sbin:/bin"],
    ].map(([name, value]) => ({ name, origin: { kind: "user", selector: trustedSshPaths.account, source: trustedSshPaths.sudoers }, value })),
    rules: [{
      arguments: [], command: trustedSshPaths.rootGate, host: "ALL",
      origin: { kind: "user", selector: trustedSshPaths.account, source: trustedSshPaths.sudoers },
      runAs: ["root"], tags: ["PASSWD"],
    }],
    sourceClosure: {
      allIncludesResolved: true, allMatchingGroupsResolved: true,
      files: ["/etc/sudoers", trustedSshPaths.sudoers], roots: ["/etc/sudoers"], sudoLlComplete: true,
    },
    version: 1,
  })}\n`;
  const effectiveSudoPolicy = `${canonicalJson(deriveEffectiveSudoPolicy(sudoAuthorityObservation))}\n`;
  return Object.freeze({
    authorizedKeys,
    group: `${trustedSshPaths.account}:x:__DEDICATED_GID__:\n`,
    passwd: `${trustedSshPaths.account}:x:__DEDICATED_UID__:__DEDICATED_GID__:Settleora trusted SSH handoff:${trustedSshPaths.home}:${trustedSshPaths.loginShell}\n`,
    effectiveSudoPolicy,
    pam,
    shadow: `${trustedSshPaths.account}:__MANUAL_PASSWORD_HASH_REQUIRED__:0:0:99999:7:::\n`,
    shells: `${trustedSshPaths.loginShell}\n`,
    sshd,
    sudoers,
    sudoAuthorityObservation,
  });
}

export function createTrustedSshInstallationPlan({
  outputRoot, sourceCommit, sourceTree, nativeShell, dispatcherModule, fdExec, pamPreauth, pamPreauthModule,
  rootGate, rootGateModule, rootBootstrapModule, supportLibrary,
  operatorKeyFingerprint, generatedAt, repositoryRoot = null, sourceIdentityReader = readGitSourceIdentity,
  sourceClosureAuthenticator = authenticatePlanSourceClosure,
  faultAt = null,
} = {}) {
  assertPrivateOutputRoot(outputRoot);
  if (!oidPattern.test(String(sourceCommit || "")) || !oidPattern.test(String(sourceTree || ""))
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(String(generatedAt || ""))) {
    throw new Error("trusted_ssh_plan_identity_invalid");
  }
  const sourceIdentity = sourceIdentityReader(repositoryRoot);
  if (sourceIdentity.commit !== sourceCommit || sourceIdentity.tree !== sourceTree) {
    throw new Error("trusted_ssh_plan_source_identity_invalid");
  }
  const sourceClosureBinding = sourceClosureAuthenticator({
    dispatcherModule, fdExec, nativeShell, outputRoot, pamPreauth, pamPreauthModule, repositoryRoot,
    rootGate, rootGateModule, rootBootstrapModule,
    sourceCommit, sourceTree, supportLibrary,
  });
  const inputSpecs = [
    ["settleora-trusted-ssh-entry", nativeShell, "0555", trustedSshPaths.loginShell],
    ["settleora-trusted-ssh-dispatcher.mjs", dispatcherModule, "0444", trustedSshPaths.dispatcherModule],
    ["settleora-trusted-ssh-fd-exec", fdExec, "0555", trustedSshPaths.fdExec],
    ["settleora-sudo-preauth", pamPreauth, "0555", trustedSshPaths.pamPreauth],
    ["settleora-trusted-ssh-pam-preauth.mjs", pamPreauthModule, "0444", trustedSshPaths.pamPreauthModule],
    ["settleora-root-gate", rootGate, "0555", trustedSshPaths.rootGate],
    ["settleora-trusted-ssh-root-gate.mjs", rootGateModule, "0444", trustedSshPaths.rootGateModule],
    ["settleora-authenticated-root-bootstrap.mjs", rootBootstrapModule, "0444", trustedSshPaths.rootBootstrapModule],
    ["trusted-ssh-boundary.mjs", supportLibrary, "0444", trustedSshPaths.supportLibrary],
  ];
  const inputs = inputSpecs.map(([name, source, mode, installedPath]) => {
    const bytes = sourceClosureBinding?.artifactBytes?.[name];
    if (bytes) return authenticatedArtifactRecord({ bytes, installedPath, mode, name, source: `git:${sourceCommit}:${name}` });
    return authenticateInputArtifact({ name, source, mode, installedPath });
  });
  const sourceIdentityAfterCapture = sourceIdentityReader(repositoryRoot);
  if (sourceIdentityAfterCapture.commit !== sourceCommit || sourceIdentityAfterCapture.tree !== sourceTree) {
    throw new Error("trusted_ssh_plan_source_identity_changed");
  }
  const fixtures = renderTrustedSshFixtures({ operatorKeyFingerprint });
  const finalRoot = path.join(outputRoot, "trusted-ssh-boundary-plan-v1");
  const stageRoot = path.join(outputRoot, ".trusted-ssh-boundary-plan-v1.incoming");
  if (exists(finalRoot) || exists(stageRoot)) throw new Error("trusted_ssh_plan_destination_exists");
  mkdirSync(stageRoot, { mode: 0o700 });
  try {
    mkdirSync(path.join(stageRoot, "artifacts"), { mode: 0o700 });
    mkdirSync(path.join(stageRoot, "fixtures"), { mode: 0o700 });
    for (const artifact of inputs) {
      const target = path.join(stageRoot, "artifacts", artifact.name);
      writeExactFile(target, artifact.bytes, Number.parseInt(artifact.mode, 8));
    }
    if (faultAt === "after_artifacts") throw new Error("trusted_ssh_plan_fault_injected");
    const fixtureEntries = Object.entries({
      "authorized_keys.template": fixtures.authorizedKeys,
      "effective-sudo-policy.json": fixtures.effectiveSudoPolicy,
      "group.template": fixtures.group,
      "passwd.template": fixtures.passwd,
      "pam-service": fixtures.pam,
      "shadow.template": fixtures.shadow,
      "shells.append": fixtures.shells,
      "sshd-match.conf": fixtures.sshd,
      "sudo-authority-observation.json": fixtures.sudoAuthorityObservation,
      "sudoers": fixtures.sudoers,
    }).sort(([left], [right]) => left.localeCompare(right));
    for (const [name, bytes] of fixtureEntries) writePrivate(path.join(stageRoot, "fixtures", name), bytes);
    const fixtureManifest = fixtureEntries.map(([name, bytes]) => ({
      byteCount: Buffer.byteLength(bytes), mode: "0600", name, sha256: sha256(bytes),
    }));
    const artifactManifest = inputs.map(({ bytes: _bytes, source: _source, ...artifact }) => artifact);
    const planCore = {
      account: {
        gidPolicy: "owner-selects-unused-system-gid-at-manual-gate",
        home: trustedSshPaths.home,
        loginShell: trustedSshPaths.loginShell,
        name: trustedSshPaths.account,
        password: "manual-sudo-authentication-factor-required-never-stored",
        sshKey: { algorithms: allowedKeyAlgorithms, fingerprint: operatorKeyFingerprint },
        uidPolicy: "owner-selects-unused-system-uid-at-manual-gate",
      },
      artifacts: artifactManifest,
      authorityPaths: [
        { group: "root", mode: "0755", owner: "root", path: "/opt/settleora/trusted-ssh" },
        { group: "settleora_handoff", mode: "0710", owner: "root", path: trustedSshPaths.operationClaims },
        { group: "settleora_handoff", mode: "1730", owner: "root", path: trustedSshPaths.operationClaimsPending },
        { group: "root", mode: "0700", owner: "root", path: trustedSshPaths.operationClaimsConsumed },
        { group: "root", mode: "0700", owner: "root", path: trustedSshPaths.operationClaimsEntered },
        { group: "settleora_handoff", mode: "0750", owner: "root", path: trustedSshPaths.handoffRoot },
        { group: "root", mode: "0755", owner: "root", path: path.dirname(trustedSshPaths.authorizedKeys) },
      ],
      atomicInstallOrder: [
        "verify-owner-decisions-and-backup-current-files",
        "install-root-owned-artifact-closure-to-temporary-sibling-paths",
        "install-root-owned-artifact-manifest-for-runtime-bootstrap-verification",
        "verify-static-shell-and-all-digests",
        "realize-one-restricted-operator-key-and-verify-its-bound-fingerprint",
        "publish-dedicated-pam-service-authorized-key-and-sudoers-files",
        "append-login-shell-after-verification",
        "create-locked-dedicated-account-then-set-fixed-login-shell",
        "provision-one-operator-key-and-separate-sudo-password-manually",
        "publish-sshd-match-drop-in",
        "run-visudo-and-sshd-T-before-any-reload",
        "prove-complete-effective-sudo-policy-has-one-passwd-gate-and-no-exempt-or-group-route",
        "keep-existing-admin-session-open-and-test-second-session",
        "manual-owner-decision-before-reload",
      ],
      boundary: trustedSshBoundaryContract,
      fixtures: fixtureManifest,
      generatedAt,
      healthChecks: [
        "native-static-identity-and-closure-digests-match",
        "realized-authorized-key-options-algorithm-and-fingerprint-match",
        "effective-dedicated-user-config-is-key-only-and-forwarding-disabled",
        "preflight-is-non-mutating",
        "execute-has-pty-and-exactly-one-password-requiring-sudo-gate",
        "pam-preauth-consumes-one-shot-before-the-only-password-prompt-and-root-gate-enters-once",
        "existing-tommytang213-session-and-login-shell-remain-unchanged",
      ],
      manualDecisions: [
        "dedicated UID and GID",
        "one operator public key and exact SHA256 fingerprint",
        "dedicated account sudo password or separately approved authentication factor",
        "dedicated PAM pre-auth service installation and rollback approval",
        "maintenance window, console recovery path, and final sshd reload authorization",
      ],
      proposedPaths: trustedSshPaths,
      rollbackOrder: [
        "disable-new-key-or-Match-block-with-existing-admin-session",
        "validate-rollback-sshd-config-before-reload",
        "reload-only-after-owner-authorization",
        "restore-previous-sshd-drop-in-authorized-keys-sudoers-pam-service-and-shells",
        "lock-dedicated-account-without-changing-existing-developer-account",
        "remove-installed-closure-only-after-no-active-boundary-sessions",
        "retain-bounded-audit-and-installation-evidence",
      ],
      source: { commit: sourceCommit, repository: "tommytang213/Settleora", tree: sourceTree },
      sshdValidation: [
        `/usr/sbin/sshd -t -f ${trustedSshPaths.sshdDropIn}`,
        `/usr/sbin/sshd -T -C user=${trustedSshPaths.account},host=localhost,addr=127.0.0.1`,
      ],
      sudoValidation: [
        `/usr/bin/sudo -ll -U ${trustedSshPaths.account}`,
        `/usr/bin/getent group ${trustedSshPaths.account}`,
        "normalize-complete-sudo-source-provenance-groups-password-owner-timestamp-pam-and-rules-to-effective-sudo-policy-v1",
      ],
      sudo: { attempts: 1, command: `${trustedSshPaths.rootGate} (no arguments)`, requiresAuthentication: true },
      version: 1,
    };
    const plan = { ...planCore, planDigest: sha256(canonicalJson(planCore)) };
    writePrivate(path.join(stageRoot, "artifact-manifest.json"), `${canonicalJson(artifactManifest)}\n`);
    writePrivate(path.join(stageRoot, "fixture-manifest.json"), `${canonicalJson(fixtureManifest)}\n`);
    writePrivate(path.join(stageRoot, "installation-plan.json"), `${canonicalJson(plan)}\n`);
    const markerCore = {
      artifactManifestSha256: sha256(readFileSync(path.join(stageRoot, "artifact-manifest.json"))),
      contract: trustedSshBoundaryContract,
      fixtureManifestSha256: sha256(readFileSync(path.join(stageRoot, "fixture-manifest.json"))),
      planSha256: sha256(readFileSync(path.join(stageRoot, "installation-plan.json"))),
      version: 1,
    };
    fsyncTree(stageRoot);
    if (faultAt === "before_publish") throw new Error("trusted_ssh_plan_fault_injected");
    mkdirSync(finalRoot, { mode: 0o700 });
    fsyncDirectory(outputRoot);
    if (faultAt === "after_publish_reservation") throw new Error("trusted_ssh_plan_fault_injected");
    for (const name of ["artifacts", "fixtures", "artifact-manifest.json", "fixture-manifest.json", "installation-plan.json"]) {
      renameSync(path.join(stageRoot, name), path.join(finalRoot, name));
    }
    rmdirSync(stageRoot);
    if (faultAt === "before_marker") throw new Error("trusted_ssh_plan_fault_injected");
    writePrivate(path.join(finalRoot, "PUBLICATION.json"), `${canonicalJson(markerCore)}\n`);
    fsyncDirectory(finalRoot);
    fsyncDirectory(outputRoot);
    return validateTrustedSshInstallationPlan(finalRoot, {
      expectedGid: process.getgid?.() ?? statSync(finalRoot).gid,
      expectedUid: process.getuid?.() ?? statSync(finalRoot).uid,
    });
  } catch (error) {
    if (exists(stageRoot)) rmSync(stageRoot, { recursive: true, force: false });
    throw error;
  }
}

export function validateTrustedSshInstallationPlan(root, {
  expectedUid = 0, expectedGid = expectedUid, runPlatformTools = false,
} = {}) {
  const canonicalRoot = realpathSync(root);
  if (canonicalRoot !== path.resolve(root) || livePrefixes.some((prefix) => canonicalRoot === prefix || canonicalRoot.startsWith(`${prefix}/`))) {
    throw new Error("trusted_ssh_validation_root_invalid");
  }
  assertPrivatePlanDirectory(canonicalRoot, expectedUid, expectedGid);
  assertPrivatePlanDirectory(path.join(canonicalRoot, "artifacts"), expectedUid, expectedGid);
  assertPrivatePlanDirectory(path.join(canonicalRoot, "fixtures"), expectedUid, expectedGid);
  assertExactNames(canonicalRoot, ["PUBLICATION.json", "artifact-manifest.json", "artifacts", "fixture-manifest.json", "fixtures", "installation-plan.json"]);
  const planBytes = readBoundedRegular(path.join(canonicalRoot, "installation-plan.json"), expectedUid, 4 * 1024 * 1024, 0o600, expectedGid);
  const manifestBytes = readBoundedRegular(path.join(canonicalRoot, "artifact-manifest.json"), expectedUid, 4 * 1024 * 1024, 0o600, expectedGid);
  const fixtureManifestBytes = readBoundedRegular(path.join(canonicalRoot, "fixture-manifest.json"), expectedUid, 4 * 1024 * 1024, 0o600, expectedGid);
  const marker = parseCanonicalJson(readBoundedRegular(path.join(canonicalRoot, "PUBLICATION.json"), expectedUid, 4 * 1024 * 1024, 0o600, expectedGid));
  const plan = parseCanonicalJson(planBytes);
  const artifacts = parseCanonicalJson(manifestBytes);
  const fixtureManifest = parseCanonicalJson(fixtureManifestBytes);
  assertExactKeys(marker, ["artifactManifestSha256", "contract", "fixtureManifestSha256", "planSha256", "version"]);
  if (marker.contract !== trustedSshBoundaryContract || marker.version !== 1
      || marker.planSha256 !== sha256(planBytes) || marker.artifactManifestSha256 !== sha256(manifestBytes)
      || marker.fixtureManifestSha256 !== sha256(fixtureManifestBytes)) {
    throw new Error("trusted_ssh_publication_invalid");
  }
  const { planDigest, ...planCore } = plan;
  const expectedArtifacts = [
    ["settleora-authenticated-root-bootstrap.mjs", trustedSshPaths.rootBootstrapModule, "0444"],
    ["settleora-root-gate", trustedSshPaths.rootGate, "0555"],
    ["settleora-sudo-preauth", trustedSshPaths.pamPreauth, "0555"],
    ["settleora-trusted-ssh-dispatcher.mjs", trustedSshPaths.dispatcherModule, "0444"],
    ["settleora-trusted-ssh-entry", trustedSshPaths.loginShell, "0555"],
    ["settleora-trusted-ssh-fd-exec", trustedSshPaths.fdExec, "0555"],
    ["settleora-trusted-ssh-pam-preauth.mjs", trustedSshPaths.pamPreauthModule, "0444"],
    ["settleora-trusted-ssh-root-gate.mjs", trustedSshPaths.rootGateModule, "0444"],
    ["trusted-ssh-boundary.mjs", trustedSshPaths.supportLibrary, "0444"],
  ];
  if (plan.boundary !== trustedSshBoundaryContract || plan.version !== 1 || planDigest !== sha256(canonicalJson(planCore))
      || canonicalJson(plan.artifacts) !== canonicalJson(artifacts)
      || canonicalJson(plan.fixtures) !== canonicalJson(fixtureManifest) || plan.sudo.attempts !== 1
      || plan.sudo.requiresAuthentication !== true || plan.proposedPaths.loginShell !== trustedSshPaths.loginShell
      || canonicalJson(plan.sudoValidation) !== canonicalJson([
        `/usr/bin/sudo -ll -U ${trustedSshPaths.account}`,
        `/usr/bin/getent group ${trustedSshPaths.account}`,
        "normalize-complete-sudo-source-provenance-groups-password-owner-timestamp-pam-and-rules-to-effective-sudo-policy-v1",
      ])
      || canonicalJson(artifacts.map(({ installedPath, mode, name }) => [name, installedPath, mode]).sort()) !== canonicalJson(expectedArtifacts)
      || plan.source?.repository !== "tommytang213/Settleora" || !oidPattern.test(plan.source?.commit) || !oidPattern.test(plan.source?.tree)
      || canonicalJson(plan.account?.sshKey?.algorithms) !== canonicalJson(allowedKeyAlgorithms)
      || !fingerprintPattern.test(String(plan.account?.sshKey?.fingerprint || ""))
      || canonicalJson(plan.authorityPaths) !== canonicalJson([
        { group: "root", mode: "0755", owner: "root", path: "/opt/settleora/trusted-ssh" },
        { group: "settleora_handoff", mode: "0710", owner: "root", path: trustedSshPaths.operationClaims },
        { group: "settleora_handoff", mode: "1730", owner: "root", path: trustedSshPaths.operationClaimsPending },
        { group: "root", mode: "0700", owner: "root", path: trustedSshPaths.operationClaimsConsumed },
        { group: "root", mode: "0700", owner: "root", path: trustedSshPaths.operationClaimsEntered },
        { group: "settleora_handoff", mode: "0750", owner: "root", path: trustedSshPaths.handoffRoot },
        { group: "root", mode: "0755", owner: "root", path: path.dirname(trustedSshPaths.authorizedKeys) },
      ]) || plan.rollbackOrder.length < 6 || plan.atomicInstallOrder.length < 8) {
    throw new Error("trusted_ssh_plan_invalid");
  }
  for (const artifact of artifacts) {
    const bytes = readBoundedRegular(path.join(canonicalRoot, "artifacts", artifact.name), expectedUid,
      32 * 1024 * 1024, Number.parseInt(artifact.mode, 8), expectedGid);
    if (sha256(bytes) !== artifact.sha256 || bytes.length !== artifact.byteCount) throw new Error("trusted_ssh_artifact_invalid");
  }
  assertExactNames(path.join(canonicalRoot, "artifacts"), artifacts.map((entry) => entry.name));
  assertExactNames(path.join(canonicalRoot, "fixtures"), fixtureManifest.map((entry) => entry.name));
  for (const fixture of fixtureManifest) {
    const bytes = readBoundedRegular(path.join(canonicalRoot, "fixtures", fixture.name), expectedUid,
      4 * 1024 * 1024, 0o600, expectedGid);
    if (bytes.length !== fixture.byteCount || sha256(bytes) !== fixture.sha256 || fixture.mode !== "0600") {
      throw new Error("trusted_ssh_fixture_manifest_invalid");
    }
  }
  validateTrustedSshFixtures(canonicalRoot, {
    operatorKeyFingerprint: plan.account.sshKey.fingerprint, expectedUid, expectedGid,
  });
  const nativeNames = ["settleora-trusted-ssh-entry", "settleora-trusted-ssh-fd-exec", "settleora-root-gate", "settleora-sudo-preauth"];
  if (nativeNames.some((name) => !artifacts.some((entry) => entry.name === name))) throw new Error("trusted_ssh_native_missing");
  const nativeIdentities = Object.fromEntries(nativeNames.map((name) => [name,
    runPlatformTools ? (["settleora-trusted-ssh-entry", "settleora-root-gate", "settleora-sudo-preauth"].includes(name)
      ? validateNativeFreestandingExecutable(path.join(canonicalRoot, "artifacts", name))
      : validateNativeStaticExecutable(path.join(canonicalRoot, "artifacts", name))) : { static: null, inspected: false },
  ]));
  const platformFixtures = runPlatformTools ? validatePlatformFixtureSyntax(canonicalRoot) : { inspected: false };
  return Object.freeze({
    artifactCount: artifacts.length,
    nativeIdentities,
    platformFixtures,
    planDigest,
    reasonCode: "trusted_ssh_boundary_plan_verified",
    root: canonicalRoot,
  });
}

export function validateTrustedSshFixtures(root, {
  operatorKeyFingerprint = null, expectedUid = process.getuid?.() ?? 0,
  expectedGid = process.getgid?.() ?? expectedUid,
} = {}) {
  const fixtureRoot = path.join(root, "fixtures");
  const fixture = (name) => readBoundedRegular(path.join(fixtureRoot, name), expectedUid, 4 * 1024 * 1024, 0o600, expectedGid).toString("utf8");
  const sshd = fixture("sshd-match.conf");
  const key = fixture("authorized_keys.template");
  const sudoers = fixture("sudoers");
  const pam = fixture("pam-service");
  const effectiveSudoPolicy = fixture("effective-sudo-policy.json");
  const sudoAuthorityObservation = fixture("sudo-authority-observation.json");
  const passwd = fixture("passwd.template");
  const group = fixture("group.template");
  const shadow = fixture("shadow.template");
  const shells = fixture("shells.append");
  const expectedFixtures = renderTrustedSshFixtures({ operatorKeyFingerprint: operatorKeyFingerprint || key.split("\n")[0].replace("# required-fingerprint ", "") });
  const exact = {
    "authorized_keys.template": expectedFixtures.authorizedKeys, "effective-sudo-policy.json": expectedFixtures.effectiveSudoPolicy,
    "group.template": expectedFixtures.group,
    "passwd.template": expectedFixtures.passwd, "shadow.template": expectedFixtures.shadow,
    "pam-service": expectedFixtures.pam, "shells.append": expectedFixtures.shells,
    "sshd-match.conf": expectedFixtures.sshd, sudoers: expectedFixtures.sudoers,
    "sudo-authority-observation.json": expectedFixtures.sudoAuthorityObservation,
  };
  for (const [name, bytes] of Object.entries(exact)) if (fixture(name) !== bytes) throw new Error("trusted_ssh_fixture_bytes_invalid");
  for (const required of [
    "AuthenticationMethods publickey", "PasswordAuthentication no", "KbdInteractiveAuthentication no",
    `PubkeyAcceptedAlgorithms ${allowedKeyAlgorithms.join(",")}`,
    `AuthorizedKeysFile ${trustedSshPaths.authorizedKeys}`, "PermitUserEnvironment no", "PermitUserRC no",
    "AuthorizedKeysCommand none", "TrustedUserCAKeys none", "AuthorizedPrincipalsFile none", "AuthorizedPrincipalsCommand none",
    "DisableForwarding yes", "AllowAgentForwarding no", "AllowTcpForwarding no", "X11Forwarding no",
    "PermitTunnel no", "GatewayPorts no", "PermitTTY yes", "ForceCommand settleora-handoff-v1",
  ]) if (!sshd.includes(required)) throw new Error("trusted_ssh_sshd_fixture_invalid");
  const renderedFingerprint = key.split("\n")[0].replace("# required-fingerprint ", "");
  if (!key.includes("restrict,pty ") || !key.includes("__OPERATOR_PUBLIC_KEY_ALGORITHM__ __OPERATOR_PUBLIC_KEY_BASE64__")
      || /PRIVATE KEY/u.test(key) || !fingerprintPattern.test(renderedFingerprint)
      || (operatorKeyFingerprint !== null && renderedFingerprint !== operatorKeyFingerprint)) {
    throw new Error("trusted_ssh_authorized_key_fixture_invalid");
  }
  if (!sudoers.includes(" PASSWD: ") || sudoers.includes("NOPASSWD") || sudoers.includes(" ALL=(ALL) ALL")
      || !sudoers.includes("passwd_tries=1,pam_service=settleora-handoff-sudo")
      || !sudoers.includes(`${trustedSshPaths.rootGate} ""`) || /[*?]/u.test(sudoers)) {
    throw new Error("trusted_ssh_sudoers_fixture_invalid");
  }
  if (pam !== `auth requisite pam_exec.so quiet seteuid ${trustedSshPaths.pamPreauth}\nauth include common-auth\naccount include common-account\nsession include common-session-noninteractive\n`) {
    throw new Error("trusted_ssh_pam_fixture_invalid");
  }
  if (`${canonicalJson(deriveEffectiveSudoPolicy(sudoAuthorityObservation))}\n` !== effectiveSudoPolicy) {
    throw new Error("trusted_ssh_effective_sudo_policy_derivation_invalid");
  }
  validateEffectiveSudoPolicy(effectiveSudoPolicy);
  const fields = passwd.trim().split(":");
  if (fields[0] !== trustedSshPaths.account || fields[5] !== trustedSshPaths.home || fields[6] !== trustedSshPaths.loginShell) {
    throw new Error("trusted_ssh_account_fixture_invalid");
  }
  if (group !== `${trustedSshPaths.account}:x:__DEDICATED_GID__:\n`
      || shadow !== `${trustedSshPaths.account}:__MANUAL_PASSWORD_HASH_REQUIRED__:0:0:99999:7:::\n`
      || shells !== `${trustedSshPaths.loginShell}\n`) {
    throw new Error("trusted_ssh_account_fixture_invalid");
  }
  return Object.freeze({ ok: true, reasonCode: "trusted_ssh_fixtures_verified" });
}

export function validateRealizedAuthorizedKey(file, {
  expectedFingerprint, expectedUid = 0, expectedGid = 0,
  ancestryValidator = assertTrustedDirectoryChain, fingerprintReader = readAuthorizedKeyFingerprint,
} = {}) {
  if (!fingerprintPattern.test(String(expectedFingerprint || ""))) {
    throw new Error("trusted_ssh_operator_fingerprint_invalid");
  }
  ancestryValidator(path.dirname(file), expectedUid);
  const bytes = readBoundedRegular(file, expectedUid, 16 * 1024, 0o400, expectedGid);
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n") || text.slice(0, -1).includes("\n") || text.includes("\r") || /PRIVATE KEY/u.test(text)) {
    throw new Error("trusted_ssh_realized_authorized_key_invalid");
  }
  const match = /^(restrict,pty) (ssh-ed25519|sk-ssh-ed25519@openssh\.com) ([A-Za-z0-9+/]+={0,2}) settleora-trusted-ssh-operator\n$/u.exec(text);
  if (!match || match[3].length > 8 * 1024 || match[3].length % 4 !== 0) {
    throw new Error("trusted_ssh_realized_authorized_key_invalid");
  }
  const observedFingerprint = fingerprintReader(file);
  if (observedFingerprint !== expectedFingerprint) throw new Error("trusted_ssh_authorized_key_fingerprint_mismatch");
  return Object.freeze({
    algorithm: match[2], fingerprint: observedFingerprint, ok: true,
    reasonCode: "trusted_ssh_realized_authorized_key_verified", restrictions: match[1],
  });
}

export function authenticateInstalledBoundaryArtifact({
  file, manifestFile = trustedSshPaths.closureManifest, expectedName,
  expectedInstalledPath = file, expectedUid = 0, expectedGid = 0,
  ancestryValidator = assertTrustedDirectoryChain,
} = {}) {
  if (file !== expectedInstalledPath || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(String(expectedName || ""))) {
    throw new Error("trusted_ssh_installed_artifact_identity_invalid");
  }
  ancestryValidator(path.dirname(manifestFile), expectedUid);
  ancestryValidator(path.dirname(file), expectedUid);
  const manifest = parseCanonicalJson(readBoundedRegular(manifestFile, expectedUid, 4 * 1024 * 1024, 0o400, expectedGid));
  if (!Array.isArray(manifest) || manifest.length < 1 || manifest.length > 32) {
    throw new Error("trusted_ssh_installed_artifact_manifest_invalid");
  }
  const matches = manifest.filter((entry) => entry?.name === expectedName);
  if (matches.length !== 1) throw new Error("trusted_ssh_installed_artifact_manifest_invalid");
  const entry = matches[0];
  assertExactKeys(entry, ["byteCount", "installedPath", "mode", "name", "sha256"]);
  if (entry.installedPath !== expectedInstalledPath || entry.mode !== "0444" || !digestPattern.test(entry.sha256)
      || !Number.isSafeInteger(entry.byteCount) || entry.byteCount < 1 || entry.byteCount > 16 * 1024 * 1024) {
    throw new Error("trusted_ssh_installed_artifact_manifest_invalid");
  }
  const bytes = readBoundedRegular(file, expectedUid, 16 * 1024 * 1024, 0o444, expectedGid);
  if (bytes.length !== entry.byteCount || sha256(bytes) !== entry.sha256) {
    throw new Error("trusted_ssh_installed_artifact_digest_invalid");
  }
  return Object.freeze({ name: expectedName, reasonCode: "trusted_ssh_installed_artifact_verified", sha256: entry.sha256 });
}

export function validateEffectiveSshdOutput(text) {
  const values = new Map(String(text).trim().split("\n").map((line) => {
    const index = line.indexOf(" ");
    return [line.slice(0, index).toLowerCase(), line.slice(index + 1).trim()];
  }));
  const expected = new Map([
    ["authenticationmethods", "publickey"], ["passwordauthentication", "no"],
    ["kbdinteractiveauthentication", "no"], ["pubkeyauthentication", "yes"],
    ["pubkeyacceptedalgorithms", allowedKeyAlgorithms.join(",")],
    ["authorizedkeysfile", trustedSshPaths.authorizedKeys], ["authorizedkeyscommand", "none"], ["permituserenvironment", "no"],
    ["trustedusercakeys", "none"], ["authorizedprincipalsfile", "none"], ["authorizedprincipalscommand", "none"],
    ["permituserrc", "no"], ["disableforwarding", "yes"], ["allowagentforwarding", "no"],
    ["allowtcpforwarding", "no"], ["x11forwarding", "no"], ["permittunnel", "no"],
    ["gatewayports", "no"], ["permittty", "yes"], ["forcecommand", "settleora-handoff-v1"],
  ]);
  for (const [name, value] of expected) if (values.get(name) !== value) throw new Error(`trusted_ssh_effective_${name}_invalid`);
  return Object.freeze({ ok: true, reasonCode: "trusted_ssh_effective_sshd_verified" });
}

export function deriveEffectiveSudoPolicy(text) {
  const observation = parseCanonicalJson(Buffer.from(String(text)));
  assertExactKeys(observation, ["account", "accountGroups", "defaults", "rules", "sourceClosure", "version"]);
  assertExactKeys(observation.sourceClosure, ["allIncludesResolved", "allMatchingGroupsResolved", "files", "roots", "sudoLlComplete"]);
  if (observation.version !== 1 || observation.account !== trustedSshPaths.account
      || canonicalJson(observation.accountGroups) !== canonicalJson([{ name: trustedSshPaths.account, source: "nss-primary-group" }])
      || observation.sourceClosure.allIncludesResolved !== true || observation.sourceClosure.allMatchingGroupsResolved !== true
      || observation.sourceClosure.sudoLlComplete !== true
      || canonicalJson(observation.sourceClosure.roots) !== canonicalJson(["/etc/sudoers"])
      || canonicalJson(observation.sourceClosure.files) !== canonicalJson(["/etc/sudoers", trustedSshPaths.sudoers])) {
    throw new Error("trusted_ssh_sudo_authority_observation_invalid");
  }
  const expectedOrigin = { kind: "user", selector: trustedSshPaths.account, source: trustedSshPaths.sudoers };
  const expectedDefaults = [
    ["env_reset", true], ["use_pty", true], ["set_home", false], ["preserve_groups", false],
    ["rootpw", false], ["targetpw", false], ["runaspw", false], ["timestamp_timeout", 0],
    ["passwd_tries", 1], ["pam_service", "settleora-handoff-sudo"],
    ["secure_path", "/usr/sbin:/usr/bin:/sbin:/bin"],
  ].map(([name, value]) => ({ name, origin: expectedOrigin, value }));
  const expectedObservedRule = {
    arguments: [], command: trustedSshPaths.rootGate, host: "ALL", origin: expectedOrigin, runAs: ["root"], tags: ["PASSWD"],
  };
  if (canonicalJson(observation.defaults) !== canonicalJson(expectedDefaults)
      || canonicalJson(observation.rules) !== canonicalJson([expectedObservedRule])) {
    throw new Error("trusted_ssh_sudo_authority_observation_invalid");
  }
  return Object.freeze({
    account: trustedSshPaths.account, accountGroups: [trustedSshPaths.account], authenticationRequired: true,
    exemptGroup: null, pamService: "settleora-handoff-sudo", passwordOwner: "invoking-user", passwordTries: 1,
    rules: [{ arguments: [], command: trustedSshPaths.rootGate, host: "ALL", runAs: ["root"], tags: ["PASSWD"] }],
    sourceClosure: observation.sourceClosure, timestampTimeout: 0, version: 1,
  });
}

export function validateEffectiveSudoPolicy(text) {
  const policy = parseCanonicalJson(Buffer.from(String(text)));
  assertExactKeys(policy, ["account", "accountGroups", "authenticationRequired", "exemptGroup", "pamService", "passwordOwner", "passwordTries", "rules", "sourceClosure", "timestampTimeout", "version"]);
  const expectedRule = {
    arguments: [], command: trustedSshPaths.rootGate, host: "ALL", runAs: ["root"], tags: ["PASSWD"],
  };
  if (policy.version !== 1 || policy.account !== trustedSshPaths.account
      || canonicalJson(policy.accountGroups) !== canonicalJson([trustedSshPaths.account])
      || policy.authenticationRequired !== true || policy.exemptGroup !== null
      || policy.pamService !== "settleora-handoff-sudo" || policy.passwordOwner !== "invoking-user"
      || policy.passwordTries !== 1 || policy.timestampTimeout !== 0
      || canonicalJson(policy.sourceClosure) !== canonicalJson({
        allIncludesResolved: true, allMatchingGroupsResolved: true,
        files: ["/etc/sudoers", trustedSshPaths.sudoers], roots: ["/etc/sudoers"], sudoLlComplete: true,
      })
      || canonicalJson(policy.rules) !== canonicalJson([expectedRule])) {
    throw new Error("trusted_ssh_effective_sudo_policy_invalid");
  }
  return Object.freeze({ ok: true, reasonCode: "trusted_ssh_effective_sudo_policy_verified" });
}

export function collectTrustedSshInstalledAuthority({
  snapshotRoot, expectedSourceDigests, expectedConverterSha256, sourceCommit, sourceTree, collectedAt,
} = {}) {
  assertPrivateOutputRoot(snapshotRoot);
  if (!oidPattern.test(String(sourceCommit || "")) || !oidPattern.test(String(sourceTree || ""))
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(String(collectedAt || ""))
      || !expectedSourceDigests || typeof expectedSourceDigests !== "object" || Array.isArray(expectedSourceDigests)
      || !digestPattern.test(String(expectedConverterSha256 || ""))) {
    throw new Error("trusted_ssh_installed_authority_identity_invalid");
  }
  const captured = new Map();
  const readSource = (absoluteName) => {
    if (!absoluteName.startsWith("/") || absoluteName.includes("..")) throw new Error("trusted_ssh_installed_authority_path_invalid");
    const relative = absoluteName.slice(1);
    const file = path.join(snapshotRoot, relative);
    if (path.relative(snapshotRoot, file).startsWith("..")) throw new Error("trusted_ssh_installed_authority_path_invalid");
    assertPrivateSnapshotAncestry(snapshotRoot, path.dirname(file));
    const capture = capturePrivateAuthorityFile(file);
    captured.set(absoluteName, capture);
    return capture.bytes.toString("utf8");
  };
  const converterPath = "/usr/bin/cvtsudoers";
  const converterBefore = sha256(readFileSync(converterPath));
  if (converterBefore !== expectedConverterSha256) throw new Error("trusted_ssh_installed_authority_converter_digest_invalid");
  const sudoPolicy = runCvtsudoersJson(collectSudoersClosure("/etc/sudoers", snapshotRoot, readSource));
  if (sha256(readFileSync(converterPath)) !== converterBefore) throw new Error("trusted_ssh_installed_authority_converter_drift");
  const passwd = readSource("/etc/passwd");
  const group = readSource("/etc/group");
  const nsswitch = readSource("/etc/nsswitch.conf");
  const pamFiles = collectPamClosure("settleora-handoff-sudo", readSource);
  const account = parseSnapshotAccount(passwd, group);
  const sources = [...captured].sort(([left], [right]) => left.localeCompare(right)).map(([name, capture]) => ({
    byteCount: capture.bytes.length, gid: capture.gid, mode: capture.mode, nlink: capture.nlink,
    path: name, sha256: sha256(capture.bytes), uid: capture.uid,
  }));
  const actualDigests = Object.fromEntries(sources.map(({ path: name, sha256: digest }) => [name, digest]));
  if (canonicalJson(actualDigests) !== canonicalJson(expectedSourceDigests)) {
    throw new Error("trusted_ssh_installed_authority_source_digest_invalid");
  }
  const normalized = normalizeCollectedSudoPolicy(sudoPolicy, account.groups);
  if (!/^passwd:\s+files\s*$/mu.test(nsswitch) || !/^group:\s+files\s*$/mu.test(nsswitch)) {
    throw new Error("trusted_ssh_installed_authority_nss_invalid");
  }
  if (pamFiles[0]?.path !== trustedSshPaths.pamService
      || pamFiles[0].bytes !== renderTrustedSshFixtures({ operatorKeyFingerprint: syntheticOperatorFingerprint() }).pam) {
    throw new Error("trusted_ssh_installed_authority_pam_invalid");
  }
  return Object.freeze({
    account: trustedSshPaths.account, collectedAt, collector: "settleora_trusted_ssh_installed_authority_v1",
    converter: { path: converterPath, sha256: converterBefore },
    effectiveSudoPolicy: normalized, hostSnapshotDigest: sha256(canonicalJson(sources)),
    pamClosure: pamFiles.map(({ path: name }) => name), source: { commit: sourceCommit, tree: sourceTree }, sources, version: 1,
  });
}

function collectSudoersClosure(name, snapshotRoot, readSource, seen = new Set()) {
  if (seen.has(name)) throw new Error("trusted_ssh_installed_authority_sudo_include_cycle");
  seen.add(name);
  const text = readSource(name);
  const chunks = [];
  for (const line of text.split("\n")) {
    const include = /^\s*[@#]include\s+([^\s]+)\s*$/u.exec(line);
    const includeDir = /^\s*[@#]includedir\s+([^\s]+)\s*$/u.exec(line);
    if (include) chunks.push(collectSudoersClosure(include[1], snapshotRoot, readSource, seen));
    else if (includeDir) {
      const directory = path.join(snapshotRoot, includeDir[1].slice(1));
      const entries = readdirSync(directory).filter((entry) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(entry)).sort();
      if (entries.length > 128) throw new Error("trusted_ssh_installed_authority_sudo_include_invalid");
      for (const entry of entries) chunks.push(collectSudoersClosure(`${includeDir[1]}/${entry}`, snapshotRoot, readSource, seen));
    } else chunks.push(line);
  }
  return chunks.join("\n");
}

function collectPamClosure(service, readSource, seen = new Set()) {
  const name = `/etc/pam.d/${service}`;
  if (seen.has(name)) return [];
  seen.add(name);
  const bytes = readSource(name);
  const result = [{ bytes, path: name }];
  for (const line of bytes.split("\n")) {
    const include = /^\s*(?:(?:auth|account|password|session)\s+(?:include|substack)|@include)\s+([A-Za-z0-9_-]+)\s*$/u.exec(line);
    if (include) result.push(...collectPamClosure(include[1], readSource, seen));
  }
  return result;
}

function parseSnapshotAccount(passwd, group) {
  const rows = passwd.trim().split("\n").filter((line) => line.split(":")[0] === trustedSshPaths.account);
  if (rows.length !== 1) throw new Error("trusted_ssh_installed_authority_account_invalid");
  const fields = rows[0].split(":");
  if (fields.length !== 7 || fields[5] !== trustedSshPaths.home || fields[6] !== trustedSshPaths.loginShell) {
    throw new Error("trusted_ssh_installed_authority_account_invalid");
  }
  const groups = group.trim().split("\n").filter(Boolean).filter((line) => {
    const parts = line.split(":"); return parts[2] === fields[3] || parts[3].split(",").includes(trustedSshPaths.account);
  }).map((line) => line.split(":")[0]).sort();
  if (canonicalJson(groups) !== canonicalJson([trustedSshPaths.account])) throw new Error("trusted_ssh_installed_authority_groups_invalid");
  return { groups };
}

function runCvtsudoersJson(policy) {
  const result = spawnSync("/usr/bin/cvtsudoers", ["-f", "JSON", "-"], {
    cwd: "/", encoding: "utf8", input: policy,
    env: { HOME: "/nonexistent", LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" },
  });
  if (result.status !== 0 || result.error) throw new Error("trusted_ssh_installed_authority_converter_invalid");
  return JSON.parse(result.stdout);
}

function capturePrivateAuthorityFile(file) {
  const expectedUid = process.getuid?.() ?? 0;
  const expectedGid = process.getgid?.() ?? 0;
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.uid !== expectedUid || before.gid !== expectedGid || before.nlink !== 1
        || (before.mode & 0o777) !== 0o600 || before.size < 2 || before.size > 4 * 1024 * 1024) {
      throw new Error("trusted_ssh_installed_authority_source_metadata_invalid");
    }
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    for (const field of ["dev", "ino", "uid", "gid", "mode", "nlink", "size", "mtimeMs", "ctimeMs"]) {
      if (before[field] !== after[field]) throw new Error("trusted_ssh_installed_authority_source_drift");
    }
    return Object.freeze({ bytes, gid: before.gid, mode: `0${(before.mode & 0o777).toString(8)}`, nlink: before.nlink, uid: before.uid });
  } finally { closeSync(fd); }
}

function assertPrivateSnapshotAncestry(root, directory) {
  const expectedUid = process.getuid?.() ?? 0;
  let cursor = root;
  const relative = path.relative(root, directory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("trusted_ssh_installed_authority_path_invalid");
  for (const component of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    const info = lstatSync(cursor);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== expectedUid || (info.mode & 0o022) !== 0) {
      throw new Error("trusted_ssh_installed_authority_ancestry_invalid");
    }
  }
}

function normalizeCollectedSudoPolicy(policy, groups) {
  const applies = (binding = []) => binding.length === 0 || binding.some((entry) => entry.username === trustedSshPaths.account
    || entry.usergroup === trustedSshPaths.account || entry.username === "ALL");
  const exactAccountBinding = [{ username: trustedSshPaths.account }];
  const defaults = new Map();
  for (const entry of policy.Defaults || []) if (applies(entry.Binding)) {
    if (canonicalJson(entry.Binding) !== canonicalJson(exactAccountBinding)) {
      throw new Error("trusted_ssh_installed_authority_defaults_scope_invalid");
    }
    for (const option of entry.Options || []) for (const [name, value] of Object.entries(option)) defaults.set(name, value);
  }
  const rules = [];
  for (const spec of policy.User_Specs || []) if (applies(spec.User_List)) {
    if (canonicalJson(spec.User_List) !== canonicalJson(exactAccountBinding)) {
      throw new Error("trusted_ssh_installed_authority_rule_scope_invalid");
    }
    for (const command of spec.Cmnd_Specs || []) for (const item of command.Commands || []) rules.push({ command, host: spec.Host_List, item });
  }
  const required = {
    env_reset: true, pam_service: "settleora-handoff-sudo", passwd_tries: "1", preserve_groups: false,
    rootpw: false, runaspw: false, secure_path: "/usr/sbin:/usr/bin:/sbin:/bin", set_home: false,
    targetpw: false, timestamp_timeout: "0", use_pty: true,
  };
  if (canonicalJson([...defaults.keys()].sort()) !== canonicalJson(Object.keys(required).sort())) {
    throw new Error("trusted_ssh_installed_authority_defaults_set_invalid");
  }
  for (const [name, value] of Object.entries(required)) if (defaults.get(name) !== value) throw new Error("trusted_ssh_installed_authority_defaults_invalid");
  if (defaults.has("exempt_group") || canonicalJson(groups) !== canonicalJson([trustedSshPaths.account]) || rules.length !== 1
      || canonicalJson(rules[0].host) !== canonicalJson([{ hostname: "ALL" }])
      || canonicalJson(rules[0].command.runasusers) !== canonicalJson([{ username: "root" }])
      || canonicalJson(rules[0].command.Options) !== canonicalJson([{ authenticate: true }])
      || canonicalJson(rules[0].item) !== canonicalJson({ command: `${trustedSshPaths.rootGate} \"\"` })) {
    throw new Error("trusted_ssh_installed_authority_rule_invalid");
  }
  return deriveEffectiveSudoPolicy(renderTrustedSshFixtures({ operatorKeyFingerprint: syntheticOperatorFingerprint() }).sudoAuthorityObservation);
}

function syntheticOperatorFingerprint() { return `SHA256:${"A".repeat(43)}`; }

export function validateNativeStaticExecutable(executable) {
  const file = spawnTool("/usr/bin/file", ["-b", executable]);
  const programHeaders = spawnTool("/usr/bin/readelf", ["-W", "-l", executable]);
  const dynamic = spawnSync("/usr/bin/readelf", ["-W", "-d", executable], { encoding: "utf8" });
  if (!file.includes("ELF") || !file.includes("statically linked") || /INTERP/u.test(programHeaders)
      || (dynamic.status === 0 && /\(NEEDED\)/u.test(dynamic.stdout))) {
    throw new Error("trusted_ssh_native_not_static");
  }
  return Object.freeze({ file: file.trim(), inspected: true, static: true });
}

export function validateNativeFreestandingExecutable(executable) {
  const identity = validateNativeStaticExecutable(executable);
  const symbols = spawnTool("/usr/bin/readelf", ["-Ws", executable]);
  if (!/\b_start\b/u.test(symbols) || /UND\s+[A-Za-z_]|__tunables_init|libc|GLIBC/u.test(symbols)) {
    throw new Error("trusted_ssh_native_not_freestanding");
  }
  return Object.freeze({ ...identity, freestanding: true, startup: "syscall-only-_start" });
}

export function validatePlatformFixtureSyntax(root) {
  const sudoers = path.join(root, "fixtures", "sudoers");
  const sshd = path.join(root, "fixtures", "sshd-match.conf");
  spawnTool("/usr/sbin/visudo", ["-cf", sudoers]);
  const keyRoot = mkdtempSync("/tmp/settleora-sshd-fixture-");
  try {
    chmodSync(keyRoot, 0o700);
    const keyFile = path.join(keyRoot, "host-rsa-key");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    writeFileSync(keyFile, privateKey.export({ format: "pem", type: "pkcs1" }), { mode: 0o600 });
    const config = path.join(keyRoot, "sshd_config");
    writeFileSync(config, `HostKey ${keyFile}\nUsePAM yes\n${readFileSync(sshd, "utf8")}`, { mode: 0o600 });
    const effective = spawnSync("/usr/sbin/sshd", ["-T", "-f", config, "-C", `user=${trustedSshPaths.account},host=localhost,addr=127.0.0.1`], {
      encoding: "utf8", env: { HOME: "/nonexistent", LANG: "C", LC_ALL: "C", PATH: "/usr/sbin:/usr/bin:/sbin:/bin" },
    });
    if (effective.status !== 0) throw new Error("trusted_ssh_sshd_fixture_platform_invalid");
    validateEffectiveSshdOutput(effective.stdout);
  } finally {
    rmSync(keyRoot, { force: true, recursive: true });
  }
  return Object.freeze({ inspected: true, sshd: "effective_verified", sudoers: "parsed" });
}

export function authenticateTrustedSshPackage({ root, handoffKey, operationId, expectedUid = 0, validateAncestors = expectedUid === 0 } = {}) {
  if (!keyPattern.test(String(handoffKey || "")) || !digestPattern.test(String(operationId || ""))) {
    throw new Error("trusted_ssh_package_identity_invalid");
  }
  const packagePath = path.join(root, handoffKey);
  if (path.dirname(packagePath) !== path.resolve(root) || path.basename(packagePath) !== handoffKey) {
    throw new Error("trusted_ssh_package_path_invalid");
  }
  if (validateAncestors) assertTrustedDirectoryChain(root, expectedUid);
  const directoryFd = openSync(packagePath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const held = [];
  try {
    const directory = fstatSync(directoryFd);
    if (!directory.isDirectory() || directory.uid !== expectedUid || (directory.mode & 0o022) !== 0) {
      throw new Error("trusted_ssh_package_directory_invalid");
    }
    const manifestRead = openHeldMember(directoryFd, "boundary-package.json", expectedUid);
    held.push(manifestRead.fd);
    const manifest = parseCanonicalJson(manifestRead.bytes);
    assertExactKeys(manifest, ["contract", "entrypoint", "handoffKey", "members", "operationId", "protocol", "source", "version"]);
    assertExactKeys(manifest.source, ["commit", "repository", "tree"]);
    assertExactKeys(manifest.protocol, ["executeFlow", "modes", "rootGate", "sudoAttemptLimit"]);
    if (manifest.contract !== trustedSshPackageContract || manifest.version !== 1 || manifest.handoffKey !== handoffKey
        || manifest.operationId !== operationId || !oidPattern.test(manifest.source?.commit)
        || !oidPattern.test(manifest.source?.tree) || manifest.source?.repository !== "tommytang213/Settleora"
        || canonicalJson(manifest.protocol) !== canonicalJson({
          executeFlow: ["prepare", "arm-interactive-sudo-once", "resume-readback-only"],
          modes: ["preflight", "execute"], rootGate: trustedSshPaths.rootGate, sudoAttemptLimit: 1,
        }) || !Array.isArray(manifest.members) || manifest.members.length < 1 || manifest.members.length > 128) {
      throw new Error("trusted_ssh_package_manifest_invalid");
    }
    const names = manifest.members.map((member) => member.path);
    if (canonicalJson(names) !== canonicalJson([...names].sort()) || new Set(names).size !== names.length) {
      throw new Error("trusted_ssh_package_manifest_invalid");
    }
    const actualTree = listHeldTree(directoryFd, expectedUid);
    const expectedDirectories = [...new Set(names.flatMap((name) => {
      const components = name.split("/");
      return components.slice(0, -1).map((_component, index) => components.slice(0, index + 1).join("/"));
    }))].sort();
    if (canonicalJson(actualTree.files) !== canonicalJson(["boundary-package.json", ...names].sort())
        || canonicalJson(actualTree.directories) !== canonicalJson(expectedDirectories)) {
      throw new Error("trusted_ssh_package_residue_invalid");
    }
    let entrypoint = null;
    for (const member of manifest.members) {
      assertExactKeys(member, ["byteCount", "mode", "path", "sha256"]);
      if (!safeMember(member.path) || !digestPattern.test(member.sha256) || !["0440", "0550"].includes(member.mode)
          || !Number.isSafeInteger(member.byteCount) || member.byteCount < 1 || member.byteCount > 16 * 1024 * 1024) {
        throw new Error("trusted_ssh_package_member_invalid");
      }
      const opened = openHeldMember(directoryFd, member.path, expectedUid);
      held.push(opened.fd);
      if (opened.bytes.length !== member.byteCount || sha256(opened.bytes) !== member.sha256
          || (opened.stat.mode & 0o777) !== Number.parseInt(member.mode, 8)) {
        throw new Error("trusted_ssh_package_member_invalid");
      }
      if (member.path === manifest.entrypoint) entrypoint = opened;
    }
    if (!entrypoint || manifest.entrypoint !== "remote-entrypoint.sh" || (entrypoint.stat.mode & 0o111) === 0) {
      throw new Error("trusted_ssh_package_entrypoint_invalid");
    }
    for (const fd of held) if (fd !== entrypoint.fd) closeSync(fd);
    return Object.freeze({ directoryFd, entrypointFd: entrypoint.fd, handoffKey, operationId });
  } catch (error) {
    for (const fd of held) { try { closeSync(fd); } catch {} }
    closeSync(directoryFd);
    throw error;
  }
}

export function closeAuthenticatedPackage(value) {
  closeSync(value.entrypointFd);
  closeSync(value.directoryFd);
}

function openHeldMember(directoryFd, name, expectedUid) {
  if (!safeMember(name)) throw new Error("trusted_ssh_package_member_path_invalid");
  const components = name.split("/");
  const directories = [];
  let parentFd = directoryFd;
  for (const component of components.slice(0, -1)) {
    const opened = openHeldDirectory(parentFd, component, expectedUid);
    directories.push(opened);
    parentFd = opened;
  }
  let fd;
  try {
    fd = openSync(`/proc/self/fd/${parentFd}/${components.at(-1)}`, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } finally {
    for (const opened of directories) closeSync(opened);
  }
  const stat = fstatSync(fd);
  if (!stat.isFile() || stat.uid !== expectedUid || stat.nlink !== 1 || (stat.mode & 0o022) !== 0 || stat.size > 16 * 1024 * 1024) {
    closeSync(fd);
    throw new Error("trusted_ssh_package_member_metadata_invalid");
  }
  const bytes = Buffer.alloc(stat.size);
  let offset = 0;
  while (offset < bytes.length) {
    const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
    if (count === 0) break;
    offset += count;
  }
  if (offset !== bytes.length) {
    closeSync(fd);
    throw new Error("trusted_ssh_package_member_read_invalid");
  }
  return { bytes, fd, stat };
}

function openHeldDirectory(parentFd, name, expectedUid) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(name) || name === "." || name === "..") {
    throw new Error("trusted_ssh_package_directory_path_invalid");
  }
  const fd = openSync(`/proc/self/fd/${parentFd}/${name}`, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const info = fstatSync(fd);
  if (!info.isDirectory() || info.uid !== expectedUid || (info.mode & 0o022) !== 0) {
    closeSync(fd);
    throw new Error("trusted_ssh_package_directory_metadata_invalid");
  }
  return fd;
}

function listHeldTree(rootFd, expectedUid, prefix = "") {
  const files = [];
  const directories = [];
  for (const name of readdirSync(`/proc/self/fd/${rootFd}`).sort()) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(name) || name === "." || name === "..") {
      throw new Error("trusted_ssh_package_tree_name_invalid");
    }
    const relative = prefix ? `${prefix}/${name}` : name;
    let directoryFd = null;
    try { directoryFd = openHeldDirectory(rootFd, name, expectedUid); } catch {}
    if (directoryFd !== null) {
      directories.push(relative);
      try {
        const nested = listHeldTree(directoryFd, expectedUid, relative);
        directories.push(...nested.directories); files.push(...nested.files);
      } finally { closeSync(directoryFd); }
    } else {
      const opened = openHeldMember(rootFd, name, expectedUid);
      closeSync(opened.fd); files.push(relative);
    }
  }
  return { directories: directories.sort(), files: files.sort() };
}

function authenticateInputArtifact({ name, source, mode, installedPath }) {
  const canonicalSource = realpathSync(source);
  const info = lstatSync(canonicalSource);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (info.mode & 0o022) !== 0
      || info.uid !== (process.getuid?.() ?? info.uid) || info.size < 1 || info.size > 32 * 1024 * 1024) {
    throw new Error("trusted_ssh_input_artifact_invalid");
  }
  const bytes = readFileSync(canonicalSource);
  return authenticatedArtifactRecord({ bytes, installedPath, mode, name, source: canonicalSource });
}

function authenticatedArtifactRecord({ bytes, installedPath, mode, name, source }) {
  const captured = Buffer.from(bytes);
  return Object.freeze({ byteCount: captured.length, bytes: captured, installedPath, mode, name, sha256: sha256(captured), source });
}

function authenticatePlanSourceClosure({
  dispatcherModule, fdExec, nativeShell, outputRoot, pamPreauth, pamPreauthModule, repositoryRoot, rootGate, rootGateModule,
  rootBootstrapModule, sourceCommit, sourceTree, supportLibrary,
}) {
  const root = realpathSync(repositoryRoot);
  const sources = [
    ["tools/auto-runner/trusted-ssh-boundary/settleora-trusted-ssh-dispatcher.mjs", dispatcherModule],
    ["tools/auto-runner/trusted-ssh-boundary/settleora-trusted-ssh-root-gate.mjs", rootGateModule],
    ["tools/auto-runner/trusted-ssh-boundary/settleora-trusted-ssh-pam-preauth.mjs", pamPreauthModule],
    ["tools/auto-runner/trusted-ssh-boundary/settleora-authenticated-root-bootstrap.mjs", rootBootstrapModule],
    ["tools/auto-runner/trusted-ssh-boundary/lib/trusted-ssh-boundary.mjs", supportLibrary],
  ];
  const artifactBytes = {};
  for (const [relative, supplied] of sources) {
    const expectedPath = path.join(root, relative);
    const bytes = gitBytes(root, ["show", `${sourceCommit}:${relative}`]);
    if (realpathSync(supplied) !== expectedPath || !readFileSync(expectedPath).equals(bytes)) {
      throw new Error("trusted_ssh_source_module_binding_invalid");
    }
    const artifactName = relative.endsWith("settleora-trusted-ssh-dispatcher.mjs") ? "settleora-trusted-ssh-dispatcher.mjs"
      : relative.endsWith("settleora-authenticated-root-bootstrap.mjs") ? "settleora-authenticated-root-bootstrap.mjs"
      : relative.endsWith("settleora-trusted-ssh-pam-preauth.mjs") ? "settleora-trusted-ssh-pam-preauth.mjs"
      : relative.endsWith("settleora-trusted-ssh-root-gate.mjs") ? "settleora-trusted-ssh-root-gate.mjs" : "trusted-ssh-boundary.mjs";
    artifactBytes[artifactName] = bytes;
  }
  const buildRoot = mkdtempSync(path.join(outputRoot, ".trusted-ssh-source-build-"));
  try {
    const builds = [
      ["tools/auto-runner/trusted-ssh-boundary/native/settleora-trusted-ssh-entry.c", nativeShell,
        ["-std=c17", "-O2", "-Wall", "-Wextra", "-Werror", "-pedantic", "-nostdlib", "-static", "-fno-stack-protector", "-fno-builtin", "-fno-pie", "-no-pie"]],
      ["tools/auto-runner/trusted-ssh-boundary/native/settleora-trusted-ssh-fd-exec.c", fdExec,
        ["-std=c17", "-O2", "-Wall", "-Wextra", "-Werror", "-pedantic", "-static"]],
      ["tools/auto-runner/trusted-ssh-boundary/native/settleora-trusted-ssh-pam-preauth.c", pamPreauth,
        ["-std=c17", "-O2", "-Wall", "-Wextra", "-Werror", "-pedantic", "-nostdlib", "-static", "-fno-stack-protector", "-fno-builtin", "-fno-pie", "-no-pie"]],
      ["tools/auto-runner/trusted-ssh-boundary/native/settleora-trusted-ssh-root-gate.c", rootGate,
        ["-std=c17", "-O2", "-Wall", "-Wextra", "-Werror", "-pedantic", "-nostdlib", "-static", "-fno-stack-protector", "-fno-builtin", "-fno-pie", "-no-pie"]],
    ];
    for (const [relative, supplied, flags] of builds) {
      const source = path.join(buildRoot, path.basename(relative));
      const executable = path.join(buildRoot, `${path.basename(relative)}.elf`);
      writePrivate(source, gitBytes(root, ["show", `${sourceCommit}:${relative}`]));
      const compilation = spawnSync("/usr/bin/gcc", [...flags, source, "-o", executable], {
        cwd: "/", encoding: "utf8", env: { HOME: "/nonexistent", LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" },
      });
      if (compilation.status !== 0 || compilation.error || !readFileSync(executable).equals(readFileSync(supplied))) {
        throw new Error("trusted_ssh_native_build_binding_invalid");
      }
      const artifactName = relative.includes("fd-exec") ? "settleora-trusted-ssh-fd-exec"
        : relative.includes("pam-preauth.c") ? "settleora-sudo-preauth"
        : relative.includes("root-gate.c") ? "settleora-root-gate" : "settleora-trusted-ssh-entry";
      artifactBytes[artifactName] = readFileSync(executable);
    }
  } finally { rmSync(buildRoot, { recursive: true, force: false }); }
  const observedTree = gitText(root, ["rev-parse", "--verify", `${sourceCommit}^{tree}`]).trim();
  if (observedTree !== sourceTree) throw new Error("trusted_ssh_source_tree_binding_invalid");
  return Object.freeze({ artifactBytes: Object.freeze(artifactBytes) });
}

function readGitSourceIdentity(repositoryRoot) {
  const root = realpathSync(repositoryRoot);
  if (root !== path.resolve(repositoryRoot)) throw new Error("trusted_ssh_repository_root_invalid");
  if (gitText(root, ["rev-parse", "--is-shallow-repository"]).trim() !== "false"
      || gitText(root, ["for-each-ref", "refs/replace", "--format=%(refname)"]).trim() !== "") {
    throw new Error("trusted_ssh_repository_history_invalid");
  }
  const status = gitText(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status !== "") throw new Error("trusted_ssh_repository_not_clean");
  const commit = gitText(root, ["rev-parse", "--verify", "HEAD"]).trim();
  const tree = gitText(root, ["rev-parse", "--verify", "HEAD^{tree}"]).trim();
  if (!oidPattern.test(commit) || !oidPattern.test(tree)) throw new Error("trusted_ssh_repository_identity_invalid");
  return Object.freeze({ commit, tree });
}

function gitBytes(root, args) {
  const result = spawnSync("/usr/bin/git", ["--no-replace-objects", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-C", root, ...args], {
    cwd: "/", env: { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_NO_REPLACE_OBJECTS: "1", HOME: "/nonexistent", LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" },
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) throw new Error("trusted_ssh_git_source_read_failed");
  return Buffer.from(result.stdout);
}

function gitText(root, args) { return gitBytes(root, args).toString("utf8"); }

function readAuthorizedKeyFingerprint(file) {
  const output = spawnTool("/usr/bin/ssh-keygen", ["-E", "sha256", "-lf", file]).trim();
  const fields = output.split(/\s+/u);
  if (fields.length < 4 || !fingerprintPattern.test(fields[1])) throw new Error("trusted_ssh_authorized_key_fingerprint_invalid");
  return fields[1];
}

function assertPrivateOutputRoot(value) {
  const root = realpathSync(value);
  const info = lstatSync(root);
  if (root !== path.resolve(value) || !info.isDirectory() || info.isSymbolicLink() || info.uid !== (process.getuid?.() ?? info.uid)
      || (info.mode & 0o077) !== 0 || livePrefixes.some((prefix) => root === prefix || root.startsWith(`${prefix}/`))) {
    throw new Error("trusted_ssh_output_root_not_private");
  }
}

function assertTrustedDirectoryChain(value, expectedUid) {
  const absolute = path.resolve(value);
  if (realpathSync(absolute) !== absolute) throw new Error("trusted_ssh_path_ancestry_invalid");
  let cursor = path.parse(absolute).root;
  for (const component of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    const info = lstatSync(cursor);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== expectedUid || (info.mode & 0o022) !== 0) {
      throw new Error("trusted_ssh_path_ancestry_invalid");
    }
  }
}

function safeMember(value) {
  return typeof value === "string" && value.length <= 512 && !value.startsWith("/")
    && value.split("/").every((component) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(component)
      && component !== "." && component !== "..");
}

function parseCanonicalJson(bytes) {
  const text = Buffer.from(bytes).toString("utf8");
  const value = JSON.parse(text);
  if (text !== `${canonicalJson(value)}\n`) throw new Error("trusted_ssh_canonical_json_required");
  return value;
}

function readBoundedRegular(file, expectedUid, maximum = 4 * 1024 * 1024, expectedMode = null, expectedGid = expectedUid) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.uid !== expectedUid || info.gid !== expectedGid || info.nlink !== 1
        || (info.mode & 0o022) !== 0 || (expectedMode !== null && (info.mode & 0o777) !== expectedMode)
        || info.size < 2 || info.size > maximum) {
      throw new Error("trusted_ssh_file_metadata_invalid");
    }
    return readFileSync(fd);
  } finally { closeSync(fd); }
}

function assertPrivatePlanDirectory(directory, expectedUid, expectedGid) {
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== expectedUid || info.gid !== expectedGid
      || (info.mode & 0o777) !== 0o700) throw new Error("trusted_ssh_plan_directory_invalid");
}

function assertOperationDirectory(directory, expectedUid, expectedGid, expectedMode) {
  const canonical = realpathSync(directory);
  const info = lstatSync(canonical);
  if (canonical !== path.resolve(directory) || !info.isDirectory() || info.isSymbolicLink()
      || info.uid !== expectedUid || info.gid !== expectedGid || (info.mode & 0o7777) !== expectedMode) {
    throw new Error("trusted_ssh_claim_directory_invalid");
  }
}

function assertExactNames(directory, expected) {
  const actual = readdirSync(directory).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) throw new Error("trusted_ssh_directory_allowlist_invalid");
}

function writePrivate(file, bytes) {
  const fd = openSync(file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}

function writeExactFile(file, bytes, mode) {
  const fd = openSync(file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, mode);
  try { writeFileSync(fd, bytes); fchmodSync(fd, mode); fsyncSync(fd); } finally { closeSync(fd); }
}

function fsyncDirectory(directory) { const fd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); try { fsyncSync(fd); } finally { closeSync(fd); } }
function fsyncTree(root) { for (const sub of ["artifacts", "fixtures", "."]) fsyncDirectory(path.join(root, sub)); }
function exists(value) { try { lstatSync(value); return true; } catch { return false; } }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])); return value; }
function assertExactKeys(value, expected) { if (!value || typeof value !== "object" || Array.isArray(value) || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) throw new Error("trusted_ssh_object_shape_invalid"); }
function spawnTool(command, args) {
  const result = spawnSync(command, args, {
    cwd: "/", encoding: "utf8",
    env: { HOME: "/nonexistent", LANG: "C", LC_ALL: "C", PATH: "/usr/sbin:/usr/bin:/sbin:/bin", TZ: "UTC" },
  });
  if (result.status !== 0 || result.error) throw new Error("trusted_ssh_platform_tool_failed");
  return result.stdout;
}

export const trustedSshKeyAlgorithms = allowedKeyAlgorithms;
