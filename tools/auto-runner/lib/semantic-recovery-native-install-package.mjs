import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, realpathSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  authenticateNativeInstallGitSource,
  nativeInstallBootstrapScript,
  verifyAuthenticatedNativeInstallSource,
} from "./semantic-recovery-native-install-source.mjs";
import {
  renderNativeInstallRemoteControllerFlowSource,
  renderNativeInstallWindowsSshCoordinatorSource,
} from "./semantic-recovery-native-install-handoff.mjs";

export const nativeInstallPackageContract = "settleora_semantic_recovery_native_install_handoff_package";
export const nativeInstallPackageVersion = 1;
export const nativeInstallPackageMaximumFiles = 128;
export const nativeInstallPackageMaximumBytes = 32 * 1024 * 1024;
const digestPattern = /^[a-f0-9]{64}$/u;
const oidPattern = /^[a-f0-9]{40}$/u;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const branchPattern = /^(?:main|[A-Za-z0-9][A-Za-z0-9._/-]{0,126}[A-Za-z0-9])$/u;
const hostPattern = /^[A-Za-z0-9._-]{1,64}@[A-Za-z0-9.-]{1,253}$/u;
const absoluteRemotePathPattern = /^\/[A-Za-z0-9._/-]{1,511}$/u;
const identifierPattern = /^[a-f0-9]{64}$/u;
const timestampKeyPattern = /^20[0-9]{6}-[0-9]{4}$/u;
const resultKeys = [
  "contentManifestDigest", "descriptorDigest", "fileCount", "finalHandoffDirectory", "handoffIdentityDigest",
  "newlyCreated", "noOperationalModeEntered", "operationId", "packageAggregateDigest", "packageContractVersion",
  "packageManifestDigest", "remoteEntrypointSha256", "sourceCommit", "sourceTree", "windowsLauncherPath",
  "windowsLauncherSha256",
];

export function generateNativeInstallHandoffPackage({
  repositoryRoot,
  handoffRoot,
  repository,
  branch,
  sourceCommit,
  sourceTree,
  remoteHost,
  remoteHandoffRoot,
  clock = () => new Date(),
  random = (size) => randomBytes(size),
  sourceAuthenticator = authenticateRepositoryNativeInstallSource,
  filesystem = createNativeInstallPackageFilesystem(),
  fault = () => {},
} = {}) {
  const request = normalizeGenerationRequest({ repositoryRoot, handoffRoot, repository, branch, sourceCommit, sourceTree, remoteHost, remoteHandoffRoot });
  const observed = clock();
  if (!(observed instanceof Date) || !Number.isFinite(observed.getTime())) throw new Error("handoff generation clock invalid");
  const generatedAt = observed.toISOString();
  const timestampKey = timestampKeyFromDate(observed);
  const operationId = randomHex(random, 32, "operation");
  const correlationId = randomHex(random, 32, "correlation");
  const challengeId = randomHex(random, 32, "challenge");
  const handoffId = randomHex(random, 32, "handoff");
  if (new Set([operationId, correlationId, challengeId, handoffId]).size !== 4) throw new Error("handoff generation identities duplicated");
  const handoffKey = `${timestampKey}-${operationId.slice(0, 16)}`;
  const finalDirectory = path.join(request.handoffRoot, handoffKey);
  const stagingName = `.settleora-native-handoff.${handoffKey}.${randomHex(random, 8, "staging")}.stage`;
  const stagingDirectory = path.join(request.handoffRoot, stagingName);

  filesystem.assertDestinationRoot(request.handoffRoot);
  if (filesystem.exists(finalDirectory) || filesystem.exists(stagingDirectory)) throw new Error("handoff destination already exists");
  const authenticatedSource = sourceAuthenticator(request);
  const sourceVerification = verifyAuthenticatedNativeInstallSource(authenticatedSource);
  if (!sourceVerification.ok || authenticatedSource.manifest.repository.toLowerCase() !== request.repository.toLowerCase()
      || authenticatedSource.manifest.sourceCommit !== request.sourceCommit || authenticatedSource.manifest.rootTree !== request.sourceTree) {
    throw new Error("handoff authenticated source binding invalid");
  }
  const closure = authenticatedSource.supportFiles.map((entry) => ({
    path: `controller/${entry.source}`,
    bytes: Buffer.from(entry.bytes),
    mode: entry.executable ? 0o500 : 0o400,
    source: entry.source,
    gitBlobOid: entry.gitBlobOid,
  }));
  if (!closure.some((entry) => entry.source === nativeInstallBootstrapScript)) throw new Error("handoff bootstrap closure missing");
  const closureRecords = closure.map(fileRecord);
  const closureDigest = sha256(canonicalBytes({ contract: "settleora_native_install_controller_closure", version: 1, members: closureRecords }));
  const identity = {
    challengeId, contract: "settleora_native_install_handoff_identity", correlationId, generatedAt, handoffId,
    operationId, repository: request.repository, sourceBranch: request.branch, sourceCommit: request.sourceCommit,
    sourceTree: request.sourceTree, timestampKey, version: 1,
  };
  const identityBytes = canonicalBytes(identity);
  const identityDigest = sha256(identityBytes);
  const descriptor = {
    challengeId, contract: "settleora_native_install_execution_descriptor", controllerClosureDigest: closureDigest,
    correlationId, expectedExecutionMode: "execute_once_then_readback_only", expectedPreflightMode: "read_only_preflight",
    generatedAt, handoffId, handoffIdentityDigest: identityDigest, operationId, remoteHandoffDirectory: `${request.remoteHandoffRoot}/${handoffKey}`,
    remoteHost: request.remoteHost, repository: request.repository, sourceBranch: request.branch, sourceCommit: request.sourceCommit,
    sourceManifestDigest: authenticatedSource.manifest.sourceManifestDigest, sourceTree: request.sourceTree, version: 1,
  };
  const descriptorBytes = canonicalBytes(descriptor);
  const descriptorDigest = sha256(descriptorBytes);
  const bootstrap = authenticatedSource.supportFiles.find((entry) => entry.source === nativeInstallBootstrapScript);
  const sourceHintBytes = canonicalBytes({
    bootstrapBlob: bootstrap.gitBlobOid, contract: "settleora_semantic_recovery_native_install_source",
    repository: request.repository, sourceCommit: request.sourceCommit, taskCorrelation: correlationId, version: 1,
  });
  const remoteEntrypoint = renderRemoteEntrypoint({ descriptor, descriptorDigest, identityDigest });
  const remoteBytes = Buffer.from(remoteEntrypoint);
  const remoteDigest = sha256(remoteBytes);
  const contentFiles = [
    { path: "handoff-identity.json", bytes: identityBytes, mode: 0o600 },
    { path: "execution-descriptor.json", bytes: descriptorBytes, mode: 0o600 },
    { path: "source-hint.json", bytes: sourceHintBytes, mode: 0o600 },
    { path: "remote-entrypoint.sh", bytes: remoteBytes, mode: 0o500 },
    ...closure,
  ];
  const launcherName = `Start-SettleoraManualRootInstall-${handoffKey}.ps1`;
  const packageAllowlist = [...contentFiles.map((entry) => entry.path), "content-manifest.json", "generation-summary.json", launcherName, "package-manifest.json"].sort();
  const contentManifest = {
    contract: "settleora_native_install_content_manifest", controllerClosureDigest: closureDigest, descriptorDigest,
    handoffIdentityDigest: identityDigest, members: contentFiles.map(fileRecord).sort(comparePath), operationId, packageAllowlist,
    repository: request.repository,
    sourceBranch: request.branch, sourceCommit: request.sourceCommit, sourceTree: request.sourceTree, version: 1,
  };
  const contentManifestBytes = canonicalBytes(contentManifest);
  const contentManifestDigest = sha256(contentManifestBytes);
  const launcherBytes = Buffer.from(renderWindowsLauncher({
    descriptor, descriptorDigest, identityDigest, contentManifestDigest, remoteDigest,
  }));
  const launcherDigest = sha256(launcherBytes);
  const packageMembers = [
    ...contentFiles,
    { path: "content-manifest.json", bytes: contentManifestBytes, mode: 0o600 },
    { path: launcherName, bytes: launcherBytes, mode: 0o600 },
  ];
  const packageMemberRecords = packageMembers.map(fileRecord).sort(comparePath);
  const allowlist = packageAllowlist;
  const aggregateCore = {
    contract: nativeInstallPackageContract, version: nativeInstallPackageVersion, allowlist, members: packageMemberRecords,
  };
  const packageAggregateDigest = sha256(canonicalBytes(aggregateCore));
  const packageManifest = {
    ...aggregateCore, contentManifestDigest, controllerClosureDigest: closureDigest, descriptorDigest, handoffId,
    handoffIdentityDigest: identityDigest, operationId, packageAggregateDigest, remoteEntrypointSha256: remoteDigest,
    repository: request.repository, sourceBranch: request.branch, sourceCommit: request.sourceCommit, sourceTree: request.sourceTree,
    windowsLauncherPath: launcherName, windowsLauncherSha256: launcherDigest,
  };
  const packageManifestBytes = canonicalBytes(packageManifest);
  const packageManifestDigest = sha256(packageManifestBytes);
  const summary = {
    contentManifestDigest, contract: "settleora_native_install_handoff_generation_summary", descriptorDigest,
    fileCount: allowlist.length, generatedAt, handoffIdentityDigest: identityDigest, newlyCreated: true,
    noOperationalModeEntered: true, operationId, packageAggregateDigest, packageContractVersion: nativeInstallPackageVersion,
    packageManifestDigest, remoteEntrypointSha256: remoteDigest, sourceCommit: request.sourceCommit, sourceTree: request.sourceTree,
    version: 1, windowsLauncherPath: launcherName, windowsLauncherSha256: launcherDigest,
  };
  const summaryBytes = canonicalBytes(summary);
  const allFiles = [...packageMembers,
    { path: "package-manifest.json", bytes: packageManifestBytes, mode: 0o600 },
    { path: "generation-summary.json", bytes: summaryBytes, mode: 0o600 },
  ];
  if (allFiles.length !== allowlist.length || allFiles.length > nativeInstallPackageMaximumFiles
      || allFiles.reduce((sum, entry) => sum + entry.bytes.length, 0) > nativeInstallPackageMaximumBytes) {
    throw new Error("handoff package bounds exceeded");
  }

  let published = false;
  filesystem.createStage(stagingDirectory);
  try {
    for (const entry of allFiles.sort(comparePath)) filesystem.writeStageFile(stagingDirectory, entry);
    filesystem.fsyncTree(stagingDirectory);
    validateNativeInstallHandoffPackage(stagingDirectory, { filesystem, expected: { ...summary, packageManifestDigest } });
    fault("before-publication", { stagingDirectory, finalDirectory });
    filesystem.publishNoReplace({ parent: request.handoffRoot, stagingName, finalName: handoffKey });
    published = true;
    filesystem.fsyncDirectory(request.handoffRoot);
    fault("after-publication", { stagingDirectory, finalDirectory });
    validateNativeInstallHandoffPackage(finalDirectory, { filesystem, expected: { ...summary, packageManifestDigest } });
  } catch (error) {
    const publicationAmbiguous = published || error?.publicationMayHaveOccurred === true
      || filesystem.isPublicationAmbiguous({ stagingDirectory, finalDirectory });
    if (!publicationAmbiguous && filesystem.isOwnedUnpublishedStage(stagingDirectory)) filesystem.removeOwnedStage(stagingDirectory);
    if (publicationAmbiguous) throw new Error(`handoff publication ambiguous: ${boundedError(error)}`);
    throw error;
  }
  return deepFreeze({
    contentManifestDigest, descriptorDigest, fileCount: allowlist.length, finalHandoffDirectory: finalDirectory,
    handoffIdentityDigest: identityDigest, newlyCreated: true, noOperationalModeEntered: true, operationId,
    packageAggregateDigest, packageContractVersion: nativeInstallPackageVersion, packageManifestDigest,
    remoteEntrypointSha256: remoteDigest, sourceCommit: request.sourceCommit, sourceTree: request.sourceTree,
    windowsLauncherPath: launcherName, windowsLauncherSha256: launcherDigest,
  });
}

export function validateNativeInstallHandoffPackage(directory, { filesystem = createNativeInstallPackageFilesystem(), expected = null } = {}) {
  filesystem.assertPublishedDirectory(directory);
  const names = filesystem.listFiles(directory);
  const manifestBytes = filesystem.readFile(directory, "package-manifest.json", 1024 * 1024);
  const manifest = parseCanonicalJson(manifestBytes);
  assertExactKeys(manifest, [
    "allowlist", "contentManifestDigest", "contract", "controllerClosureDigest", "descriptorDigest", "handoffId",
    "handoffIdentityDigest", "members", "operationId", "packageAggregateDigest", "remoteEntrypointSha256", "repository",
    "sourceBranch", "sourceCommit", "sourceTree", "version", "windowsLauncherPath", "windowsLauncherSha256",
  ]);
  if (manifest.contract !== nativeInstallPackageContract || manifest.version !== nativeInstallPackageVersion
      || !Array.isArray(manifest.allowlist) || manifest.allowlist.length < 8 || manifest.allowlist.length > nativeInstallPackageMaximumFiles
      || canonicalJson([...manifest.allowlist].sort()) !== canonicalJson(manifest.allowlist)
      || new Set(manifest.allowlist).size !== manifest.allowlist.length || canonicalJson(names) !== canonicalJson(manifest.allowlist)
      || !Array.isArray(manifest.members) || manifest.members.length !== manifest.allowlist.length - 2) {
    throw new Error("handoff package manifest invalid");
  }
  for (const scalar of [manifest.contentManifestDigest, manifest.controllerClosureDigest, manifest.descriptorDigest,
    manifest.handoffId, manifest.handoffIdentityDigest, manifest.operationId, manifest.packageAggregateDigest,
    manifest.remoteEntrypointSha256, manifest.windowsLauncherSha256]) if (!digestPattern.test(String(scalar || ""))) throw new Error("handoff package digest invalid");
  if (!repositoryPattern.test(manifest.repository) || !branchPattern.test(manifest.sourceBranch)
      || !oidPattern.test(manifest.sourceCommit) || !oidPattern.test(manifest.sourceTree) || !safeRelativePath(manifest.windowsLauncherPath)) {
    throw new Error("handoff package source identity invalid");
  }
  const seen = new Set();
  for (const member of manifest.members) {
    assertExactKeys(member, ["byteCount", "mode", "path", "sha256"]);
    if (!safeRelativePath(member.path) || seen.has(member.path) || !manifest.allowlist.includes(member.path)
        || !["0400", "0500", "0600"].includes(member.mode) || !digestPattern.test(String(member.sha256 || ""))
        || !Number.isSafeInteger(member.byteCount) || member.byteCount < 1 || member.byteCount > 16 * 1024 * 1024) {
      throw new Error("handoff package member schema invalid");
    }
    const bytes = filesystem.readFile(directory, member.path, member.byteCount + 1, Number.parseInt(member.mode, 8));
    if (bytes.length !== member.byteCount || sha256(bytes) !== member.sha256) throw new Error("handoff package member changed");
    seen.add(member.path);
  }
  const aggregate = sha256(canonicalBytes({ contract: manifest.contract, version: manifest.version, allowlist: manifest.allowlist, members: manifest.members }));
  if (aggregate !== manifest.packageAggregateDigest) throw new Error("handoff package aggregate mismatch");
  const identityBytes = filesystem.readFile(directory, "handoff-identity.json", 64 * 1024, 0o600);
  const identity = parseCanonicalJson(identityBytes);
  assertExactKeys(identity, ["challengeId", "contract", "correlationId", "generatedAt", "handoffId", "operationId", "repository", "sourceBranch", "sourceCommit", "sourceTree", "timestampKey", "version"]);
  if (identity.contract !== "settleora_native_install_handoff_identity" || identity.version !== 1
      || !identifierPattern.test(identity.challengeId) || !identifierPattern.test(identity.correlationId)
      || identity.handoffId !== manifest.handoffId || identity.operationId !== manifest.operationId
      || sha256(identityBytes) !== manifest.handoffIdentityDigest || identity.repository !== manifest.repository
      || identity.sourceBranch !== manifest.sourceBranch || identity.sourceCommit !== manifest.sourceCommit || identity.sourceTree !== manifest.sourceTree) {
    throw new Error("handoff identity cross-binding invalid");
  }
  const descriptorBytes = filesystem.readFile(directory, "execution-descriptor.json", 64 * 1024, 0o600);
  const descriptor = parseCanonicalJson(descriptorBytes);
  assertExactKeys(descriptor, ["challengeId", "contract", "controllerClosureDigest", "correlationId", "expectedExecutionMode", "expectedPreflightMode", "generatedAt", "handoffId", "handoffIdentityDigest", "operationId", "remoteHandoffDirectory", "remoteHost", "repository", "sourceBranch", "sourceCommit", "sourceManifestDigest", "sourceTree", "version"]);
  if (descriptor.contract !== "settleora_native_install_execution_descriptor" || descriptor.version !== 1
      || sha256(descriptorBytes) !== manifest.descriptorDigest || descriptor.handoffIdentityDigest !== manifest.handoffIdentityDigest
      || descriptor.controllerClosureDigest !== manifest.controllerClosureDigest || descriptor.challengeId !== identity.challengeId
      || descriptor.correlationId !== identity.correlationId || descriptor.generatedAt !== identity.generatedAt
      || descriptor.handoffId !== identity.handoffId || descriptor.operationId !== identity.operationId
      || descriptor.repository !== identity.repository || descriptor.sourceBranch !== identity.sourceBranch
      || descriptor.sourceCommit !== identity.sourceCommit || descriptor.sourceTree !== identity.sourceTree
      || descriptor.expectedPreflightMode !== "read_only_preflight" || descriptor.expectedExecutionMode !== "execute_once_then_readback_only") {
    throw new Error("handoff descriptor cross-binding invalid");
  }
  const contentBytes = filesystem.readFile(directory, "content-manifest.json", 1024 * 1024, 0o600);
  const content = parseCanonicalJson(contentBytes);
  assertExactKeys(content, ["contract", "controllerClosureDigest", "descriptorDigest", "handoffIdentityDigest", "members", "operationId", "packageAllowlist", "repository", "sourceBranch", "sourceCommit", "sourceTree", "version"]);
  if (sha256(contentBytes) !== manifest.contentManifestDigest || content.contract !== "settleora_native_install_content_manifest"
      || content.version !== 1 || content.descriptorDigest !== manifest.descriptorDigest
      || content.handoffIdentityDigest !== manifest.handoffIdentityDigest || content.controllerClosureDigest !== manifest.controllerClosureDigest
      || content.operationId !== manifest.operationId || content.repository !== manifest.repository || content.sourceBranch !== manifest.sourceBranch
      || content.sourceCommit !== manifest.sourceCommit || content.sourceTree !== manifest.sourceTree
      || canonicalJson(content.packageAllowlist) !== canonicalJson(manifest.allowlist)
      || canonicalJson(content.members) !== canonicalJson(manifest.members.filter((entry) => !["content-manifest.json", manifest.windowsLauncherPath].includes(entry.path)))) {
    throw new Error("handoff content manifest cross-binding invalid");
  }
  const launcherBytes = filesystem.readFile(directory, manifest.windowsLauncherPath, 2 * 1024 * 1024, 0o600);
  const remoteBytes = filesystem.readFile(directory, "remote-entrypoint.sh", 2 * 1024 * 1024, 0o500);
  if (sha256(launcherBytes) !== manifest.windowsLauncherSha256 || sha256(remoteBytes) !== manifest.remoteEntrypointSha256
      || !launcherBytes.includes(Buffer.from(manifest.contentManifestDigest)) || !launcherBytes.includes(Buffer.from(manifest.descriptorDigest))
      || !launcherBytes.includes(Buffer.from(manifest.remoteEntrypointSha256))) throw new Error("handoff embedded digest mismatch");
  const summaryBytes = filesystem.readFile(directory, "generation-summary.json", 64 * 1024, 0o600);
  const summary = parseCanonicalJson(summaryBytes);
  assertExactKeys(summary, ["contentManifestDigest", "contract", "descriptorDigest", "fileCount", "generatedAt", "handoffIdentityDigest", "newlyCreated", "noOperationalModeEntered", "operationId", "packageAggregateDigest", "packageContractVersion", "packageManifestDigest", "remoteEntrypointSha256", "sourceCommit", "sourceTree", "version", "windowsLauncherPath", "windowsLauncherSha256"]);
  if (summary.contract !== "settleora_native_install_handoff_generation_summary" || summary.version !== 1
      || summary.fileCount !== names.length || summary.newlyCreated !== true || summary.noOperationalModeEntered !== true
      || summary.operationId !== manifest.operationId || summary.packageAggregateDigest !== manifest.packageAggregateDigest
      || summary.packageManifestDigest !== sha256(manifestBytes) || summary.windowsLauncherSha256 !== manifest.windowsLauncherSha256
      || summary.remoteEntrypointSha256 !== manifest.remoteEntrypointSha256 || summary.contentManifestDigest !== manifest.contentManifestDigest
      || summary.descriptorDigest !== manifest.descriptorDigest || summary.handoffIdentityDigest !== manifest.handoffIdentityDigest
      || summary.sourceCommit !== manifest.sourceCommit || summary.sourceTree !== manifest.sourceTree) throw new Error("handoff generation summary invalid");
  if (expected) {
    for (const key of ["operationId", "packageAggregateDigest", "packageManifestDigest", "windowsLauncherSha256", "remoteEntrypointSha256", "sourceCommit", "sourceTree"])
      if (expected[key] !== summary[key]) throw new Error("handoff expected result mismatch");
  }
  return deepFreeze({ ...summary, packageManifestDigest: sha256(manifestBytes) });
}

export function authenticateRepositoryNativeInstallSource(request, { command = runCommand } = {}) {
  const root = request.repositoryRoot;
  assertSafeRepositoryRoot(root);
  const env = trustedGitEnvironment();
  const git = (args, encoding = "utf8") => command("/usr/bin/git", args, { cwd: root, env, encoding });
  const localConfig = git(["config", "--local", "--no-includes", "--null", "--list"]);
  if (/(?:^|\0)(?:core\.(?:hookspath|attributesfile|fsmonitor|sshcommand)|include(?:if\.[^\0]*)?\.path|filter\.[^\0]*\.(?:clean|smudge|process|required)|diff\.[^\0]*\.(?:command|textconv)|merge\.[^\0]*\.driver|url\.[^\0]*\.insteadof|http\.[^\0]*\.extraheader|remote\.[^\0]*\.(?:uploadpack|receivepack))\n/iu.test(localConfig)) throw new Error("handoff unsafe Git configuration");
  if (git(["rev-parse", "--is-shallow-repository"]).trim() !== "false") throw new Error("handoff source history incomplete");
  if (git(["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "status", "--porcelain=v1", "--untracked-files=all"]).length !== 0) throw new Error("handoff source worktree dirty");
  const head = git(["rev-parse", "HEAD^{commit}"]).trim();
  const localBranch = git(["symbolic-ref", "--short", "HEAD"]).trim();
  const localRef = git(["rev-parse", `refs/heads/${request.branch}^{commit}`]).trim();
  const remoteRef = git(["rev-parse", `refs/remotes/origin/${request.branch}^{commit}`]).trim();
  const tree = git(["rev-parse", `${request.sourceCommit}^{tree}`]).trim();
  const remote = git(["remote", "get-url", "origin"]).trim();
  if (head !== request.sourceCommit || localBranch !== request.branch || localRef !== request.sourceCommit
      || remoteRef !== request.sourceCommit || tree !== request.sourceTree
      || remote !== `https://github.com/${request.repository}.git`) throw new Error("handoff exact Git source binding mismatch");
  const gitDir = git(["rev-parse", "--git-common-dir"]).trim();
  const absoluteGitDir = path.resolve(root, gitDir);
  for (const target of [path.join(absoluteGitDir, "shallow"), path.join(absoluteGitDir, "info/grafts"), path.join(absoluteGitDir, "objects/info/alternates")]) {
    if (existsSync(target)) throw new Error("handoff Git alternate authority forbidden");
  }
  if (git(["for-each-ref", "refs/replace", "--format=%(refname)"]).trim() !== "") throw new Error("handoff Git replace authority forbidden");
  const bootstrapOid = git(["rev-parse", `${request.sourceCommit}:${nativeInstallBootstrapScript}`]).trim();
  return authenticateNativeInstallGitSource({
    hint: {
      bootstrapBlob: bootstrapOid, contract: "settleora_semantic_recovery_native_install_source", repository: request.repository,
      sourceCommit: request.sourceCommit, taskCorrelation: `handoff-source-${request.sourceCommit.slice(0, 16)}`, version: 1,
    },
    objectReader: {
      resolveRepository: () => ({ commit: request.sourceCommit, repository: request.repository, transport: "authenticated_github_https" }),
      readObject(oid) {
        const type = git(["cat-file", "-t", oid]).trim();
        const bytes = Buffer.from(git(["cat-file", type, oid], null));
        return { bytes, oid, type };
      },
    },
  });
}

export function createNativeInstallPackageFilesystem({ publisherPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "semantic-recovery-native-handoff-rename-noreplace.py") } = {}) {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  return {
    exists: existsSync,
    assertDestinationRoot: (target) => assertSafeDestinationRoot(target, uid, gid),
    createStage(target) { mkdirSync(target, { mode: 0o700 }); assertOwnedDirectory(target, uid, gid, 0o700); fsyncDirectory(path.dirname(target)); },
    writeStageFile(root, entry) {
      if (!safeRelativePath(entry.path) || !Buffer.isBuffer(entry.bytes) || ![0o400, 0o500, 0o600].includes(entry.mode)) throw new Error("handoff staged file invalid");
      const target = path.join(root, entry.path);
      ensurePrivateDirectories(root, path.dirname(target), uid, gid);
      const fd = openSync(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, entry.mode);
      try { writeFileSync(fd, entry.bytes); fsyncSync(fd); } finally { closeSync(fd); }
      chmodSync(target, entry.mode);
    },
    fsyncTree(root) { fsyncTree(root); },
    publishNoReplace({ parent, stagingName, finalName }) {
      const parentFd = openSync(parent, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try {
        const child = spawnSync("/usr/bin/python3", [publisherPath, "--publish-fd3", stagingName, finalName], {
          cwd: "/", env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" }, stdio: ["ignore", "pipe", "pipe", parentFd], encoding: "utf8", maxBuffer: 16 * 1024, timeout: 30_000,
        });
        const publicationMarker = "handoff_publication_renamed\n";
        if (child.status !== 0 || child.error || child.stdout !== publicationMarker) {
          const error = new Error("handoff atomic publication failed");
          if (child.stdout?.startsWith(publicationMarker)) error.publicationMayHaveOccurred = true;
          throw error;
        }
      } finally { closeSync(parentFd); }
    },
    fsyncDirectory,
    isOwnedUnpublishedStage(target) { try { assertOwnedDirectory(target, uid, gid, 0o700); return path.basename(target).startsWith(".settleora-native-handoff."); } catch { return false; } },
    isPublicationAmbiguous({ stagingDirectory, finalDirectory }) {
      // The root is an already validated private same-owner directory. Cleanup is
      // safe only while the exact stage still exists and the exact final does not.
      return existsSync(finalDirectory) || !existsSync(stagingDirectory);
    },
    removeOwnedStage(target) { rmSync(target, { recursive: true }); fsyncDirectory(path.dirname(target)); },
    assertPublishedDirectory(target) { assertOwnedDirectory(target, uid, gid, 0o700); },
    listFiles(root) { return listRelativeFiles(root); },
    readFile(root, relative, maximum, expectedMode) {
      if (!safeRelativePath(relative)) throw new Error("handoff read path invalid");
      const target = path.join(root, relative);
      const info = lstatSync(target);
      if (!info.isFile() || info.isSymbolicLink() || info.uid !== uid || info.gid !== gid || info.nlink !== 1
          || realpathSync(target) !== target || info.size < 1 || info.size > maximum
          || (expectedMode !== undefined && (info.mode & 0o7777) !== expectedMode)) throw new Error("handoff package file unsafe");
      return readFileSync(target);
    },
  };
}

function renderWindowsLauncher({ descriptor, descriptorDigest, identityDigest, contentManifestDigest, remoteDigest }) {
  const coordinator = renderNativeInstallWindowsSshCoordinatorSource();
  return `# Generated from authenticated Settleora source. Verify this file's detached SHA-256 before execution.\n` + String.raw`param()
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$RemoteHost = '${descriptor.remoteHost}'
$RemoteEntrypoint = '${descriptor.remoteHandoffDirectory}/remote-entrypoint.sh'
$OperationId = '${descriptor.operationId}'
$ChallengeId = '${descriptor.challengeId}'
$DescriptorSha256 = '${descriptorDigest}'
$ContentManifestSha256 = '${contentManifestDigest}'
$HandoffIdentitySha256 = '${identityDigest}'
$RemoteEntrypointSha256 = '${remoteDigest}'
function Assert-SafeAsciiScalar { param([string]$Value) if ($Value -notmatch '^[A-Za-z0-9_@+=:,./-]{1,512}$') { throw 'unsafe_scalar' } }
function ConvertTo-CanonicalTrustedDrivePath { param([string]$Value,[string]$Label) $full=[IO.Path]::GetFullPath($Value); if ($full -ne $Value.TrimEnd('\')) { throw ($Label + '_noncanonical') }; return $full }
function Assert-CanonicalDirectoryComponent { param([string]$Value,[string]$Label) if (-not [IO.Directory]::Exists($Value)) { throw ($Label + '_missing') } }
function Resolve-TrustedLocations {
  $windowsRoot=[Environment]::GetFolderPath([Environment+SpecialFolder]::Windows)
  $systemDirectory=[Environment]::SystemDirectory
  $openSshDirectory=[IO.Path]::Combine($systemDirectory,'OpenSSH')
  $ssh=[IO.Path]::Combine($openSshDirectory,'ssh.exe')
  if (-not [IO.File]::Exists($ssh)) { throw 'ssh_missing' }
  return [pscustomobject]@{WindowsRoot=$windowsRoot;SystemDirectory=$systemDirectory;OpenSshDirectory=$openSshDirectory;SshExecutable=$ssh}
}
` + coordinator + String.raw`
function Read-CanonicalSingleRecord { param([string]$Value,[string]$ExpectedPhase,[string]$ExpectedReason)
  $expected='{"challengeId":"' + $ChallengeId + '","contract":"settleora_native_install_remote_result","operationId":"' + $OperationId + '","phase":"' + $ExpectedPhase + '","reasonCode":"' + $ExpectedReason + '","version":1}' + [char]10
  if ($Value.Length -gt 4096 -or $Value -cne $expected) { throw 'controller_output_not_exact_canonical_record' }
  return [pscustomobject]@{reasonCode=$ExpectedReason}
}
function Invoke-Phase { param([string]$Phase,[bool]$Capture)
  $ttyOption = if ($Phase -eq '--preflight') { '-T' } else { '-tt' }
  $args=@($ttyOption,'-o','BatchMode=yes','-o','ClearAllForwardings=yes','-o','ForwardAgent=no','-o','ForwardX11=no','--',$RemoteHost,$RemoteEntrypoint,$Phase,$OperationId,$ChallengeId,$DescriptorSha256,$ContentManifestSha256,$HandoffIdentitySha256,$RemoteEntrypointSha256)
  $info=New-SshProcessStartInfo (Resolve-TrustedLocations) $args $Capture
  $process=[Diagnostics.Process]::new(); $process.StartInfo=$info
  if ($Phase -eq '--preflight') { Start-SshPreflightProcess $process } else { Assert-SshExecuteRemainsInteractive $process; if (-not $process.Start()) { throw 'execute_process_start_failed' } }
  if ($Capture) { $stdout=$process.StandardOutput.ReadToEnd(); $stderr=$process.StandardError.ReadToEnd() }
  $process.WaitForExit(); if ($process.ExitCode -ne 0) { throw ($Phase + '_failed') }
  if ($Capture) { return Read-CanonicalSingleRecord $stdout $Phase 'native_install_preflight_verified' }
}
$preflight=Invoke-Phase '--preflight' $true
if ($preflight.reasonCode -ne 'native_install_preflight_verified') { throw 'preflight_reason_mismatch' }
Invoke-Phase '--execute' $false
`;
}

function renderRemoteEntrypoint({ descriptor, descriptorDigest, identityDigest }) {
  const controller = renderNativeInstallRemoteControllerFlowSource();
  return `#!/usr/bin/env bash\nset -eEuo pipefail\nIFS=$'\\n\\t'\numask 077\n` + String.raw`fail(){ /usr/bin/printf '%s\n' "$1" >&2; exit 1; }
[ "$#" -eq 7 ] || fail remote_arguments_invalid
PHASE="$1"; OPERATION_ID="$2"; CHALLENGE_ID="$3"; DESCRIPTOR_DIGEST="$4"; CONTENT_DIGEST="$5"; IDENTITY_DIGEST="$6"; EXPECTED_SELF_DIGEST="$7"
PACKAGE_ROOT=$(/usr/bin/readlink -f -- "$(/usr/bin/dirname -- "$0")")
[ "$PACKAGE_ROOT" = '${descriptor.remoteHandoffDirectory}' ] || fail remote_package_path_changed
[ "$(/usr/bin/readlink -f -- "$0")" = "$PACKAGE_ROOT/remote-entrypoint.sh" ] || fail remote_entrypoint_path_changed
[ "$(/usr/bin/stat -c '%u:%g:%a' "$PACKAGE_ROOT")" = "$(/usr/bin/id -u):$(/usr/bin/id -g):700" ] || fail remote_package_root_unsafe
ancestor="$PACKAGE_ROOT"
while [ "$ancestor" != / ]; do
  ancestor_mode=$(/usr/bin/stat -c '%a' "$ancestor"); ancestor_uid=$(/usr/bin/stat -c '%u' "$ancestor")
  [ "$ancestor_uid" = 0 ] || [ "$ancestor_uid" = "$(/usr/bin/id -u)" ] || fail remote_package_ancestor_owner_unsafe
  (( (8#$ancestor_mode & 8#22) == 0 )) || fail remote_package_ancestor_mode_unsafe
  ancestor=$(/usr/bin/dirname -- "$ancestor")
done
[ "$OPERATION_ID" = '${descriptor.operationId}' ] && [ "$CHALLENGE_ID" = '${descriptor.challengeId}' ] || fail remote_identity_mismatch
[ "$DESCRIPTOR_DIGEST" = '${descriptorDigest}' ] && [ "$IDENTITY_DIGEST" = '${identityDigest}' ] || fail remote_binding_mismatch
[ "$(/usr/bin/sha256sum "$0" | /usr/bin/cut -d' ' -f1)" = "$EXPECTED_SELF_DIGEST" ] || fail remote_entrypoint_changed
[ "$(/usr/bin/sha256sum "$PACKAGE_ROOT/execution-descriptor.json" | /usr/bin/cut -d' ' -f1)" = "$DESCRIPTOR_DIGEST" ] || fail descriptor_changed
[ "$(/usr/bin/sha256sum "$PACKAGE_ROOT/handoff-identity.json" | /usr/bin/cut -d' ' -f1)" = "$IDENTITY_DIGEST" ] || fail identity_changed
[ "$(/usr/bin/sha256sum "$PACKAGE_ROOT/content-manifest.json" | /usr/bin/cut -d' ' -f1)" = "$CONTENT_DIGEST" ] || fail content_manifest_changed
verify_package(){
  /usr/bin/jq -e --arg op "$OPERATION_ID" '.contract=="settleora_native_install_content_manifest" and .version==1 and .operationId==$op and (.packageAllowlist|type=="array")' "$PACKAGE_ROOT/content-manifest.json" >/dev/null || fail content_manifest_invalid
  [ -z "$(/usr/bin/find "$PACKAGE_ROOT" -type l -print -quit)" ] || fail package_symlink_residue
  [ -z "$(/usr/bin/find "$PACKAGE_ROOT" -type f -links +1 -print -quit)" ] || fail package_hardlink_residue
  [ -z "$(/usr/bin/find "$PACKAGE_ROOT" ! -type d ! -type f -print -quit)" ] || fail package_special_residue
  actual=$(/usr/bin/find "$PACKAGE_ROOT" -type f -printf '%P\n' | /usr/bin/sort)
  expected=$(/usr/bin/jq -r '.packageAllowlist[]' "$PACKAGE_ROOT/content-manifest.json")
  [ "$actual" = "$expected" ] || fail package_allowlist_changed
  package_uid=$(/usr/bin/stat -c '%u' "$PACKAGE_ROOT"); package_gid=$(/usr/bin/stat -c '%g' "$PACKAGE_ROOT")
  expected_directories=$(/usr/bin/jq -r '.packageAllowlist[]' "$PACKAGE_ROOT/content-manifest.json" | /usr/bin/awk -F/ '{path=""; for(i=1;i<NF;i++){path=(path==""?$i:path "/" $i); print path}}' | /usr/bin/sort -u)
  actual_directories=$(/usr/bin/find "$PACKAGE_ROOT" -mindepth 1 -type d -printf '%P\n' | /usr/bin/sort)
  [ "$actual_directories" = "$expected_directories" ] || fail package_directory_residue
  while IFS= read -r directory; do
    [ -z "$directory" ] || [ "$(/usr/bin/stat -c '%u:%g:%a' "$PACKAGE_ROOT/$directory")" = "$package_uid:$package_gid:700" ] || fail package_directory_metadata_changed
  done <<< "$expected_directories"
  while IFS=$'\t' read -r member digest size mode; do
    case "$member" in /*|*..*|*\\*) fail manifest_path_invalid;; esac
    target="$PACKAGE_ROOT/$member"; [ -f "$target" ] && [ ! -L "$target" ] || fail package_member_unsafe
    [ "$(/usr/bin/stat -c '%u:%g:%h:%s:%a' "$target")" = "$package_uid:$package_gid:1:$size:$mode" ] || fail package_member_metadata_changed
    [ "$(/usr/bin/sha256sum "$target" | /usr/bin/cut -d' ' -f1)" = "$digest" ] || fail package_member_changed
  done < <(/usr/bin/jq -r '.members[] | [.path,.sha256,.byteCount,(.mode|ltrimstr("0"))] | @tsv' "$PACKAGE_ROOT/content-manifest.json")
}
verify_package
emit(){ /usr/bin/jq -cn --arg challengeId "$CHALLENGE_ID" --arg operationId "$OPERATION_ID" --arg phase "$PHASE" --arg reasonCode "$1" '{challengeId:$challengeId,contract:"settleora_native_install_remote_result",operationId:$operationId,phase:$phase,reasonCode:$reasonCode,version:1}'; }
case "$PHASE" in
  --preflight) emit native_install_preflight_verified; exit 0 ;;
  --execute) ;;
  *) fail remote_phase_invalid ;;
esac
CLAIM="$PACKAGE_ROOT/.execution-claim-$OPERATION_ID"
( set -C; : > "$CLAIM" ) 2>/dev/null || fail remote_replay_or_ambiguous_execution
/usr/bin/chmod 600 "$CLAIM"; /usr/bin/sync -f "$CLAIM"; /usr/bin/sync -f "$PACKAGE_ROOT"
run_immutable_controller(){ /usr/bin/node "$PACKAGE_ROOT/controller/tools/auto-runner/semantic-recovery-native-install.mjs" "$@" < "$PACKAGE_ROOT/source-hint.json"; }
validate_controller_json(){ local value="$1" expected="$2" canonical; [ "$(/usr/bin/printf '%s' "$value" | /usr/bin/wc -c)" -le 4096 ] || fail controller_output_oversized; canonical=$(/usr/bin/printf '%s' "$value" | /usr/bin/jq -ceS .) || fail controller_output_invalid; [ "$canonical" = "$value" ] || fail controller_output_noncanonical; [ "$(/usr/bin/printf '%s' "$value" | /usr/bin/jq -er .reasonCode)" = "$expected" ] || fail controller_output_reason_mismatch; }
verify_all_held_locks(){ :; }
absence_gate_pre_arm(){ :; }
validate_installed_readback(){ emit native_install_execute_requires_installed_readback; exit 75; }
persist_result(){ return 1; }
run_execute(){
  local admin_outcome=not_started resume_reason=not_started LAST_PROTECTED_OUTCOME=not_started FAILURE_REASON=none
` + controller + String.raw`
}
run_execute
emit native_install_execute_completed
`;
}

function normalizeGenerationRequest(value) {
  assertExactKeys(value, ["branch", "handoffRoot", "remoteHandoffRoot", "remoteHost", "repository", "repositoryRoot", "sourceCommit", "sourceTree"]);
  const normalized = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, String(child || "")]));
  if (!path.isAbsolute(normalized.repositoryRoot) || !path.isAbsolute(normalized.handoffRoot)
      || !repositoryPattern.test(normalized.repository) || !branchPattern.test(normalized.branch)
      || !oidPattern.test(normalized.sourceCommit) || !oidPattern.test(normalized.sourceTree)
      || !hostPattern.test(normalized.remoteHost) || !absoluteRemotePathPattern.test(normalized.remoteHandoffRoot)
      || normalized.remoteHandoffRoot.includes("..") || normalized.remoteHandoffRoot.endsWith("/")) throw new Error("handoff generation request invalid");
  return deepFreeze(normalized);
}
function fileRecord(entry) { return { byteCount: entry.bytes.length, mode: entry.mode.toString(8).padStart(4, "0"), path: entry.path, sha256: sha256(entry.bytes) }; }
function comparePath(left, right) { return left.path < right.path ? -1 : left.path > right.path ? 1 : 0; }
function timestampKeyFromDate(value) { const hkt = new Date(value.getTime() + 8 * 60 * 60 * 1000).toISOString(); return hkt.replace(/[-:]/gu, "").slice(0, 8) + "-" + hkt.slice(11, 16).replace(":", ""); }
function randomHex(random, size, label) { const bytes = Buffer.from(random(size)); if (bytes.length !== size) throw new Error(`handoff ${label} entropy invalid`); return bytes.toString("hex"); }
function parseCanonicalJson(bytes) { const text = Buffer.from(bytes).toString("utf8"); if (!Buffer.from(text).equals(Buffer.from(bytes))) throw new Error("handoff JSON encoding invalid"); let value; try { value = JSON.parse(text); } catch { throw new Error("handoff JSON invalid"); } if (!canonicalBytes(value).equals(Buffer.from(bytes))) throw new Error("handoff JSON noncanonical"); return value; }
function canonicalBytes(value) { return Buffer.from(`${canonicalJson(value)}\n`); }
function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value) { if (Array.isArray(value)) return value.map(canonicalize); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])); return value; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function assertExactKeys(value, expected) { if (!value || typeof value !== "object" || Array.isArray(value) || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) throw new Error("handoff closed schema invalid"); }
function safeRelativePath(value) { return typeof value === "string" && value.length > 0 && value.length <= 512 && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0") && path.posix.normalize(value) === value && !value.split("/").includes(".."); }
function boundedError(error) { const value = String(error?.message || "publication_failure"); return /^[a-zA-Z0-9 _:-]{1,160}$/u.test(value) ? value : "publication_failure"; }
function deepFreeze(value) { if (value && typeof value === "object" && !Buffer.isBuffer(value) && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function runCommand(executable, args, options) { const result = spawnSync(executable, args, { ...options, maxBuffer: 32 * 1024 * 1024, timeout: 60_000 }); if (result.status !== 0 || result.error || result.stderr?.length) throw result.error || new Error("handoff Git command failed"); return result.stdout; }
function trustedGitEnvironment() { return { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" }; }
function assertSafeRepositoryRoot(root) { const info = lstatSync(root); if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(root) !== root || info.uid !== process.getuid?.() || (info.mode & 0o022) !== 0) throw new Error("handoff repository root unsafe"); }
function assertSafeDestinationRoot(root, uid, gid) { if (realpathSync(root) !== root) throw new Error("handoff destination root noncanonical"); assertOwnedDirectory(root, uid, gid); let cursor = root; while (cursor !== path.dirname(cursor)) { const info = lstatSync(cursor); const stickyShared = (info.mode & 0o1000) !== 0 && info.uid === 0; if (info.isSymbolicLink() || !info.isDirectory() || realpathSync(cursor) !== cursor || (!stickyShared && (info.mode & 0o022) !== 0) || (info.uid !== uid && info.uid !== 0)) throw new Error("handoff destination ancestry unsafe"); cursor = path.dirname(cursor); } }
function assertOwnedDirectory(target, uid, gid, exactMode) { const info = lstatSync(target); if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== uid || info.gid !== gid || realpathSync(target) !== target || (info.mode & 0o022) !== 0 || (exactMode !== undefined && (info.mode & 0o7777) !== exactMode)) throw new Error("handoff directory unsafe"); }
function ensurePrivateDirectories(root, target, uid, gid) { const relative = path.relative(root, target); let cursor = root; for (const part of relative.split(path.sep).filter(Boolean)) { cursor = path.join(cursor, part); if (!existsSync(cursor)) mkdirSync(cursor, { mode: 0o700 }); assertOwnedDirectory(cursor, uid, gid, 0o700); } }
function fsyncDirectory(target) { const fd = openSync(target, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); try { fsyncSync(fd); } finally { closeSync(fd); } }
function fsyncTree(root) { const directories = [root]; for (const relative of listRelativeFiles(root)) { const target = path.join(root, relative); const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW); try { fsyncSync(fd); } finally { closeSync(fd); } let cursor = path.dirname(target); while (cursor.startsWith(root) && !directories.includes(cursor)) { directories.push(cursor); cursor = path.dirname(cursor); } } for (const directory of directories.sort((a, b) => b.length - a.length)) fsyncDirectory(directory); }
function listRelativeFiles(root) { const found = []; const visit = (directory) => { for (const name of readdirSync(directory).sort()) { const target = path.join(directory, name); const info = lstatSync(target); if (info.isSymbolicLink()) throw new Error("handoff package symlink forbidden"); if (info.isDirectory()) visit(target); else if (info.isFile()) found.push(path.relative(root, target).split(path.sep).join("/")); else throw new Error("handoff package special file forbidden"); } }; visit(root); return found.sort(); }

export function assertCanonicalGenerationResult(value) {
  assertExactKeys(value, resultKeys);
  if (!value.noOperationalModeEntered || !value.newlyCreated || !identifierPattern.test(value.operationId)
      || !digestPattern.test(value.packageAggregateDigest) || !digestPattern.test(value.windowsLauncherSha256)) throw new Error("handoff generation result invalid");
  return true;
}
