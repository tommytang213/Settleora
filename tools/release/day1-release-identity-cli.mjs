#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { chmodSync, closeSync, constants, cpSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readlinkSync, readSync, readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bindCompiledMigrationIds,
  buildManifest,
  canonicalJson,
  computeIdentityDigest,
  containsSensitiveMaterial,
  RETENTION_DIRECTORY_TEMPLATE,
  validateCandidateId,
  validatePublicationJobDocument,
  validatePublicationJobLog,
  validatePublicationProvenance,
  validatePublicationRunDocument,
  validatePublicationRunUrl,
  validateRegistryDocument,
  validateRegistryRevision,
  validateSelectedPlatformDocument,
  validateManifest,
} from './day1-release-identity.mjs';
import { assertTrackedWorktreeMatchesHead, assertUniqueJsonMembers, createUserWebDistManifest, scanPublicArtifact } from '../ci/user-web-dist-manifest.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const invokedDirectly = Boolean(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url));
const sealedRuntime = false;
function protectedSystemCommand(candidate, expectedName) {
  const command = path.resolve(candidate);
  const resolved = realpathSync(command);
  if (path.basename(command) !== expectedName) throw new Error(`Protected command must be named ${expectedName}`);
  for (const target of new Set([command, resolved])) {
    let cursor = target;
    while (true) {
      const metadata = lstatSync(cursor);
      if (metadata.uid !== 0 || (!metadata.isSymbolicLink() && (metadata.mode & 0o022) !== 0)) throw new Error(`${expectedName} command is not protected by root-owned non-writable ancestors`);
      if (cursor === '/') break;
      cursor = path.dirname(cursor);
    }
  }
  const metadata = statSync(resolved);
  if (!metadata.isFile() || !(metadata.mode & 0o111)) throw new Error(`${expectedName} command is not a protected executable`);
  return command;
}

const gitCommand = protectedSystemCommand('/usr/bin/git', 'git');
let buildxCommand;
let ghCommand;
let pythonCommand;
const releaseCommand = (name) => {
  if (name === 'buildx') return buildxCommand ??= protectedSystemCommand('/usr/libexec/docker/cli-plugins/docker-buildx', 'docker-buildx');
  if (name === 'gh') return ghCommand ??= protectedSystemCommand('/usr/bin/gh', 'gh');
  if (name === 'python') return pythonCommand ??= protectedSystemCommand('/usr/bin/python3', 'python3');
  throw new Error(`Unknown release command ${name}`);
};
// Import-only unit-test execution must remain portable to hosted runners whose
// setup-node installation has no /usr/bin/node. Direct collector execution is
// still fail-closed on the selected runtime and every ancestor.
const systemNodeCommand = invokedDirectly
  ? protectedSystemCommand(lstatSync('/usr/bin/node', { throwIfNoEntry: false }) ? '/usr/bin/node' : process.execPath, 'node')
  : null;
let npmRuntimeChecked = false;
let pythonRuntimeChecked = false;
let dotnetRuntimeChecked = false;
const npmExec = (values, options = {}) => {
  if (!npmRuntimeChecked) {
    protectedSystemCommand('/usr/bin/npm', 'npm');
    assertSystemRuntime('/usr/lib/node_modules/npm', 'system npm runtime');
    npmRuntimeChecked = true;
  }
  return execFileSync('/usr/bin/npm', values, options);
};
const gitExec = (args, options) => execFileSync(gitCommand, ['--no-replace-objects', ...args], options);
const gitObjectId = (type, contents) => createHash('sha1').update(`${type} ${contents.length}\0`).update(contents).digest('hex');
const replacementRefs = gitExec(['for-each-ref', '--format=%(refname)', 'refs/replace'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
if (replacementRefs) throw new Error('Git replacement refs are not allowed for provenance collection');
const maxTrustedToolBytes = 256 * 1024 * 1024;
const maxAndroidArtifactBytes = 256 * 1024 * 1024;
const maxAndroidMappingBytes = 128 * 1024 * 1024;
const maxAndroidMetadataBytes = 4 * 1024 * 1024;
const maxAndroidDebugKeystoreBytes = 1024 * 1024;
const processCommit = gitExec(['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const processCommitBytes = gitExec(['cat-file', 'commit', processCommit], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
if (gitObjectId('commit', processCommitBytes) !== processCommit) throw new Error('Captured source commit Git object identity mismatch');
const processTree = gitExec(['rev-parse', `${processCommit}^{tree}`], { cwd: repoRoot, encoding: 'utf8' }).trim();
const processTreeBytes = gitExec(['cat-file', 'tree', processTree], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
if (gitObjectId('tree', processTreeBytes) !== processTree) throw new Error('Captured source tree Git object identity mismatch');
const reachableTreeListing = gitExec(['ls-tree', '-r', '-t', '-z', processTree], {
  cwd: repoRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
  maxBuffer: 256 * 1024 * 1024,
});
const reachableTreeIds = new Set();
for (const record of reachableTreeListing.subarray(0, -1).toString('utf8').split('\0')) {
  const header = record.slice(0, record.indexOf('\t'));
  const match = /^(?:040000|40000) tree ([0-9a-f]{40})$/u.exec(header);
  if (match) reachableTreeIds.add(match[1]);
}
const orderedTreeIds = [...reachableTreeIds].sort();
const reachableTreeBytes = gitExec(['cat-file', '--batch'], {
  cwd: repoRoot,
  input: `${orderedTreeIds.join('\n')}\n`,
  stdio: ['pipe', 'pipe', 'pipe'],
  maxBuffer: 256 * 1024 * 1024,
});
let treeBatchOffset = 0;
for (const treeId of orderedTreeIds) {
  const headerEnd = reachableTreeBytes.indexOf(0x0a, treeBatchOffset);
  if (headerEnd < 0) throw new Error('Reachable source tree Git batch response is incomplete');
  const match = /^([0-9a-f]{40}) tree ([0-9]+)$/u.exec(reachableTreeBytes.subarray(treeBatchOffset, headerEnd).toString('ascii'));
  if (!match || match[1] !== treeId) throw new Error('Reachable source tree Git batch response mismatch');
  const size = Number(match[2]);
  const contentsStart = headerEnd + 1;
  const contentsEnd = contentsStart + size;
  if (!Number.isSafeInteger(size) || contentsEnd >= reachableTreeBytes.length || reachableTreeBytes[contentsEnd] !== 0x0a) throw new Error('Reachable source tree Git batch size mismatch');
  const treeBytes = reachableTreeBytes.subarray(contentsStart, contentsEnd);
  if (gitObjectId('tree', treeBytes) !== treeId) throw new Error('Reachable source tree Git object identity mismatch');
  treeBatchOffset = contentsEnd + 1;
}
if (treeBatchOffset !== reachableTreeBytes.length) throw new Error('Reachable source tree Git batch response has trailing data');
const processSource = Object.freeze({
  commit: processCommit,
  tree: processTree,
});
const committedVerifierHelper = gitExec(['show', `${processSource.commit}:tools/release/sealed_android_verifier.py`], {
  cwd: repoRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
  maxBuffer: 1024 * 1024,
});
const gitBlobObjectId = (contents) => gitObjectId('blob', contents);
const committedVerifierOid = gitExec(['rev-parse', `${processSource.commit}:tools/release/sealed_android_verifier.py`], { cwd: repoRoot, encoding: 'utf8' }).trim();
if (gitBlobObjectId(committedVerifierHelper) !== committedVerifierOid) throw new Error('Committed verifier Git blob identity mismatch');

function args(values) {
  const result = { command: values[0] };
  for (let index = 1; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('Usage: day1-release-identity-cli.mjs <collect-android|assemble|validate> with required path options');
    result[key.slice(2)] = value;
  }
  return result;
}

export function safeInput(candidate, label) {
  const text = safeBytes(candidate, label).toString('utf8');
  if (containsSensitiveMaterial(text)) {
    throw new Error(`${label} contains potentially sensitive material`);
  }
  assertUniqueJsonMembers(text);
  const parsed = JSON.parse(text);
  if (containsSensitiveMaterial(canonicalJson(parsed))) {
    throw new Error(`${label} contains potentially sensitive material after JSON decoding`);
  }
  return parsed;
}

export function parseCanonicalJson(bytes, label) {
  if (!Buffer.isBuffer(bytes)) throw new Error(`${label} must be read as bytes`);
  const parsed = JSON.parse(bytes.toString('utf8'));
  if (!bytes.equals(Buffer.from(canonicalJson(parsed), 'utf8'))) {
    throw new Error(`${label} JSON must use the unique canonical serialization`);
  }
  return parsed;
}

function safeBytes(candidate, label) {
  const absolute = path.resolve(candidate);
  const maxBytes = 4 * 1024 * 1024;
  let descriptor;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.size < 1 || opened.size > maxBytes) throw new Error(`${label} exceeds its evidence size limit`);
    const chunks = [];
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let total = 0;
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      total += count;
      if (total > maxBytes) throw new Error(`${label} exceeds its evidence size limit`);
      chunks.push(Buffer.from(buffer.subarray(0, count)));
    }
    const bytes = Buffer.concat(chunks, total);
    const current = lstatSync(absolute);
    if (!opened.isFile() || current.isSymbolicLink() || current.dev !== opened.dev || current.ino !== opened.ino || realpathSync(absolute) !== absolute || bytes.length !== opened.size) {
      throw new Error(`${label} changed or resolved through indirection while being read`);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function registryReference(image) {
  const shortName = image.repository.split('/').at(-1);
  const prefix = `${shortName}:`;
  if (image.configuredTag.startsWith('sha-')) return `${image.repository}:${image.configuredTag}`;
  if (!image.configuredTag.startsWith(prefix)) throw new Error(`Configured tag ${image.configuredTag} does not belong to ${image.repository}`);
  return `${image.repository}:${image.configuredTag.slice(prefix.length)}`;
}

export function verificationRegistryReference(image, retained) {
  return retained ? `${image.repository}@${image.indexDigest}` : registryReference(image);
}

function inspect(reference, format) {
  const home = mkdtempSync('/workspace/logs/.settleora-buildx-');
  try {
    const metadata = lstatSync(home);
    if (!metadata.isDirectory() || metadata.uid !== process.getuid() || (metadata.mode & 0o077) !== 0) throw new Error('Private Buildx configuration directory could not be established');
    const dockerConfig = path.join(home, '.docker');
    mkdirSync(dockerConfig, { mode: 0o700 });
    return JSON.parse(execFileSync(releaseCommand('buildx'), ['imagetools', 'inspect', reference, '--format', format], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', HOME: home, DOCKER_CONFIG: dockerConfig, BUILDX_CONFIG: path.join(dockerConfig, 'buildx') },
    }));
  } finally {
    const metadata = lstatSync(home, { throwIfNoEntry: false });
    if (metadata?.isDirectory() && !metadata.isSymbolicLink() && metadata.uid === process.getuid()) rmSync(home, { recursive: true, force: false });
  }
}

function inspectRecord(reference) {
  return inspect(reference, '{{json .}}');
}

let verifiedRegistryPreflightIdentity;
const context = { githubAccess: null, bootstrapAccess: null };
function registryPreflightIdentity(input, retained) {
  return createHash('sha256').update(canonicalJson({
    retained,
    registryResolutionMode: input.registryResolutionMode,
    platform: input.platform,
    source: input.source,
    apiImage: input.apiImage,
    dependencyImages: input.dependencyImages,
    rollback: input.rollback,
  })).digest('hex');
}

function verifyLiveRegistryNetwork(input, retained = false) {
  if (input.registryResolutionMode !== 'live-read-only') throw new Error('CLI requires registryResolutionMode=live-read-only');
  const platform = input.platform;
  const verify = (image, label, revision) => {
    const configuredReference = registryReference(image);
    const reference = verificationRegistryReference(image, retained);
    validateRegistryDocument(image, inspectRecord(reference).manifest, platform, `${label} ${retained ? 'immutable digest' : 'configured tag'}`);
    const selected = inspectRecord(`${image.repository}@${image.platformDigest}`);
    validateSelectedPlatformDocument(image, selected, platform, label);
    if (revision) {
      validateRegistryRevision(image, selected.image, revision, label);
    }
    return reference;
  };
  const verifyPublication = (image, sourceCommit, label) => {
    const reference = verify(image, label, sourceCommit);
    const publication = validatePublicationRunUrl(image.publicationRunUrl, sourceCommit);
    const ghEnvironment = { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', GH_HOST: 'github.com', GH_CONFIG_DIR: '/nonexistent', ...(context.githubAccess ? { GH_TOKEN: context.githubAccess } : {}) };
    const ghApi = (endpoint, options = {}) => execFileSync(releaseCommand('gh'), ['api', '--hostname', 'github.com', endpoint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: ghEnvironment, ...options });
    const run = JSON.parse(ghApi(`repos/tommytang213/Settleora/actions/runs/${publication.runId}`));
    validatePublicationRunDocument(publication, run, sourceCommit);
    const jobs = JSON.parse(ghApi(`repos/tommytang213/Settleora/actions/runs/${publication.runId}/jobs?per_page=100`));
    const jobId = validatePublicationJobDocument(jobs, sourceCommit);
    const jobLog = ghApi(`repos/tommytang213/Settleora/actions/jobs/${jobId}/logs`, { maxBuffer: 32 * 1024 * 1024 });
    validatePublicationJobLog(jobLog, image, sourceCommit);
    const provenance = inspect(reference, '{{json .Provenance.SLSA}}');
    validatePublicationProvenance(publication, provenance, sourceCommit, image);
    validateRegistryDocument(image, inspectRecord(reference).manifest, platform, `${label} after provenance`);
  };
  verifyPublication(input.apiImage, input.source.commit, 'apiImage');
  for (const image of input.dependencyImages) verify(image, `dependencyImages.${image.name}`);
  verifyPublication(input.rollback.apiImage, input.rollback.sourceCommit, 'rollback.apiImage');
}

function verifyLiveRegistry(input, retained = false) {
  if (verifiedRegistryPreflightIdentity !== registryPreflightIdentity(input, retained)) {
    throw new Error('Live registry evidence was not preflighted before the credential-free build phase');
  }
}

function trustedFile(candidate, expectedName, label, executable = false) {
  const tool = path.resolve(candidate ?? '');
  const metadata = lstatSync(tool, { throwIfNoEntry: false });
  if (path.basename(tool) !== expectedName || !metadata?.isFile() || metadata.isSymbolicLink() || realpathSync(tool) !== tool || (executable && !(metadata.mode & 0o111))) {
    throw new Error(`${label} must be an explicitly trusted real ${executable ? 'executable' : 'file'} named ${expectedName}`);
  }
  let descriptor;
  try {
    descriptor = openSync(tool, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || opened.size < 1n || opened.size > BigInt(maxTrustedToolBytes)) throw new Error(`${label} exceeds its trusted-tool size limit`);
    const digest = createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let total = 0n;
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      total += BigInt(count);
      if (total > BigInt(maxTrustedToolBytes)) throw new Error(`${label} exceeds its trusted-tool size limit`);
      digest.update(buffer.subarray(0, count));
    }
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(tool, { bigint: true });
    if (total !== opened.size || after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size
      || after.mtimeNs !== opened.mtimeNs || after.ctimeNs !== opened.ctimeNs || current.isSymbolicLink()
      || current.dev !== opened.dev || current.ino !== opened.ino || current.size !== opened.size
      || current.mtimeNs !== opened.mtimeNs || current.ctimeNs !== opened.ctimeNs) {
      throw new Error(`${label} changed while its trusted bytes were captured`);
    }
    return {
      path: tool,
      dev: metadata.dev,
      ino: metadata.ino,
      size: metadata.size,
      mtimeMs: metadata.mtimeMs,
      ctimeMs: metadata.ctimeMs,
      sha256: digest.digest('hex'),
    };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function trustedTool(candidate, expectedName, label) {
  return trustedFile(candidate, expectedName, label, true);
}

function openVerifiedTool(tool, label) {
  const descriptor = openSync(tool.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor);
    const current = lstatSync(tool.path);
    const digest = createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let offset = 0;
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, offset);
      if (count === 0) break;
      offset += count;
      if (offset > maxTrustedToolBytes) throw new Error(`${label} exceeds its trusted-tool size limit`);
      digest.update(buffer.subarray(0, count));
    }
    if (!opened.isFile() || current.isSymbolicLink() || realpathSync(tool.path) !== tool.path
      || opened.dev !== tool.dev || opened.ino !== tool.ino || opened.size !== tool.size
      || opened.mtimeMs !== tool.mtimeMs || opened.ctimeMs !== tool.ctimeMs
      || current.dev !== tool.dev || current.ino !== tool.ino || current.size !== tool.size
      || current.mtimeMs !== tool.mtimeMs || current.ctimeMs !== tool.ctimeMs
      || digest.digest('hex') !== tool.sha256) {
      throw new Error(`${label} changed after its trusted identity was captured`);
    }
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function revalidateToolDescriptor(tool, descriptor, label) {
  const opened = fstatSync(descriptor);
  const current = lstatSync(tool.path);
  if (!opened.isFile() || current.isSymbolicLink() || realpathSync(tool.path) !== tool.path
    || opened.dev !== tool.dev || opened.ino !== tool.ino || opened.size !== tool.size
    || opened.mtimeMs !== tool.mtimeMs || opened.ctimeMs !== tool.ctimeMs
    || current.dev !== tool.dev || current.ino !== tool.ino || current.size !== tool.size
    || current.mtimeMs !== tool.mtimeMs || current.ctimeMs !== tool.ctimeMs) {
    throw new Error(`${label} changed during sealed execution`);
  }
}

function executeSealedTool(executable, values, options = {}, additionalFiles = []) {
  const tools = [executable, ...additionalFiles];
  const descriptors = [];
  let executionError;
  try {
    for (const [index, tool] of tools.entries()) descriptors.push(openVerifiedTool(tool, index === 0 ? 'Executable' : 'Executable input'));
    let result;
    try {
      result = execFileSync('/proc/self/fd/3', values, {
        ...options,
        stdio: [...(options.stdio ?? ['ignore', 'inherit', 'pipe']).slice(0, 3), ...descriptors],
      });
    } catch (error) {
      executionError = error;
    }
    for (const [index, tool] of tools.entries()) revalidateToolDescriptor(tool, descriptors[index], index === 0 ? 'Executable' : 'Executable input');
    if (executionError) throw executionError;
    return result;
  } finally {
    for (const descriptor of descriptors) closeSync(descriptor);
  }
}

function assertRootProtectedTool(tool, expectedPath, label) {
  if (tool.path !== expectedPath) throw new Error(`${label} must resolve to ${expectedPath}`);
  let cursor = tool.path;
  while (true) {
    const metadata = lstatSync(cursor);
    if (metadata.uid !== 0 || (metadata.mode & 0o022) !== 0) throw new Error(`${label} must be protected by root-owned non-writable ancestors`);
    if (cursor === '/') break;
    cursor = path.dirname(cursor);
  }
}

function trustedDotnet() {
  const expected = '/usr/lib/dotnet/dotnet';
  const tool = trustedTool(expected, 'dotnet', 'dotnet runtime');
  assertRootProtectedTool(tool, expected, 'dotnet runtime');
  if (!dotnetRuntimeChecked) {
    assertSystemRuntime('/usr/lib/dotnet', 'system .NET runtime');
    dotnetRuntimeChecked = true;
  }
  return tool;
}

function trustedFlutter(candidate) {
  const launcher = trustedTool(candidate, 'flutter', 'Flutter launcher');
  const root = path.dirname(path.dirname(launcher.path));
  return {
    root,
    dart: trustedTool(path.join(root, 'bin/cache/dart-sdk/bin/dart'), 'dart', 'Flutter Dart runtime'),
    snapshot: trustedFile(path.join(root, 'bin/cache/flutter_tools.snapshot'), 'flutter_tools.snapshot', 'Flutter tool snapshot'),
  };
}

function executeSealedFlutter(flutter, values, cwd) {
  return executeSealedTool(flutter.dart, ['/proc/self/fd/4', ...values], {
    cwd,
    env: flutter.environment ?? { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', FLUTTER_ROOT: flutter.root },
    stdio: undefined,
  }, [flutter.snapshot]);
}

export function toolchainTreeDigest(root, label, excludedPrefixes = [], excludedTransientBases = [], protectedExternalSymlinks = false) {
  const absoluteRoot = path.resolve(root);
  const canonicalExcludedPaths = [...new Set(excludedPrefixes)].sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  const canonicalTransientBases = [...new Set(excludedTransientBases)].sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  if ([...canonicalExcludedPaths, ...canonicalTransientBases].some((entry) => typeof entry !== 'string' || !entry || entry.startsWith('/') || entry.includes('\\')
    || entry.split('/').some((part) => !part || part === '.' || part === '..'))) throw new Error(`${label} exclusion inventory contains an unsafe path`);
  const excluded = (relative) => canonicalExcludedPaths.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`))
    || canonicalTransientBases.some((base) => (relative.startsWith(`${base}.tmp.`) && /^[0-9]+$/u.test(relative.slice(base.length + 5)))
      || (relative.startsWith(`${base}-`) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/.*)?$/u.test(relative.slice(base.length + 1))));
  const rootMetadata = lstatSync(absoluteRoot, { throwIfNoEntry: false });
  if (!rootMetadata?.isDirectory() || rootMetadata.isSymbolicLink() || realpathSync(absoluteRoot) !== absoluteRoot) throw new Error(`${label} root is not a stable directory`);
  const records = [];
  let fileCount = 0;
  let directoryCount = 1;
  let symlinkCount = 0;
  let entryCount = 1;
  let totalBytes = 0;
  const activeDirectories = new Set();
  const walk = (directory, depth, logicalDirectory = '') => {
    if (depth > 64) throw new Error(`${label} exceeds its directory-depth boundary`);
    const directoryMetadata = statSync(directory);
    const directoryIdentity = `${directoryMetadata.dev}:${directoryMetadata.ino}`;
    if (activeDirectories.has(directoryIdentity)) throw new Error(`${label} contains a directory-symlink cycle`);
    activeDirectories.add(directoryIdentity);
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => Buffer.from(left.name).compare(Buffer.from(right.name)));
    try { for (const entry of entries) {
      entryCount += 1;
      if (entryCount > 250_000) throw new Error(`${label} exceeds its total-entry boundary`);
      const target = path.join(directory, entry.name);
      const relative = logicalDirectory ? `${logicalDirectory}/${entry.name}` : entry.name;
      if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error(`${label} contains an unsafe path`);
      if (excluded(relative)) continue;
      const metadata = lstatSync(target);
      if (metadata.isDirectory()) {
        directoryCount += 1;
        if (directoryCount > 100_000) throw new Error(`${label} exceeds its directory-count boundary`);
        walk(target, depth + 1, relative);
      } else if (metadata.isSymbolicLink()) {
        symlinkCount += 1;
        if (symlinkCount > 100_000) throw new Error(`${label} exceeds its symlink-count boundary`);
        const link = readlinkSync(target);
        const resolved = path.resolve(path.dirname(target), link);
        const resolvedRelative = path.relative(absoluteRoot, resolved).split(path.sep).join('/');
        const resolvedExternal = resolvedRelative.startsWith('..') || path.isAbsolute(resolvedRelative);
        if (resolvedExternal && !protectedExternalSymlinks) throw new Error(`${label} contains an external symlink`);
        let realResolved;
        try {
          realResolved = realpathSync(target);
        } catch (error) {
          if (protectedExternalSymlinks && error?.code === 'ENOENT') {
            records.push(`broken-protected-link\0${relative}\0${link}\n`);
            continue;
          }
          throw error;
        }
        const realResolvedRelative = path.relative(absoluteRoot, realResolved).split(path.sep).join('/');
        const realResolvedExternal = realResolvedRelative.startsWith('..') || path.isAbsolute(realResolvedRelative);
        if (realResolvedExternal && !protectedExternalSymlinks) throw new Error(`${label} contains an external symlink`);
        if ((!resolvedExternal && excluded(resolvedRelative)) || (!realResolvedExternal && excluded(realResolvedRelative))) {
          throw new Error(`${label} contains a symlink into an excluded directory`);
        }
        const resolvedMetadata = statSync(realResolved);
        if (realResolvedExternal && resolvedMetadata.isFile()) {
          const bytes = readFileSync(realResolved);
          fileCount += 1;
          totalBytes += bytes.length;
          if (fileCount > 100_000 || totalBytes > 12 * 1024 * 1024 * 1024) throw new Error(`${label} exceeds its inventory boundary`);
          records.push(`protected-external-file\0${relative}\0${resolvedMetadata.mode & 0o111 ? 'x' : '-'}\0${bytes.length}\0${createHash('sha256').update(bytes).digest('hex')}\n`);
        } else if (realResolvedExternal && resolvedMetadata.isDirectory()) {
          records.push(`protected-external-directory-link\0${relative}\0${link}\n`);
          directoryCount += 1;
          if (directoryCount > 100_000) throw new Error(`${label} exceeds its directory-count boundary`);
          walk(realResolved, depth + 1, relative);
        } else {
          records.push(`link\0${relative}\0${link}\n`);
        }
      } else if (metadata.isFile()) {
        fileCount += 1;
        totalBytes += metadata.size;
        if (fileCount > 100_000 || totalBytes > 12 * 1024 * 1024 * 1024) throw new Error(`${label} exceeds its inventory boundary`);
        const descriptor = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const opened = fstatSync(descriptor);
          const digest = createHash('sha256');
          const buffer = Buffer.allocUnsafe(1024 * 1024);
          let offset = 0;
          while (true) {
            const count = readSync(descriptor, buffer, 0, buffer.length, offset);
            if (count === 0) break;
            offset += count;
            digest.update(buffer.subarray(0, count));
          }
          const after = fstatSync(descriptor);
          const current = lstatSync(target);
          if (offset !== opened.size || after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size
            || current.isSymbolicLink() || current.dev !== opened.dev || current.ino !== opened.ino || current.size !== opened.size) throw new Error(`${label} changed during inventory`);
          records.push(`file\0${relative}\0${opened.mode & 0o111 ? 'x' : '-'}\0${opened.size}\0${digest.digest('hex')}\n`);
        } finally {
          closeSync(descriptor);
        }
      } else {
        throw new Error(`${label} contains an unsupported filesystem entry`);
      }
    } } finally { activeDirectories.delete(directoryIdentity); }
  };
  walk(absoluteRoot, 0);
  return { algorithm: protectedExternalSymlinks ? 'sha256(canonical-protected-runtime-tree-v2)' : 'sha256(canonical-stable-toolchain-tree-v3)', sha256: createHash('sha256').update(records.join('')).digest('hex'), excludedPaths: canonicalExcludedPaths, fileCount, directoryCount, symlinkCount, totalBytes };
}

function makeTreeReadOnly(root, label) {
  const visit = (candidate) => {
    const metadata = lstatSync(candidate);
    if (metadata.isSymbolicLink()) throw new Error(`${label} contains a symlink and cannot become an immutable cache`);
    if (metadata.isDirectory()) {
      for (const entry of readdirSync(candidate)) visit(path.join(candidate, entry));
      chmodSync(candidate, 0o555);
    } else if (metadata.isFile()) {
      chmodSync(candidate, metadata.mode & 0o111 ? 0o555 : 0o444);
    } else {
      throw new Error(`${label} contains an unsupported filesystem entry`);
    }
  };
  visit(root);
}

function makeRegularFilesReadOnly(root, label) {
  const visit = (candidate) => {
    const metadata = lstatSync(candidate);
    if (metadata.isSymbolicLink()) throw new Error(`${label} contains an unexpected symlink`);
    if (metadata.isDirectory()) {
      for (const entry of readdirSync(candidate)) visit(path.join(candidate, entry));
    } else if (metadata.isFile()) {
      chmodSync(candidate, metadata.mode & 0o111 ? 0o555 : 0o444);
    } else {
      throw new Error(`${label} contains an unsupported filesystem entry`);
    }
  };
  visit(root);
}

function makeTreeReadOnlyWithInternalSymlinks(root, label) {
  const absoluteRoot = realpathSync(root);
  const visit = (candidate) => {
    const metadata = lstatSync(candidate);
    if (metadata.isSymbolicLink()) {
      const resolved = realpathSync(candidate);
      const relative = path.relative(absoluteRoot, resolved);
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`${label} contains an external symlink`);
      return;
    }
    if (metadata.isDirectory()) {
      for (const entry of readdirSync(candidate)) visit(path.join(candidate, entry));
      chmodSync(candidate, 0o555);
      return;
    }
    if (!metadata.isFile()) throw new Error(`${label} contains an unsupported filesystem entry`);
    chmodSync(candidate, metadata.mode & 0o111 ? 0o555 : 0o444);
  };
  visit(absoluteRoot);
}

function makeTreeOwnerWritable(root) {
  const visit = (candidate) => {
    const metadata = lstatSync(candidate);
    if (metadata.isSymbolicLink()) return;
    if (metadata.isDirectory()) {
      chmodSync(candidate, 0o700);
      for (const entry of readdirSync(candidate)) visit(path.join(candidate, entry));
    } else if (metadata.isFile()) {
      chmodSync(candidate, metadata.mode & 0o111 ? 0o700 : 0o600);
    }
  };
  visit(root);
}

function relativeDirectoriesNamed(root, expectedName) {
  const result = [];
  const visit = (candidate, relative) => {
    for (const entry of readdirSync(candidate, { withFileTypes: true })) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error('Dependency cache contains a symlinked directory entry');
      if (entry.isDirectory()) {
        if (entry.name === expectedName) result.push(childRelative);
        else visit(path.join(candidate, entry.name), childRelative);
      }
    }
  };
  visit(root, '');
  return result.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
}

function relativeFilesMatching(root, expression) {
  const result = [];
  const visit = (candidate, relative) => {
    for (const entry of readdirSync(candidate, { withFileTypes: true })) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error('Dependency cache contains a symlinked entry');
      if (entry.isDirectory()) visit(path.join(candidate, entry.name), childRelative);
      else if (entry.isFile() && expression.test(childRelative)) result.push(childRelative);
      else if (!entry.isFile()) throw new Error('Dependency cache contains an unsupported entry');
    }
  };
  visit(root, '');
  return result.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
}

const guardedToolchainRunner = String.raw`
import ctypes
import fcntl
import hashlib
import json
import os
import re
import select
import signal
import struct
import subprocess
import sys
import time
import stat

configuration, commands, cwd, captures_json, sealed_outputs_json, passed_inputs_json, output_descriptors_json, command_outputs_json = sys.argv[1:9]
libc = ctypes.CDLL(None, use_errno=True)
if libc.prctl(4, 0, 0, 0, 0) != 0 or libc.prctl(36, 1, 0, 0, 0) != 0:
    raise OSError(ctypes.get_errno(), "guarded process dumpability control failed")
fd = libc.inotify_init1(os.O_CLOEXEC | os.O_NONBLOCK)
if fd < 0:
    raise OSError(ctypes.get_errno(), "inotify_init1 failed")
mask = 0x00000002 | 0x00000008 | 0x00000040 | 0x00000080 | 0x00000100 | 0x00000200 | 0x00000400 | 0x00000800 | 0x00004000
watches = {}

def excluded(relative, prefixes, transient_bases):
    if any(relative == prefix or relative.startswith(prefix + "/") for prefix in prefixes):
        return True
    return any(
        (relative.startswith(base + ".tmp.") and relative[len(base) + 5:].isdigit())
        or (relative.startswith(base + "-") and re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:/.*)?", relative[len(base) + 1:]) is not None)
        for base in transient_bases
    )

def tree_digest(root, prefixes, transient_bases):
    digest = hashlib.sha256()
    entry_count = 1
    total_bytes = 0
    def record(kind, relative, extra=""):
        digest.update((kind + "\0" + (relative or ".") + extra + "\n").encode("utf-8"))
    def visit(directory, logical):
        nonlocal entry_count, total_bytes
        record("dir", logical)
        for entry in sorted(os.scandir(directory), key=lambda item: os.fsencode(item.name)):
            entry_count += 1
            if entry_count > 250000:
                raise RuntimeError("guarded tree exceeds its entry boundary")
            relative = (logical + "/" + entry.name).strip("/")
            if excluded(relative, prefixes, transient_bases):
                continue
            metadata = os.stat(entry.path, follow_symlinks=False)
            if stat.S_ISLNK(metadata.st_mode):
                record("link", relative, "\0" + os.readlink(entry.path))
            elif stat.S_ISDIR(metadata.st_mode):
                visit(entry.path, relative)
            elif stat.S_ISREG(metadata.st_mode):
                total_bytes += metadata.st_size
                if total_bytes > 12 * 1024 * 1024 * 1024:
                    raise RuntimeError("guarded tree exceeds its byte boundary")
                file_digest = hashlib.sha256()
                file_fd = os.open(entry.path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
                try:
                    opened = os.fstat(file_fd)
                    if (opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns, opened.st_ctime_ns) != (metadata.st_dev, metadata.st_ino, metadata.st_size, metadata.st_mtime_ns, metadata.st_ctime_ns):
                        raise RuntimeError("guarded tree changed before inventory")
                    while True:
                        chunk = os.read(file_fd, 1024 * 1024)
                        if not chunk:
                            break
                        file_digest.update(chunk)
                    after = os.fstat(file_fd)
                finally:
                    os.close(file_fd)
                current = os.stat(entry.path, follow_symlinks=False)
                if (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns) != (metadata.st_dev, metadata.st_ino, metadata.st_size, metadata.st_mtime_ns, metadata.st_ctime_ns) or (current.st_dev, current.st_ino, current.st_size, current.st_mtime_ns, current.st_ctime_ns) != (metadata.st_dev, metadata.st_ino, metadata.st_size, metadata.st_mtime_ns, metadata.st_ctime_ns):
                    raise RuntimeError("guarded tree changed during inventory")
                record("file", relative, "\0" + str(stat.S_IMODE(metadata.st_mode)) + "\0" + str(metadata.st_size) + "\0" + file_digest.hexdigest())
            else:
                raise RuntimeError("guarded tree contains an unsupported entry")
    visit(root, "")
    return digest.hexdigest()

try:
    configuration_items = json.loads(configuration)
    for item in configuration_items:
        root = os.path.realpath(item["root"])
        label = item["label"]
        prefixes = item["excludedPrefixes"]
        transient_bases = item.get("excludedTransientBases", [])
        for directory, names, _ in os.walk(root, topdown=True, followlinks=False):
            relative_directory = os.path.relpath(directory, root).replace(os.sep, "/")
            relative_directory = "" if relative_directory == "." else relative_directory
            names[:] = [name for name in names if not excluded((relative_directory + "/" + name).strip("/"), prefixes, transient_bases)]
            encoded = os.fsencode(directory)
            watch = libc.inotify_add_watch(fd, encoded, mask)
            if watch < 0:
                raise OSError(ctypes.get_errno(), "inotify_add_watch failed")
            watches.setdefault(watch, []).append((label, relative_directory, prefixes, transient_bases))
    for item in configuration_items:
        if tree_digest(os.path.realpath(item["root"]), item["excludedPrefixes"], item.get("excludedTransientBases", [])) != item["expectedGuardDigest"]:
            raise RuntimeError(item["label"] + " changed before its authenticated guard was installed")
    changed = None
    sealed_outputs = json.loads(sealed_outputs_json)
    passed_descriptors = json.loads(passed_inputs_json)
    output_descriptors = json.loads(output_descriptors_json)
    if (any(not isinstance(candidate_fd, int) or candidate_fd < 3 or candidate_fd >= 64 for candidate_fd in [*passed_descriptors, *output_descriptors])
            or len(set(passed_descriptors)) != len(passed_descriptors)
            or len(set(output_descriptors)) != len(output_descriptors)
            or any(output_fd in passed_descriptors for output_fd in output_descriptors)
            or any(output_fd not in output_descriptors for output_fd in sealed_outputs)):
        raise RuntimeError("guarded executable descriptor allowlist is invalid")
    for candidate_fd in [*passed_descriptors, *output_descriptors]:
        os.fstat(candidate_fd)
    def drain(timeout):
        global changed
        readable, _, _ = select.select([fd], [], [], timeout)
        if readable:
            while True:
                try:
                    data = os.read(fd, 65536)
                except BlockingIOError:
                    break
                position = 0
                while position < len(data):
                    watch, event_mask, _, name_size = struct.unpack_from("iIII", data, position)
                    raw_name = data[position + 16:position + 16 + name_size].split(b"\0", 1)[0]
                    position += 16 + name_size
                    if event_mask & 0x00004000:
                        changed = "watcher:inotify-queue-overflow"
                        continue
                    contexts = watches.get(watch)
                    if contexts is None:
                        changed = "watcher:unknown-watch-event"
                        continue
                    name = os.fsdecode(raw_name)
                    for label, relative_directory, prefixes, transient_bases in contexts:
                        relative = (relative_directory + "/" + name).strip("/")
                        if not excluded(relative, prefixes, transient_bases):
                            changed = label + ":" + (relative or ".") + ":0x" + format(event_mask, "x")
                            break
                if len(data) < 65536:
                    break
    command_values = json.loads(commands)
    command_output_descriptors = json.loads(command_outputs_json)
    flattened_command_outputs = [descriptor for descriptors in command_output_descriptors for descriptor in descriptors]
    if (len(command_output_descriptors) != len(command_values)
            or any(not isinstance(descriptors, list) for descriptors in command_output_descriptors)
            or any(descriptor not in output_descriptors for descriptor in flattened_command_outputs)
            or len(set(flattened_command_outputs)) != len(flattened_command_outputs)):
        raise RuntimeError("guarded command output descriptor allowlist is invalid")
    captures = json.loads(captures_json)
    def direct_child_pids():
        result = []
        own_pid = os.getpid()
        for name in os.listdir("/proc"):
            if not name.isdigit():
                continue
            try:
                with open("/proc/" + name + "/stat", "rb") as stat_file:
                    fields = stat_file.read().rsplit(b")", 1)[1].split()
                if len(fields) >= 2 and int(fields[1]) == own_pid:
                    result.append(int(name))
            except (FileNotFoundError, ProcessLookupError, PermissionError, ValueError, IndexError):
                continue
        return result
    def terminate_orphaned_descendants():
        deadline = time.monotonic() + 2.0
        while True:
            children = direct_child_pids()
            for child_pid in children:
                try:
                    os.kill(child_pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            while True:
                try:
                    reaped, _ = os.waitpid(-1, os.WNOHANG)
                except ChildProcessError:
                    reaped = 0
                if reaped <= 0:
                    break
            remaining = direct_child_pids()
            if not remaining:
                return
            if time.monotonic() >= deadline:
                raise RuntimeError("guarded command left an unreapable descendant process")
            time.sleep(0.01)
    for command_index, values in enumerate(command_values):
        for output_fd in command_output_descriptors[command_index]:
            os.ftruncate(output_fd, 0)
            os.lseek(output_fd, 0, os.SEEK_SET)
        process = subprocess.Popen(["/proc/self/fd/3", *values], executable="/proc/self/fd/3", cwd=cwd, pass_fds=tuple([*passed_descriptors, *command_output_descriptors[command_index]]), start_new_session=True)
        while process.poll() is None:
            drain(0.05)
            if changed:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                raise RuntimeError("Android toolchain changed while release artifacts were built: " + changed)
        drain(0)
        if changed:
            raise RuntimeError("Android toolchain changed while release artifacts were built: " + changed)
        if process.returncode != 0:
            raise subprocess.CalledProcessError(process.returncode, values)
        terminate_orphaned_descendants()
        for capture in captures:
            if capture.get("afterCommand", len(command_values) - 1) == command_index:
                source_fd = os.open(capture["source"], os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
                try:
                    opened = os.fstat(source_fd)
                    if not stat.S_ISREG(opened.st_mode) or opened.st_size < 1 or opened.st_size > capture["maxBytes"]:
                        raise RuntimeError(capture["label"] + " exceeds its evidence boundary")
                    target_fd = capture.get("targetFd")
                    close_target = target_fd is None
                    if close_target:
                        target_fd = os.open(capture["target"], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o444)
                    else:
                        os.ftruncate(target_fd, 0)
                        os.lseek(target_fd, 0, os.SEEK_SET)
                    try:
                        total = 0
                        while True:
                            data = os.read(source_fd, 1024 * 1024)
                            if not data:
                                break
                            total += len(data)
                            if total > capture["maxBytes"]:
                                raise RuntimeError(capture["label"] + " exceeds its evidence size limit")
                            offset = 0
                            while offset < len(data):
                                offset += os.write(target_fd, data[offset:])
                    finally:
                        if not close_target:
                            os.fsync(target_fd)
                            os.lseek(target_fd, 0, os.SEEK_SET)
                        else:
                            os.close(target_fd)
                    after = os.fstat(source_fd)
                    current = os.lstat(capture["source"])
                    if (total != opened.st_size or after.st_dev != opened.st_dev or after.st_ino != opened.st_ino
                            or after.st_size != opened.st_size or after.st_mtime_ns != opened.st_mtime_ns
                            or after.st_ctime_ns != opened.st_ctime_ns or current.st_dev != opened.st_dev
                            or current.st_ino != opened.st_ino or current.st_size != opened.st_size
                            or current.st_mtime_ns != opened.st_mtime_ns or current.st_ctime_ns != opened.st_ctime_ns):
                        raise RuntimeError(capture["label"] + " changed while its descriptor was sealed")
                finally:
                    os.close(source_fd)
        quiet_deadline = time.monotonic() + 2.0
        while time.monotonic() < quiet_deadline:
            drain(min(0.05, quiet_deadline - time.monotonic()))
        if changed:
            raise RuntimeError("Android toolchain changed while release artifacts were built: " + changed)
        terminate_orphaned_descendants()
    for output_fd in sealed_outputs:
        fcntl.fcntl(output_fd, fcntl.F_ADD_SEALS, fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL)
        required_seals = fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL
        if fcntl.fcntl(output_fd, fcntl.F_GET_SEALS) & required_seals != required_seals:
            raise RuntimeError("captured evidence descriptor is not write sealed")
    for item in configuration_items:
        if tree_digest(os.path.realpath(item["root"]), item["excludedPrefixes"], item.get("excludedTransientBases", [])) != item["expectedGuardDigest"]:
            raise RuntimeError(item["label"] + " changed before the authenticated guard completed")
finally:
    try:
        if "terminate_orphaned_descendants" in locals():
            terminate_orphaned_descendants()
    finally:
        os.close(fd)
`;

function guardedTreeDigest(root, excludedPrefixes = [], excludedTransientBases = []) {
  const excluded = (relative) => excludedPrefixes.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`))
    || excludedTransientBases.some((base) => (relative.startsWith(`${base}.tmp.`) && /^[0-9]+$/u.test(relative.slice(base.length + 5)))
      || (relative.startsWith(`${base}-`) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/.*)?$/u.test(relative.slice(base.length + 1))));
  const digest = createHash('sha256');
  let entryCount = 1;
  let totalBytes = 0;
  const record = (kind, relative, extra = '') => digest.update(`${kind}\0${relative || '.'}${extra}\n`);
  const visit = (directory, logical) => {
    record('dir', logical);
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => Buffer.from(left.name).compare(Buffer.from(right.name)))) {
      entryCount += 1;
      if (entryCount > 250_000) throw new Error('Guarded tree exceeds its entry boundary');
      const relative = logical ? `${logical}/${entry.name}` : entry.name;
      if (excluded(relative)) continue;
      const target = path.join(directory, entry.name);
      const before = lstatSync(target, { bigint: true });
      if (before.isSymbolicLink()) record('link', relative, `\0${readlinkSync(target)}`);
      else if (before.isDirectory()) visit(target, relative);
      else if (before.isFile()) {
        totalBytes += Number(before.size);
        if (!Number.isSafeInteger(totalBytes) || totalBytes > 12 * 1024 * 1024 * 1024) throw new Error('Guarded tree exceeds its byte boundary');
        const descriptor = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const fileDigest = createHash('sha256');
          const buffer = Buffer.allocUnsafe(1024 * 1024);
          let offset = 0n;
          while (true) {
            const count = readSync(descriptor, buffer, 0, buffer.length, null);
            if (count === 0) break;
            offset += BigInt(count);
            fileDigest.update(buffer.subarray(0, count));
          }
          const after = fstatSync(descriptor, { bigint: true });
          const current = lstatSync(target, { bigint: true });
          if (offset !== before.size || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
            || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs || current.isSymbolicLink()
            || current.dev !== before.dev || current.ino !== before.ino || current.size !== before.size
            || current.mtimeNs !== before.mtimeNs || current.ctimeNs !== before.ctimeNs) throw new Error('Guarded tree changed during inventory');
          record('file', relative, `\0${before.mode & 0o7777n}\0${before.size}\0${fileDigest.digest('hex')}`);
        } finally {
          closeSync(descriptor);
        }
      } else throw new Error('Guarded tree contains an unsupported entry');
    }
  };
  visit(path.resolve(root), '');
  return digest.digest('hex');
}

function executeGuardedCommands(configuration, executable, inputs, commands, options) {
  const authenticatedConfiguration = configuration.map((item) => {
    const expectedGuardDigest = item.expectedGuardDigest ?? guardedTreeDigest(item.root, item.excludedPrefixes, item.excludedTransientBases ?? []);
    item.expectedGuardDigest = expectedGuardDigest;
    return { ...item, expectedGuardDigest };
  });
  const tools = [executable, ...inputs];
  const descriptors = tools.map((tool) => openSync(tool.path, constants.O_RDONLY | constants.O_NOFOLLOW));
  try {
    for (const [index, tool] of tools.entries()) revalidateToolDescriptor(tool, descriptors[index], index === 0 ? 'Guarded executable' : 'Guarded executable input');
    const outputDescriptors = options.outputDescriptors ?? [];
    const inheritedOutputDescriptors = outputDescriptors.map((_descriptor, index) => 3 + descriptors.length + index);
    const captures = (options.captures ?? []).map((capture) => capture.outputDescriptorIndex === undefined
      ? capture
      : { ...capture, targetFd: inheritedOutputDescriptors[capture.outputDescriptorIndex], target: undefined });
    const inheritedInputDescriptors = descriptors.map((_descriptor, index) => 3 + index);
    const commandOutputDescriptors = (options.commandOutputDescriptorIndexes ?? commands.map(() => []))
      .map((indexes) => indexes.map((index) => inheritedOutputDescriptors[index]));
    const result = execFileSync(releaseCommand('python'), ['-I', '-S', '-c', guardedToolchainRunner, JSON.stringify(authenticatedConfiguration), JSON.stringify(commands), options.cwd, JSON.stringify(captures), JSON.stringify(options.sealOutputDescriptors ? inheritedOutputDescriptors : []), JSON.stringify(inheritedInputDescriptors), JSON.stringify(inheritedOutputDescriptors), JSON.stringify(commandOutputDescriptors)], {
      cwd: '/usr/bin',
      env: options.env,
      encoding: options.encoding,
      maxBuffer: options.maxBuffer,
      stdio: [...(options.stdio ?? ['ignore', 'inherit', 'inherit']).slice(0, 3), ...descriptors, ...outputDescriptors],
    });
    for (const [index, tool] of tools.entries()) revalidateToolDescriptor(tool, descriptors[index], index === 0 ? 'Guarded executable' : 'Guarded executable input');
    return result;
  } finally {
    for (const descriptor of descriptors) closeSync(descriptor);
  }
}

function executeGuardedFlutter(flutter, commandSets, cwd, configuration, captures = []) {
  const outputDescriptors = captures.map((capture) => capture.descriptor).filter((descriptor) => descriptor !== undefined);
  const normalizedCaptures = captures.map((capture, index) => capture.descriptor === undefined ? capture : {
    ...capture,
    descriptor: undefined,
    outputDescriptorIndex: index,
  });
  executeGuardedCommands(configuration, flutter.dart, [flutter.snapshot], commandSets.map((values) => ['/proc/self/fd/4', ...values]), {
    cwd,
    env: flutter.environment,
    captures: normalizedCaptures,
    outputDescriptors,
    sealOutputDescriptors: outputDescriptors.length > 0,
  });
}

function copySealedDescriptor(descriptor, target, maxBytes, label) {
  const metadata = fstatSync(descriptor);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > maxBytes) throw new Error(`${label} sealed descriptor exceeds its evidence boundary`);
  const targetDescriptor = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o444);
  const digest = createHash('sha256');
  let offset = 0;
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    while (offset < metadata.size) {
      const count = readSync(descriptor, buffer, 0, Math.min(buffer.length, metadata.size - offset), offset);
      if (!count) throw new Error(`${label} sealed descriptor ended early`);
      digest.update(buffer.subarray(0, count));
      let written = 0;
      while (written < count) written += writeSync(targetDescriptor, buffer, written, count - written);
      offset += count;
    }
  } finally {
    closeSync(targetDescriptor);
  }
  return { size: metadata.size, sha256: digest.digest('hex') };
}

export function runToolchainMutationGuardFixture(configuration, script) {
  const pythonPath = realpathSync(releaseCommand('python'));
  const python = trustedTool(pythonPath, path.basename(pythonPath), 'system Python');
  executeGuardedCommands(configuration, python, [], [['-I', '-S', '-c', script]], {
    cwd: '/usr/bin',
    env: { PATH: '/usr/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
  });
}

export function runGuardedOutputDescriptorFixture(configuration, outputPath) {
  const pythonPath = realpathSync(releaseCommand('python'));
  const python = trustedTool(pythonPath, path.basename(pythonPath), 'system Python');
  const descriptor = openSync(outputPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  try {
    const delayedReopen = `import os, time
guard_pid = os.getppid()
with open(f"/proc/{guard_pid}/stat", "r", encoding="ascii") as stat_file: node_pid = int(stat_file.read().split()[3])
try:
    prewrite = os.open(f"/proc/{node_pid}/fd/${descriptor}", os.O_WRONLY)
    os.write(prewrite, b"untrusted prewrite" * 1000)
    os.close(prewrite)
except OSError:
    pass
child = os.fork()
if child == 0:
    import ctypes
    os.setsid()
    ctypes.CDLL(None).prctl(15, b"\\xfforphan", 0, 0, 0)
    time.sleep(3.2)
    try:
        reopened = os.open(f"/proc/{node_pid}/fd/${descriptor}", os.O_WRONLY)
        os.write(reopened, b"forged output")
        os.close(reopened)
    except OSError:
        pass
    os._exit(0)`;
    executeGuardedCommands(configuration, python, [], [
      ['-I', '-S', '-c', `import os
try: os.fstat(4)
except OSError: pass
else: raise RuntimeError("output descriptor leaked to non-writer command")
try: reopened = os.open(f"/proc/{os.getppid()}/fd/4", os.O_WRONLY)
except OSError: pass
else: os.close(reopened); raise RuntimeError("output descriptor reopened from guard process")
${delayedReopen}`],
      ['-I', '-S', '-c', 'import os; os.write(4, b"guarded output")'],
    ], {
      cwd: '/usr/bin',
      env: { PATH: '/usr/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
      outputDescriptors: [descriptor],
      commandOutputDescriptorIndexes: [[], [0]],
    });
  } finally {
    closeSync(descriptor);
  }
  return readFileSync(outputPath, 'utf8');
}

export function runGuardedFailureDescendantFixture(configuration, markerPath) {
  const pythonPath = realpathSync(releaseCommand('python'));
  const python = trustedTool(pythonPath, path.basename(pythonPath), 'system Python');
  const script = `import os, time
child = os.fork()
if child == 0:
    os.setsid()
    time.sleep(0.5)
    with open(${JSON.stringify(markerPath)}, "w", encoding="utf-8") as marker: marker.write("survived")
    os._exit(0)
os._exit(7)`;
  let rejected = false;
  try {
    executeGuardedCommands(configuration, python, [], [['-I', '-S', '-c', script]], {
      cwd: '/usr/bin',
      env: { PATH: '/usr/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
    });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('Guarded failing-command fixture unexpectedly succeeded');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 700);
  return !lstatSync(markerPath, { throwIfNoEntry: false });
}

function assertSystemRuntime(root, label = 'Java runtime') {
  const visited = new Set();
  const assertProtectedAncestorChain = (missing) => {
    let existing = path.dirname(missing);
    while (!lstatSync(existing, { throwIfNoEntry: false })) {
      const parent = path.dirname(existing);
      if (parent === existing) throw new Error(`${label} broken symlink has no protected ancestor`);
      existing = parent;
    }
    const assertChain = (candidate) => {
      let cursor = '/';
      for (const part of candidate.split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        const metadata = lstatSync(cursor);
        if (metadata.uid !== 0 || (!metadata.isSymbolicLink() && (metadata.mode & 0o022) !== 0)) {
          throw new Error(`${label} broken symlink target is not protected by system-owned ancestors`);
        }
      }
    };
    assertChain(existing);
    assertChain(realpathSync(existing));
  };
  const visit = (candidate) => {
    const metadata = lstatSync(candidate);
    if (metadata.isSymbolicLink()) {
      if (metadata.uid !== 0) throw new Error(`${label} symlink is not system-controlled`);
      let target;
      try {
        target = realpathSync(candidate);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          target = path.resolve(path.dirname(candidate), readlinkSync(candidate));
          if (lstatSync(target, { throwIfNoEntry: false })) return visit(target);
          assertProtectedAncestorChain(target);
          return;
        }
        throw error;
      }
      return visit(target);
    }
    if (metadata.uid !== 0 || (metadata.mode & 0o022) !== 0) throw new Error(`${label} must be root-owned and not writable by the invoking user, group, or others`);
    const key = `${metadata.dev}:${metadata.ino}`;
    if (visited.has(key)) return;
    visited.add(key);
    if (metadata.isDirectory()) {
      for (const entry of readdirSync(candidate)) visit(path.join(candidate, entry));
    } else if (!metadata.isFile()) {
      throw new Error(`${label} contains an unsupported filesystem entry`);
    }
  };
  let ancestor = path.resolve(root);
  while (true) {
    const metadata = lstatSync(ancestor);
    if (metadata.uid !== 0 || (!metadata.isSymbolicLink() && (metadata.mode & 0o022) !== 0)) throw new Error(`${label} root is not protected by system-owned ancestors`);
    if (ancestor === '/') break;
    ancestor = path.dirname(ancestor);
  }
  const resolvedRoot = realpathSync(root);
  ancestor = resolvedRoot;
  while (true) {
    const metadata = lstatSync(ancestor);
    if (metadata.uid !== 0 || (metadata.mode & 0o022) !== 0) throw new Error(`${label} resolved root is not protected by system-owned ancestors`);
    if (ancestor === '/') break;
    ancestor = path.dirname(ancestor);
  }
  visit(root);
}

function debugKeystoreCertificateSha256(javaHome, keystorePath) {
  const java = trustedTool(path.join(javaHome, 'bin', 'java'), 'java', 'Java runtime');
  const keystore = trustedFile(keystorePath, 'debug.keystore', 'copied Android debug signing keystore');
  const javaDescriptor = openVerifiedTool(java, 'Java runtime');
  const keystoreDescriptor = openVerifiedTool(keystore, 'copied Android debug signing keystore');
  try {
    const certificate = execFileSync(java.path, [
      '-Duser.language=en', '-Duser.country=US', 'sun.security.tools.keytool.Main',
      '-exportcert', '-keystore', '/proc/self/fd/3', '-storepass', 'android', '-alias', 'androiddebugkey',
    ], {
      cwd: '/usr/bin',
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
      stdio: ['ignore', 'pipe', 'pipe', keystoreDescriptor],
      maxBuffer: 1024 * 1024,
    });
    if (!Buffer.isBuffer(certificate) || certificate.length < 1 || certificate.length > 1024 * 1024) throw new Error('Android debug signing certificate exceeds its evidence boundary');
    return createHash('sha256').update(certificate).digest('hex');
  } finally {
    revalidateToolDescriptor(keystore, keystoreDescriptor, 'copied Android debug signing keystore');
    revalidateToolDescriptor(java, javaDescriptor, 'Java runtime');
    closeSync(keystoreDescriptor);
    closeSync(javaDescriptor);
  }
}

export function parseSingleApkSigner(output) {
  const apkDigests = [...output.matchAll(/Signer #(\d+) certificate SHA-256 digest:\s*([0-9a-f]{64})/giu)];
  const apkNames = [...output.matchAll(/Signer #(\d+) certificate DN:\s*(.+)$/gmu)];
  const signerNumbers = new Set([...apkDigests, ...apkNames].map((match) => match[1]));
  const certificate = apkDigests[0]?.[2]?.toLowerCase();
  if (apkDigests.length !== 1 || apkNames.length !== 1 || signerNumbers.size !== 1 || !signerNumbers.has('1') || !apkNames[0][2].includes('CN=Android Debug') || !certificate) {
    throw new Error('Android APK signature observation mismatch');
  }
  return certificate;
}

function sealedAndroidVerification(kind, artifact, tools, javaPath) {
  const absolute = path.resolve(artifact);
  let descriptor;
  const toolDescriptors = [];
  let result;
  try {
    const selectedPythonCommand = releaseCommand('python');
    if (!pythonRuntimeChecked) {
      const pythonRuntimeName = path.basename(realpathSync(selectedPythonCommand));
      if (!/^python3\.[0-9]+$/u.test(pythonRuntimeName)) throw new Error('System Python runtime identity is invalid');
      assertSystemRuntime(`/usr/lib/${pythonRuntimeName}`, 'system Python standard library');
      pythonRuntimeChecked = true;
    }
    descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(descriptor);
    const current = lstatSync(absolute);
    if (!opened.isFile() || current.isSymbolicLink() || current.dev !== opened.dev || current.ino !== opened.ino || realpathSync(absolute) !== absolute) throw new Error(`Android ${kind.toUpperCase()} artifact path is not stable`);
    for (const tool of tools) {
      const toolDescriptor = openSync(tool.path, constants.O_RDONLY | constants.O_NOFOLLOW);
      const toolOpened = fstatSync(toolDescriptor);
      const toolCurrent = lstatSync(tool.path);
      if (!toolOpened.isFile() || toolOpened.dev !== tool.dev || toolOpened.ino !== tool.ino || toolCurrent.isSymbolicLink() || toolCurrent.dev !== tool.dev || toolCurrent.ino !== tool.ino || realpathSync(tool.path) !== tool.path) throw new Error(`Android ${kind.toUpperCase()} verifier executable changed before use`);
      toolDescriptors.push(toolDescriptor);
    }
    result = JSON.parse(execFileSync(selectedPythonCommand, ['-I', '-S', '-', kind, javaPath, ...tools.map((tool) => tool.sha256)], {
      encoding: 'utf8',
      input: committedVerifierHelper,
      stdio: ['pipe', 'pipe', 'pipe', descriptor, ...toolDescriptors],
      cwd: '/usr/bin',
      env: { PATH: '/usr/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
      maxBuffer: 4 * 1024 * 1024,
    }));
  } finally {
    for (const toolDescriptor of toolDescriptors) closeSync(toolDescriptor);
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (!Number.isSafeInteger(result.size) || result.size < 1 || !/^[0-9a-f]{64}$/u.test(result.sha256)) throw new Error(`Android ${kind.toUpperCase()} sealed snapshot identity is invalid`);
  if (!Number.isSafeInteger(result.payloadEntryCount) || result.payloadEntryCount < 1 || !/^[0-9a-f]{64}$/u.test(result.payloadTreeSha256)) throw new Error(`Android ${kind.toUpperCase()} canonical payload identity is invalid`);
  if (!/^[0-9a-f]{64}$/u.test(result.archiveLayoutSha256) || !/^[0-9a-f]{64}$/u.test(result.compressedPayloadTreeSha256)) {
    throw new Error(`Android ${kind.toUpperCase()} archive representation identity is invalid`);
  }
  if (kind === 'aab' && !/^[0-9a-f]{64}$/u.test(result.signatureControlTreeSha256)) throw new Error('Android AAB signature-control identity is invalid');
  if (!Array.isArray(result.signatureControlEntries)
    || result.signatureControlEntries.some((entry) => typeof entry !== 'string' || !/^META-INF\/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))$/u.test(entry))
    || new Set(result.signatureControlEntries).size !== result.signatureControlEntries.length
    || canonicalJson([...result.signatureControlEntries].sort()) !== canonicalJson(result.signatureControlEntries)) {
    throw new Error(`Android ${kind.toUpperCase()} signature-control inventory is invalid`);
  }
  if (kind === 'apk' && canonicalJson(result.apkSigningBlockIds) !== canonicalJson(['42726577', '504b4453', '7109871a'])) {
    throw new Error('Android APK signing-block ID inventory is invalid');
  }
  return result;
}

function trustedApksignerJar(sdkRoot) {
  const versions = lstatSync(path.join(sdkRoot, 'build-tools'), { throwIfNoEntry: false });
  if (!versions?.isDirectory() || versions.isSymbolicLink()) throw new Error('Trusted Android SDK root is invalid');
  const version = readdirSync(path.join(sdkRoot, 'build-tools'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort(new Intl.Collator('en', { numeric: true }).compare)
    .at(-1);
  return trustedFile(path.join(sdkRoot, 'build-tools', version ?? '', 'lib', 'apksigner.jar'), 'apksigner.jar', 'Android apksigner JAR');
}

export function verifyAndroidSignature(input, options) {
  if (input.source?.commit !== processSource.commit || input.source?.tree !== processSource.tree) throw new Error('Android verifier source does not match the process-bound checkout');
  const sdkRoot = path.resolve(options['android-sdk-root'] ?? '');
  const javaHome = path.resolve(options['java-home'] ?? '');
  const java = trustedTool(path.join(javaHome, 'bin', 'java'), 'java', 'Java runtime');
  assertSystemRuntime(javaHome);
  const apksignerJar = trustedApksignerJar(sdkRoot);
  const apkObservation = sealedAndroidVerification('apk', input.android.apkPath, [apksignerJar], java.path);
  const certificate = parseSingleApkSigner(apkObservation.verificationOutput);
  const apk = { size: apkObservation.size, sha256: apkObservation.sha256 };
  const aabObservation = sealedAndroidVerification('aab', input.android.aabPath, [], java.path);
  const aab = { size: aabObservation.size, sha256: aabObservation.sha256 };
  if (aabObservation.jarVerified !== true || aabObservation.contentEntryCount < 1 || aabObservation.unsignedEntryCount !== 0) throw new Error('Android AAB contains unsigned entries');
  if (aabObservation.certificateDigests?.length !== 1 || aabObservation.certificateDigests[0] !== certificate || aabObservation.signerNames?.length !== 1 || !aabObservation.signerNames[0].includes('CN=Android Debug')) {
    throw new Error('Android AAB signature observation mismatch');
  }
  if (!/^[0-9a-f]{64}$/u.test(aabObservation.embeddedR8MappingSha256) || aabObservation.r8MetadataPresent !== true) throw new Error('Android AAB is missing embedded R8 evidence');
  for (const [kind, identity] of Object.entries({ apk, aab })) {
    const expected = input.android.expected?.[kind];
    if (expected && (expected.size !== identity.size || expected.sha256 !== identity.sha256)) throw new Error(`Android ${kind.toUpperCase()} identity mismatch during signature verification`);
  }
  return {
    certificate,
    embeddedR8MappingSha256: aabObservation.embeddedR8MappingSha256,
    apk,
    aab,
    verificationTools: { apksignerJarSha256: apksignerJar.sha256 },
    payloads: {
      apk: { sha256: apkObservation.payloadTreeSha256, count: apkObservation.payloadEntryCount, signatureControls: apkObservation.signatureControlEntries, signingBlockIds: apkObservation.apkSigningBlockIds, archiveLayoutSha256: apkObservation.archiveLayoutSha256, compressedPayloadTreeSha256: apkObservation.compressedPayloadTreeSha256 },
      aab: { sha256: aabObservation.payloadTreeSha256, count: aabObservation.payloadEntryCount, signatureControls: aabObservation.signatureControlEntries, signatureControlTreeSha256: aabObservation.signatureControlTreeSha256, archiveLayoutSha256: aabObservation.archiveLayoutSha256, compressedPayloadTreeSha256: aabObservation.compressedPayloadTreeSha256 },
    },
  };
}

export function assertCommitHasNoSymlinks(commit, label, root = repoRoot) {
  const records = new TextDecoder('utf-8', { fatal: true }).decode(gitExec(['ls-tree', '-r', '-z', commit], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }))
    .split('\0').filter(Boolean);
  if (records.some((record) => record.startsWith('120000 '))) throw new Error(`${label} source snapshot contains a tracked symlink`);
}

export function deterministicAndroidRebuildProjection(rebuilt, retained) {
  const projected = structuredClone(rebuilt);
  // Raw ZIP/signature bytes remain authoritative retained identities. A clean
  // rebuild proves the separately verified deterministic archive representation,
  // canonical payload, signer, R8 and toolchain identities before this projection.
  projected.android.apk = retained.android.apk;
  projected.android.aab = retained.android.aab;
  projected.android.buildProvenanceSha256 = retained.android.buildProvenanceSha256;
  projected.identityDigest = computeIdentityDigest(projected);
  return projected;
}

export function copyBoundedFile(source, target, maxBytes, label) {
  let sourceDescriptor;
  let targetDescriptor;
  try {
    sourceDescriptor = openSync(source, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(sourceDescriptor);
    const current = lstatSync(source);
    if (!opened.isFile() || current.isSymbolicLink() || current.dev !== opened.dev || current.ino !== opened.ino
      || realpathSync(source) !== source || !Number.isSafeInteger(opened.size) || opened.size < 1 || opened.size > maxBytes) {
      throw new Error(`${label} exceeds its evidence boundary or is not a stable regular file`);
    }
    targetDescriptor = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o444);
    const digest = createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let total = 0;
    while (true) {
      const count = readSync(sourceDescriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      total += count;
      if (total > maxBytes) throw new Error(`${label} exceeds its evidence size limit`);
      let written = 0;
      while (written < count) {
        const countWritten = writeSync(targetDescriptor, buffer, written, count - written);
        if (countWritten < 1) throw new Error(`${label} evidence copy stopped before completion`);
        written += countWritten;
      }
      digest.update(buffer.subarray(0, count));
    }
    const after = fstatSync(sourceDescriptor);
    const sourceAfter = lstatSync(source);
    if (total !== opened.size || after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs || sourceAfter.dev !== opened.dev
      || sourceAfter.ino !== opened.ino || sourceAfter.size !== opened.size || sourceAfter.mtimeMs !== opened.mtimeMs
      || sourceAfter.ctimeMs !== opened.ctimeMs) throw new Error(`${label} changed while it was copied`);
    return { size: total, sha256: digest.digest('hex') };
  } finally {
    if (targetDescriptor !== undefined) closeSync(targetDescriptor);
    if (sourceDescriptor !== undefined) closeSync(sourceDescriptor);
  }
}

function materializeExactTree(commit, destination, label) {
  const listing = gitExec(['ls-tree', '-r', '-z', commit], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  const records = new TextDecoder('utf-8', { fatal: true }).decode(listing).split('\0').filter(Boolean);
  if (records.length === 0) throw new Error(`${label} source tree is empty`);
  if (records.length > 100_000) throw new Error(`${label} source tree exceeds its file-count boundary`);
  let totalBytes = 0;
  const directories = new Set();
  for (const record of records) {
    const match = /^(100644|100755) blob ([0-9a-f]{40,64})\t(.+)$/u.exec(record);
    if (!match) throw new Error(`${label} source tree contains an unsupported entry`);
    const relative = match[3];
    if (relative.includes('\\') || relative.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error(`${label} source tree contains an unsafe path`);
    const target = path.resolve(destination, relative);
    if (path.relative(destination, target).startsWith('..') || path.isAbsolute(path.relative(destination, target))) throw new Error(`${label} source tree escapes its snapshot`);
    for (let directory = path.posix.dirname(relative); directory !== '.'; directory = path.posix.dirname(directory)) directories.add(directory);
    if (directories.size > 100_000) throw new Error(`${label} source tree exceeds its directory-count boundary`);
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    const bytes = gitExec(['cat-file', 'blob', match[2]], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: maxAndroidArtifactBytes });
    if (gitBlobObjectId(bytes) !== match[2]) throw new Error(`${label} source Git blob identity mismatch`);
    totalBytes += bytes.length;
    if (totalBytes > 4 * 1024 * 1024 * 1024) throw new Error(`${label} source tree exceeds its aggregate-byte boundary`);
    writeFileSync(target, bytes, { flag: 'wx', mode: match[1] === '100755' ? 0o755 : 0o644 });
  }
}

function exactSourceSnapshot(prefix, privateParent, callback) {
  const source = {
    commit: gitExec(['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
    tree: gitExec(['rev-parse', 'HEAD^{tree}'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
  };
  assertCleanCompletion(repoRoot, `${prefix} requires a clean exact-source checkout`);
  assertOwnedEvidenceDirectory(privateParent);
  const container = path.join(privateParent, `.settleora-${prefix}-source-${randomUUID()}`);
  const snapshot = path.join(container, 'source');
  mkdirSync(container, { recursive: false, mode: 0o700 });
  mkdirSync(snapshot, { recursive: false, mode: 0o700 });
  try {
    assertCommitHasNoSymlinks(source.commit, prefix);
    materializeExactTree(source.commit, snapshot, prefix);
    return callback(snapshot, source);
  } finally {
    const metadata = lstatSync(container, { throwIfNoEntry: false });
    if (metadata?.isDirectory() && !metadata.isSymbolicLink()) {
      makeTreeOwnerWritable(container);
      rmSync(container, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
    }
    const after = {
      commit: gitExec(['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
      tree: gitExec(['rev-parse', 'HEAD^{tree}'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
    };
    if (canonicalJson(after) !== canonicalJson(source)) throw new Error(`${prefix} source changed during collection`);
    assertCleanCompletion(repoRoot, `${prefix} source changed during collection`);
  }
}

export function collectWebExactSource(output) {
  const absolute = path.resolve(output);
  const relative = path.relative('/workspace/logs', absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('User-web evidence output must remain under /workspace/logs');
  assertNoSymlinkAncestors(absolute);
  if (lstatSync(absolute, { throwIfNoEntry: false })) throw new Error('User-web evidence output directory must not already exist');
  return exactSourceSnapshot('web', path.dirname(absolute), (snapshot, source) => {
    const webRoot = path.join(snapshot, 'apps/web-user');
    const npmHome = path.join(snapshot, '.release-npm-home');
    const npmUserConfig = path.join(npmHome, 'userconfig');
    mkdirSync(npmHome, { recursive: false, mode: 0o700 });
    writeFileSync(npmUserConfig, '', { flag: 'wx', mode: 0o600 });
    const npmEnvironment = {
      PATH: '/usr/bin:/bin',
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      HOME: npmHome,
      npm_config_cache: path.join(snapshot, '.release-npm-cache'),
      npm_config_userconfig: npmUserConfig,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    };
    makeRegularFilesReadOnly(snapshot, 'User-web exact-source snapshot');
    const webGeneratedPaths = ['.release-captured-web-dist', '.release-npm-cache', '.release-npm-home', 'apps/web-user/dist', 'apps/web-user/node_modules'];
    const webSourceGuard = { label: 'web-exact-source', root: snapshot, excludedPrefixes: webGeneratedPaths };
    const node = trustedTool('/usr/bin/node', 'node', 'system Node.js');
    const npmCli = trustedTool(realpathSync('/usr/bin/npm'), 'npm-cli.js', 'system npm CLI');
    assertSystemRuntime('/usr/lib/node_modules/npm', 'system npm runtime');
    executeGuardedCommands(
      [webSourceGuard],
      node,
      [npmCli],
      [['/proc/self/fd/4', 'ci']],
      { cwd: webRoot, env: npmEnvironment, stdio: ['ignore', 'inherit', 'inherit'] },
    );
    const nodeModules = path.join(webRoot, 'node_modules');
    makeTreeReadOnlyWithInternalSymlinks(nodeModules, 'User-web installed dependency tree');
    const nodeModulesIdentity = toolchainTreeDigest(nodeModules, 'User-web installed dependency tree');
    const capturePath = path.join(path.dirname(absolute), `.release-web-capture-${randomUUID()}`);
    const captureDescriptor = sealedRuntime ? 4 : openSync(capturePath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
    if (!sealedRuntime) unlinkSync(capturePath);
    let capturedBytes;
    try {
      const captureFd = 3 + 2;
      const captureProgram = `
import { lstatSync, openSync, closeSync, readSync, readdirSync, writeSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[1]);
const files = [];
let directories = 1;
let total = 0;
const visit = (directory, logical = '', depth = 0) => {
  if (depth > 64 || directories > 10000) throw new Error('web capture exceeds its directory boundary');
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => Buffer.from(a.name).compare(Buffer.from(b.name)))) {
    const relative = logical ? logical + '/' + entry.name : entry.name;
    const target = path.join(directory, entry.name);
    const metadata = lstatSync(target);
    if (metadata.isSymbolicLink()) throw new Error('web capture rejects symlinks');
    if (metadata.isDirectory()) { directories += 1; visit(target, relative, depth + 1); continue; }
    if (!metadata.isFile() || files.length >= 10000 || metadata.size > 32 * 1024 * 1024) throw new Error('web capture exceeds its file boundary');
    total += metadata.size;
    if (total > 128 * 1024 * 1024) throw new Error('web capture exceeds its byte boundary');
    const fd = openSync(target, 0x20000);
    try {
      const bytes = Buffer.alloc(metadata.size);
      let offset = 0;
      while (offset < bytes.length) { const count = readSync(fd, bytes, offset, bytes.length - offset, offset); if (!count) throw new Error('web capture changed during read'); offset += count; }
      const after = lstatSync(target);
      if (after.dev !== metadata.dev || after.ino !== metadata.ino || after.size !== metadata.size || after.mtimeMs !== metadata.mtimeMs || after.ctimeMs !== metadata.ctimeMs) throw new Error('web capture changed during read');
      files.push({ path: relative, size: metadata.size, base64: bytes.toString('base64') });
    } finally { closeSync(fd); }
  }
};
visit(root);
files.sort((a, b) => Buffer.from(a.path).compare(Buffer.from(b.path)));
const payload = Buffer.from(JSON.stringify(files));
let written = 0;
while (written < payload.length) written += writeSync(${captureFd}, payload, written, payload.length - written);
`;
      executeGuardedCommands(
        [webSourceGuard, { label: 'web-installed-dependencies', root: nodeModules, excludedPrefixes: [] }],
        node,
        [npmCli],
        [['/proc/self/fd/4', 'run', 'build', '--', '--configLoader', 'runner'], ['--input-type=module', '--eval', captureProgram, path.join(webRoot, 'dist')]],
        { cwd: webRoot, env: npmEnvironment, stdio: ['ignore', 'inherit', 'inherit'], outputDescriptors: [captureDescriptor], commandOutputDescriptorIndexes: [[], [0]], sealOutputDescriptors: sealedRuntime },
      );
      if (canonicalJson(toolchainTreeDigest(nodeModules, 'User-web installed dependency tree')) !== canonicalJson(nodeModulesIdentity)) throw new Error('User-web installed dependency tree changed during build');
      const metadata = fstatSync(captureDescriptor);
      if (!metadata.isFile() || metadata.size < 2 || metadata.size > 180 * 1024 * 1024) throw new Error('User-web captured package exceeds its evidence boundary');
      capturedBytes = Buffer.alloc(metadata.size);
      let offset = 0;
      while (offset < capturedBytes.length) {
        const count = readSync(captureDescriptor, capturedBytes, offset, capturedBytes.length - offset, offset);
        if (!count) throw new Error('User-web captured package is incomplete');
        offset += count;
      }
    } finally {
      if (!sealedRuntime) closeSync(captureDescriptor);
    }
    assertUniqueJsonMembers(capturedBytes.toString('utf8'));
    const capturedFiles = JSON.parse(capturedBytes);
    if (!Array.isArray(capturedFiles) || capturedFiles.length < 1 || capturedFiles.length > 10_000) throw new Error('User-web captured file inventory is invalid');
    const capturedDist = path.join(snapshot, '.release-captured-web-dist');
    mkdirSync(capturedDist, { recursive: false, mode: 0o700 });
    let capturedTotalBytes = 0;
    let previousCapturedPath = '';
    for (const record of capturedFiles) {
      if (!record || canonicalJson(Object.keys(record).sort()) !== canonicalJson(['base64', 'path', 'size'])
        || typeof record.path !== 'string' || !record.path || record.path.startsWith('/') || record.path.includes('\\')
        || record.path.split('/').some((part) => !part || part === '.' || part === '..')
        || (previousCapturedPath && Buffer.from(previousCapturedPath).compare(Buffer.from(record.path)) >= 0)
        || !Number.isSafeInteger(record.size) || record.size < 0 || record.size > 32 * 1024 * 1024
        || typeof record.base64 !== 'string') throw new Error('User-web captured file record is invalid');
      const bytes = Buffer.from(record.base64, 'base64');
      if (bytes.length !== record.size || bytes.toString('base64') !== record.base64) throw new Error('User-web captured file encoding is invalid');
      capturedTotalBytes += bytes.length;
      if (capturedTotalBytes > 128 * 1024 * 1024) throw new Error('User-web captured files exceed their aggregate boundary');
      const target = path.resolve(capturedDist, ...record.path.split('/'));
      const targetRelative = path.relative(capturedDist, target);
      if (!targetRelative || targetRelative === '..' || targetRelative.startsWith(`..${path.sep}`) || path.isAbsolute(targetRelative)) throw new Error('User-web captured file escaped its evidence root');
      mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, bytes, { flag: 'wx', mode: 0o444 });
      previousCapturedPath = record.path;
    }
    const lock = JSON.parse(readFileSync(path.join(webRoot, 'package-lock.json'), 'utf8'));
    const version = (name) => {
      const value = lock.packages?.[`node_modules/${name}`]?.version;
      if (typeof value !== 'string' || !value) throw new Error(`Missing ${name} version in exact-source web lock`);
      return value;
    };
    createUserWebDistManifest({
      repositoryRoot: snapshot,
      dist: capturedDist,
      staging: absolute,
      expectedSourceSha: source.commit,
      provenance: {
        source,
        artifactRoot: 'apps/web-user/dist',
        buildTools: { node: process.version, npm: npmExec(['--version'], { encoding: 'utf8', env: npmEnvironment }).trim(), typescript: version('typescript'), vite: version('vite') },
      },
    });
    return source;
  });
}

function collectAndroidUnsafe(options, emit = true) {
  const flutter = trustedFlutter(options.flutter);
  const androidSdkRoot = path.resolve(options['android-sdk-root'] ?? '');
  const javaHome = path.resolve(options['java-home'] ?? '');
  const debugKeystore = trustedFile(options['debug-keystore'], 'debug.keystore', 'Android debug signing keystore');
  const apksignerJar = trustedApksignerJar(androidSdkRoot);
  assertSystemRuntime(javaHome);
  const output = path.resolve(options.output ?? '');
  const relative = path.relative('/workspace/logs', output);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Android evidence output must remain under /workspace/logs');
  assertNoSymlinkAncestors(output);
  if (lstatSync(output, { throwIfNoEntry: false })) throw new Error('Android evidence output directory must not already exist');
  mkdirSync(output, { recursive: false, mode: 0o700 });
  const sourceBefore = {
    commit: gitExec(['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
    tree: gitExec(['rev-parse', 'HEAD^{tree}'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
  };
  assertTrackedWorktreeMatchesHead(repoRoot);
  if (gitExec(['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8' }).trim()) throw new Error('Android build requires a clean exact-source checkout');
  const snapshotContainer = path.join('/workspace/logs', `.settleora-android-exact-source-${sourceBefore.commit}`);
  const snapshotRoot = path.join(snapshotContainer, 'source');
  assertNoSymlinkAncestors(snapshotContainer);
  if (lstatSync(snapshotContainer, { throwIfNoEntry: false })) throw new Error('Deterministic Android build workspace already exists');
  mkdirSync(snapshotContainer, { recursive: false, mode: 0o700 });
  mkdirSync(snapshotRoot, { recursive: false, mode: 0o700 });
  let copiedIdentities;
  try {
    assertCommitHasNoSymlinks(sourceBefore.commit, 'Android');
    materializeExactTree(sourceBefore.commit, snapshotRoot, 'Android');
    makeRegularFilesReadOnly(snapshotRoot, 'Android exact-source snapshot');
    const buildCaches = path.join(snapshotContainer, 'build-caches');
    mkdirSync(buildCaches, { recursive: false, mode: 0o700 });
    const pubCache = path.join(buildCaches, 'pub');
    const prefetchGradleHome = path.join(buildCaches, 'gradle-prefetch');
    const runtimeGradleHome = prefetchGradleHome;
    mkdirSync(pubCache, { recursive: false, mode: 0o700 });
    mkdirSync(prefetchGradleHome, { recursive: false, mode: 0o700 });
    const buildHome = path.join(snapshotContainer, 'home');
    mkdirSync(buildHome, { recursive: false, mode: 0o700 });
    mkdirSync(path.join(buildHome, '.android'), { recursive: false, mode: 0o700 });
    const copiedKeystore = copyBoundedFile(debugKeystore.path, path.join(buildHome, '.android', 'debug.keystore'), maxAndroidDebugKeystoreBytes, 'Android debug signing keystore');
    if (copiedKeystore.sha256 !== debugKeystore.sha256) throw new Error('Android debug signing keystore snapshot identity mismatch');
    const signingCertificateSha256 = debugKeystoreCertificateSha256(javaHome, path.join(buildHome, '.android', 'debug.keystore'));
    makeTreeReadOnly(path.join(buildHome, '.android'), 'Android debug signing home');
    const flutterMutableMetadata = readdirSync(path.join(flutter.root, 'bin/cache'), { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && /^[A-Za-z0-9._-]+\.(?:stamp|realm)$/u.test(entry.name))
      .map((entry) => `bin/cache/${entry.name}`);
    const toolchainConfiguration = [
      { label: 'flutter', root: flutter.root, excludedPrefixes: ['.git', 'bin/cache/lockfile', 'packages/flutter_tools/gradle/.gradle', ...flutterMutableMetadata], excludedTransientBases: flutterMutableMetadata },
      { label: 'android', root: androidSdkRoot, excludedPrefixes: ['.knownPackages'] },
    ];
    const sourceGeneratedPaths = [
      'apps/mobile/.dart_tool',
      'apps/mobile/.flutter-plugins-dependencies',
      'apps/mobile/android/.gradle',
      'apps/mobile/android/.kotlin',
      'apps/mobile/android/app/src/main/java',
      'apps/mobile/android/build',
      'apps/mobile/android/local.properties',
      'apps/mobile/build',
      'apps/mobile/ios',
      'apps/mobile/lib/.dart_tool',
      'apps/mobile/linux',
      'apps/mobile/macos',
      'apps/mobile/web',
      'apps/mobile/windows',
    ];
    const sourceGuard = { label: 'android-exact-source', root: snapshotRoot, excludedPrefixes: sourceGeneratedPaths };
    const prefetchSourceGeneratedPaths = [...sourceGeneratedPaths, 'apps/mobile/android/gradle/wrapper/gradle-wrapper.jar', 'apps/mobile/android/gradlew', 'apps/mobile/android/gradlew.bat'];
    const prefetchSourceGuard = { label: 'android-exact-source', root: snapshotRoot, excludedPrefixes: prefetchSourceGeneratedPaths };
    const toolchainsBefore = {
      flutter: toolchainTreeDigest(flutter.root, 'Flutter SDK', toolchainConfiguration[0].excludedPrefixes, toolchainConfiguration[0].excludedTransientBases),
      android: toolchainTreeDigest(androidSdkRoot, 'Android SDK', toolchainConfiguration[1].excludedPrefixes),
      java: toolchainTreeDigest(javaHome, 'Java runtime', [], [], true),
    };
    const buildEnvironment = {
      PATH: '/usr/bin:/bin',
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      FLUTTER_ROOT: flutter.root,
      ANDROID_HOME: androidSdkRoot,
      ANDROID_SDK_ROOT: androidSdkRoot,
      JAVA_HOME: javaHome,
      HOME: buildHome,
      PUB_CACHE: pubCache,
      GRADLE_USER_HOME: prefetchGradleHome,
      GRADLE_OPTS: `-Dorg.gradle.daemon=false -Duser.home=${buildHome}`,
      ORG_GRADLE_PROJECT_settleoraReleaseEvidence: 'true',
    };
    flutter.environment = buildEnvironment;
    const mobileRoot = path.join(snapshotRoot, 'apps/mobile');
    executeGuardedFlutter(flutter, [
      ['pub', 'get'],
    ], mobileRoot, [...toolchainConfiguration, prefetchSourceGuard, { label: 'android-signing-home', root: path.join(buildHome, '.android'), excludedPrefixes: [] }]);
    const sealedGeneratedInputPaths = [
      'apps/mobile/.dart_tool/package_config.json',
      'apps/mobile/.dart_tool/package_graph.json',
      'apps/mobile/.dart_tool/version',
      'apps/mobile/.flutter-plugins-dependencies',
      'apps/mobile/android/app/src/main/java',
    ];
    for (const relativeInput of sealedGeneratedInputPaths) {
      const absoluteInput = path.join(snapshotRoot, relativeInput);
      if (!lstatSync(absoluteInput, { throwIfNoEntry: false })) throw new Error(`Android generated build input is missing: ${relativeInput}`);
      makeTreeReadOnly(absoluteInput, `Android generated build input ${relativeInput}`);
    }
    const dartToolRoot = path.join(mobileRoot, '.dart_tool');
    const dartToolExcludedPaths = ['flutter_build', 'hooks_runner'];
    const prefetchBuildGeneratedPaths = prefetchSourceGeneratedPaths.filter((entry) => !['apps/mobile/.flutter-plugins-dependencies', 'apps/mobile/android/app/src/main/java'].includes(entry));
    executeGuardedFlutter(flutter, [
      ['build', 'apk', '--release', '--no-pub'],
    ], mobileRoot, [
      ...toolchainConfiguration,
      { label: 'android-exact-source-prefetch-build', root: snapshotRoot, excludedPrefixes: prefetchBuildGeneratedPaths },
      { label: 'android-generated-package-config-prefetch', root: dartToolRoot, excludedPrefixes: dartToolExcludedPaths },
      { label: 'android-signing-home', root: path.join(buildHome, '.android'), excludedPrefixes: [] },
    ]);
    for (const [relativeGenerated, expectedName, executable] of [
      ['apps/mobile/android/gradle/wrapper/gradle-wrapper.jar', 'gradle-wrapper.jar', false],
      ['apps/mobile/android/gradlew', 'gradlew', true],
      ['apps/mobile/android/gradlew.bat', 'gradlew.bat', false],
    ]) {
      const generated = trustedFile(path.join(snapshotRoot, relativeGenerated), expectedName, `generated Android ${expectedName}`, executable);
      chmodSync(generated.path, executable ? 0o555 : 0o444);
    }
    const gradleModules = path.join(prefetchGradleHome, 'caches', 'modules-2');
    const gradleWrapper = path.join(prefetchGradleHome, 'wrapper');
    if (!lstatSync(gradleModules, { throwIfNoEntry: false })?.isDirectory() || !lstatSync(gradleWrapper, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error('Android dependency prefetch did not produce the required Gradle caches');
    }
    const pubExcludedBuildPaths = relativeDirectoriesNamed(pubCache, '.cxx');
    if (pubExcludedBuildPaths.length !== 1
      || !/^hosted\/pub\.dev\/jni-[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?\/android\/\.cxx$/u.test(pubExcludedBuildPaths[0])) {
      throw new Error('Android pub-cache native-build exclusion does not match the exact locked jni package');
    }
    makeTreeReadOnly(pubCache, 'Dart pub dependency cache');
    for (const relativePath of pubExcludedBuildPaths) makeTreeOwnerWritable(path.join(pubCache, relativePath));
    const runtimeWrapper = gradleWrapper;
    const runtimeWrapperLockPaths = relativeFilesMatching(runtimeWrapper, /\.zip\.lck$/u);
    if (runtimeWrapperLockPaths.length !== 1 || !/^dists\/gradle-[0-9.]+-(?:all|bin)\/[a-z0-9]+\/gradle-[0-9.]+-(?:all|bin)\.zip\.lck$/u.test(runtimeWrapperLockPaths[0])) {
      throw new Error('Gradle runtime wrapper lock-file inventory is not the expected bounded shape');
    }
    const gradleRuntimeVersion = /^dists\/gradle-([0-9.]+)-(?:all|bin)\//u.exec(runtimeWrapperLockPaths[0])?.[1];
    if (!gradleRuntimeVersion) throw new Error('Gradle runtime version could not be derived from the sealed wrapper');
    const runtimeNative = path.join(runtimeGradleHome, 'native');
    const gradleNativeLockPaths = relativeFilesMatching(runtimeNative, /\.lock$/u);
    if (gradleNativeLockPaths.length < 1 || gradleNativeLockPaths.length > 16
      || gradleNativeLockPaths.some((entry) => !/^(?:jansi\/[0-9.]+\/[A-Za-z0-9._-]+\/libjansi\.so|[0-9a-f]{64}\/[A-Za-z0-9._-]+\/libnative-platform(?:-curses)?\.so|[0-9.]+\/[A-Za-z0-9._-]+\/libgradle-fileevents\.so)\.lock$/u.test(entry))) {
      throw new Error('Gradle native runtime lock-file inventory is not the expected bounded shape');
    }
    const runtimeModules = gradleModules;
    makeTreeReadOnly(runtimeModules, 'Gradle runtime module dependency cache');
    chmodSync(runtimeModules, 0o700);
    for (const relativeMutable of ['gc.properties', 'modules-2.lock']) {
      const mutableFile = path.join(runtimeModules, relativeMutable);
      if (!lstatSync(mutableFile, { throwIfNoEntry: false })?.isFile()) throw new Error(`Gradle module-cache coordination file is missing: ${relativeMutable}`);
      chmodSync(mutableFile, 0o600);
    }
    const sealedGradleExecutableCachePaths = [
      `caches/${gradleRuntimeVersion}/dependencies-accessors`,
      `caches/${gradleRuntimeVersion}/generated-gradle-jars`,
      `caches/${gradleRuntimeVersion}/groovy-dsl`,
      `caches/${gradleRuntimeVersion}/kotlin-dsl`,
      `caches/${gradleRuntimeVersion}/transforms`,
      'caches/jars-9',
    ];
    const sealedGradleExecutableMutablePaths = [
      `caches/${gradleRuntimeVersion}/dependencies-accessors/gc.properties`,
      `caches/${gradleRuntimeVersion}/generated-gradle-jars/generated-gradle-jars.lock`,
      `caches/${gradleRuntimeVersion}/groovy-dsl/gc.properties`,
      `caches/${gradleRuntimeVersion}/kotlin-dsl/gc.properties`,
      `caches/${gradleRuntimeVersion}/transforms/gc.properties`,
      'caches/jars-9/jars-9.lock',
    ];
    const stableKotlinIdentityNames = (root, label, pattern) => {
      const entries = readdirSync(root, { withFileTypes: true });
      if (entries.some((entry) => !entry.isDirectory() || !pattern.test(entry.name))) throw new Error(`${label} contains an unexpected entry`);
      return entries
      .map((entry) => entry.name)
      .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
    };
    const kotlinAccessorsRoot = path.join(runtimeGradleHome, `caches/${gradleRuntimeVersion}/kotlin-dsl/accessors`);
    const preStabilizationAccessorNames = stableKotlinIdentityNames(kotlinAccessorsRoot, 'Gradle Kotlin DSL accessor cache', /^[0-9a-f]{32}(?:-PS)?$/u);
    if (preStabilizationAccessorNames.length < 1) throw new Error('Android guarded dependency prefetch did not produce a stable Kotlin DSL accessor identity');
    const kotlinScriptsRoot = path.join(runtimeGradleHome, `caches/${gradleRuntimeVersion}/kotlin-dsl/scripts`);
    const preStabilizationScriptNames = stableKotlinIdentityNames(kotlinScriptsRoot, 'Gradle Kotlin DSL script cache', /^[0-9a-f]{32}$/u);
    if (preStabilizationScriptNames.length < 1) throw new Error('Android guarded dependency prefetch did not produce a stable Kotlin DSL script identity');
    for (const relativeCache of sealedGradleExecutableCachePaths) {
      const runtimeCache = path.join(runtimeGradleHome, relativeCache);
      if (!lstatSync(runtimeCache, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`Android guarded dependency prefetch did not produce Gradle ${relativeCache}`);
      makeTreeReadOnly(runtimeCache, `Gradle runtime executable cache ${relativeCache}`);
    }
    for (const relativeMutable of sealedGradleExecutableMutablePaths) {
      const mutableFile = path.join(runtimeGradleHome, relativeMutable);
      if (!lstatSync(mutableFile, { throwIfNoEntry: false })?.isFile()) throw new Error(`Gradle executable-cache coordination file is missing: ${relativeMutable}`);
      chmodSync(mutableFile, 0o600);
    }
    chmodSync(kotlinAccessorsRoot, 0o700);
    chmodSync(kotlinScriptsRoot, 0o700);
    makeTreeReadOnly(runtimeWrapper, 'Gradle runtime wrapper distribution');
    chmodSync(path.join(runtimeWrapper, runtimeWrapperLockPaths[0]), 0o600);
    makeTreeReadOnly(runtimeNative, 'Gradle native runtime cache');
    for (const relativeLock of gradleNativeLockPaths) chmodSync(path.join(runtimeNative, relativeLock), 0o600);
    const runtimeGradleMutablePaths = ['.tmp', 'caches/CACHEDIR.TAG', 'caches/build-cache-1', `caches/${gradleRuntimeVersion}/file-changes`, `caches/${gradleRuntimeVersion}/fileContent`, `caches/${gradleRuntimeVersion}/fileHashes`, `caches/${gradleRuntimeVersion}/gc.properties`, `caches/${gradleRuntimeVersion}/javaCompile`, `caches/${gradleRuntimeVersion}/jvms`, `caches/${gradleRuntimeVersion}/md-rule`, `caches/${gradleRuntimeVersion}/md-supplier`, ...sealedGradleExecutableMutablePaths, 'caches/gc.properties', 'caches/journal-1', 'caches/keyrings', 'caches/modules-2', 'android', 'daemon', 'kotlin-profile', 'notifications', 'workers', ...gradleNativeLockPaths.map((entry) => `native/${entry}`), ...runtimeWrapperLockPaths.map((entry) => `wrapper/${entry}`)];
    const accessorPrefix = `caches/${gradleRuntimeVersion}/kotlin-dsl/accessors`;
    const scriptPrefix = `caches/${gradleRuntimeVersion}/kotlin-dsl/scripts`;
    flutter.environment = {
      ...buildEnvironment,
      ORG_GRADLE_PROJECT_settleoraReleaseOffline: 'true',
    };
    executeGuardedFlutter(flutter, [
      ['build', 'apk', '--release', '--no-pub'],
    ], mobileRoot, [
      ...toolchainConfiguration,
      prefetchSourceGuard,
      { label: 'pub-cache', root: pubCache, excludedPrefixes: pubExcludedBuildPaths },
      { label: 'gradle-stabilization-home', root: runtimeGradleHome, excludedPrefixes: [...runtimeGradleMutablePaths, accessorPrefix, scriptPrefix] },
      ...preStabilizationAccessorNames.map((entry) => ({ label: `gradle-existing-accessor-${entry}`, root: path.join(kotlinAccessorsRoot, entry), excludedPrefixes: [] })),
      ...preStabilizationScriptNames.map((entry) => ({ label: `gradle-existing-script-${entry}`, root: path.join(kotlinScriptsRoot, entry), excludedPrefixes: [] })),
      { label: 'android-signing-home', root: path.join(buildHome, '.android'), excludedPrefixes: [] },
    ]);
    const kotlinAccessorNames = stableKotlinIdentityNames(kotlinAccessorsRoot, 'Gradle stabilized Kotlin DSL accessor cache', /^[0-9a-f]{32}(?:-PS)?$/u);
    if (preStabilizationAccessorNames.some((entry) => !kotlinAccessorNames.includes(entry))
      || kotlinAccessorNames.length > preStabilizationAccessorNames.length + 4) {
      throw new Error('Android offline stabilization produced an unexpected Kotlin DSL accessor inventory');
    }
    makeTreeReadOnly(kotlinAccessorsRoot, 'Gradle stabilized Kotlin DSL accessors');
    chmodSync(kotlinAccessorsRoot, 0o700);
    const kotlinScriptNames = stableKotlinIdentityNames(kotlinScriptsRoot, 'Gradle stabilized Kotlin DSL script cache', /^[0-9a-f]{32}$/u);
    if (preStabilizationScriptNames.some((entry) => !kotlinScriptNames.includes(entry))
      || kotlinScriptNames.length > preStabilizationScriptNames.length + 4) {
      throw new Error('Android offline stabilization produced an unexpected Kotlin DSL script inventory');
    }
    makeTreeReadOnly(kotlinScriptsRoot, 'Gradle stabilized Kotlin DSL scripts');
    chmodSync(kotlinScriptsRoot, 0o700);
    const gradleKotlinDslTransientBases = kotlinAccessorNames.filter((entry) => /^[0-9a-f]{32}$/u.test(entry)).map((entry) => `${accessorPrefix}/${entry}`);
    const preStabilizationKotlinDslAccessorBases = preStabilizationAccessorNames.filter((entry) => /^[0-9a-f]{32}$/u.test(entry)).map((entry) => `${accessorPrefix}/${entry}`);
    const gradleKotlinDslScriptTransientBases = kotlinScriptNames.map((entry) => `${scriptPrefix}/${entry}`);
    const preStabilizationKotlinDslScriptBases = preStabilizationScriptNames.map((entry) => `${scriptPrefix}/${entry}`);
    const gradleExecutableCacheExcludedPaths = [...runtimeGradleMutablePaths, 'caches/modules-2', 'wrapper'];
    const dependencyCaches = {
      pub: toolchainTreeDigest(pubCache, 'Dart pub dependency cache', pubExcludedBuildPaths),
      gradleExecutableCaches: toolchainTreeDigest(runtimeGradleHome, 'Gradle executable caches', gradleExecutableCacheExcludedPaths),
      gradleModules: toolchainTreeDigest(runtimeModules, 'Gradle runtime module dependency cache', ['gc.properties', 'modules-2.lock']),
      gradleWrapper: toolchainTreeDigest(runtimeWrapper, 'Gradle runtime wrapper distribution', runtimeWrapperLockPaths),
    };
    flutter.environment = {
      ...buildEnvironment,
      GRADLE_USER_HOME: runtimeGradleHome,
      ORG_GRADLE_PROJECT_settleoraReleaseOffline: 'true',
    };
    const offlineGuardConfiguration = [
      ...toolchainConfiguration,
      sourceGuard,
      { label: 'pub-cache', root: pubCache, excludedPrefixes: pubExcludedBuildPaths },
      { label: 'gradle-modules-cache', root: runtimeModules, excludedPrefixes: ['gc.properties', 'modules-2.lock'] },
      { label: 'gradle-wrapper-distribution', root: runtimeWrapper, excludedPrefixes: runtimeWrapperLockPaths },
      { label: 'android-signing-home', root: path.join(buildHome, '.android'), excludedPrefixes: [] },
      { label: 'gradle-runtime-home', root: runtimeGradleHome, excludedPrefixes: runtimeGradleMutablePaths, excludedTransientBases: [...gradleKotlinDslTransientBases, ...gradleKotlinDslScriptTransientBases] },
    ];
    const files = {
      apk: ['apps/mobile/build/app/outputs/flutter-apk/app-release.apk', 'app-release.apk'],
      aab: ['apps/mobile/build/app/outputs/bundle/release/app-release.aab', 'app-release.aab'],
      mapping: ['apps/mobile/build/app/outputs/mapping/release/mapping.txt', 'mapping.txt'],
      metadata: ['apps/mobile/build/app/outputs/apk/release/output-metadata.json', 'output-metadata.json'],
    };
    const rawMetadataTarget = path.join(output, '.raw-output-metadata.json');
    const buildSourceGeneratedPaths = sourceGeneratedPaths.filter((entry) => !['apps/mobile/.flutter-plugins-dependencies', 'apps/mobile/android/app/src/main/java'].includes(entry));
    const buildGuardConfiguration = [
      ...offlineGuardConfiguration.filter((entry) => entry !== sourceGuard),
      { label: 'android-exact-source-build', root: snapshotRoot, excludedPrefixes: buildSourceGeneratedPaths },
      { label: 'android-generated-package-config', root: dartToolRoot, excludedPrefixes: dartToolExcludedPaths },
    ];
    const clearBuildOutputs = () => {
      for (const relativeOutput of ['apps/mobile/build', 'apps/mobile/android/build']) {
        const generatedOutput = path.join(snapshotRoot, relativeOutput);
        const metadata = lstatSync(generatedOutput, { throwIfNoEntry: false });
        if (!metadata && relativeOutput === 'apps/mobile/android/build') continue;
        if (!metadata?.isDirectory() || metadata.isSymbolicLink()) throw new Error(`Android build did not produce a bounded output directory: ${relativeOutput}`);
        rmSync(generatedOutput, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
      }
    };
    clearBuildOutputs();
    executeGuardedFlutter(flutter, [
      ['build', 'apk', '--release', '--no-pub'],
    ], mobileRoot, buildGuardConfiguration, [
      { source: path.join(snapshotRoot, files.apk[0]), descriptor: 5, maxBytes: maxAndroidArtifactBytes, label: 'Android APK' },
      { source: path.join(snapshotRoot, files.metadata[0]), descriptor: 6, maxBytes: maxAndroidMetadataBytes, label: 'Android output metadata' },
    ]);
    const sealedApkIdentity = copySealedDescriptor(5, path.join(output, files.apk[1]), maxAndroidArtifactBytes, 'Android APK');
    const sealedMetadataIdentity = copySealedDescriptor(6, rawMetadataTarget, maxAndroidMetadataBytes, 'Android output metadata');
    clearBuildOutputs();
    executeGuardedFlutter(flutter, [
      ['build', 'appbundle', '--release', '--no-pub'],
    ], mobileRoot, buildGuardConfiguration, [
      { source: path.join(snapshotRoot, files.aab[0]), descriptor: 7, maxBytes: maxAndroidArtifactBytes, label: 'Android AAB' },
      { source: path.join(snapshotRoot, files.mapping[0]), descriptor: 8, maxBytes: maxAndroidMappingBytes, label: 'Android R8 mapping' },
    ]);
    const sealedAabIdentity = copySealedDescriptor(7, path.join(output, files.aab[1]), maxAndroidArtifactBytes, 'Android AAB');
    const sealedMappingIdentity = copySealedDescriptor(8, path.join(output, files.mapping[1]), maxAndroidMappingBytes, 'Android R8 mapping');
    const toolchainsAfter = {
      flutter: toolchainTreeDigest(flutter.root, 'Flutter SDK', toolchainConfiguration[0].excludedPrefixes, toolchainConfiguration[0].excludedTransientBases),
      android: toolchainTreeDigest(androidSdkRoot, 'Android SDK', toolchainConfiguration[1].excludedPrefixes),
      java: toolchainTreeDigest(javaHome, 'Java runtime', [], [], true),
    };
    for (const name of ['flutter', 'android', 'java']) {
      if (canonicalJson(toolchainsAfter[name]) !== canonicalJson(toolchainsBefore[name])) {
        throw new Error(`Android ${name} toolchain changed during collection: ${toolchainsBefore[name].sha256} -> ${toolchainsAfter[name].sha256}`);
      }
    }
    if (canonicalJson(toolchainTreeDigest(pubCache, 'Dart pub dependency cache', pubExcludedBuildPaths)) !== canonicalJson(dependencyCaches.pub)
      || canonicalJson(toolchainTreeDigest(runtimeGradleHome, 'Gradle executable caches', gradleExecutableCacheExcludedPaths)) !== canonicalJson(dependencyCaches.gradleExecutableCaches)
      || canonicalJson(toolchainTreeDigest(runtimeModules, 'Gradle runtime module dependency cache', ['gc.properties', 'modules-2.lock'])) !== canonicalJson(dependencyCaches.gradleModules)
      || canonicalJson(toolchainTreeDigest(runtimeWrapper, 'Gradle runtime wrapper distribution', runtimeWrapperLockPaths)) !== canonicalJson(dependencyCaches.gradleWrapper)) {
      throw new Error('Android immutable dependency cache changed during offline release builds');
    }
    if (trustedFile(debugKeystore.path, 'debug.keystore', 'Android debug signing keystore').sha256 !== debugKeystore.sha256) throw new Error('Android debug signing keystore changed during collection');
    if (trustedFile(path.join(buildHome, '.android', 'debug.keystore'), 'debug.keystore', 'copied Android debug signing keystore').sha256 !== copiedKeystore.sha256
      || debugKeystoreCertificateSha256(javaHome, path.join(buildHome, '.android', 'debug.keystore')) !== signingCertificateSha256) {
      throw new Error('Copied Android debug signing identity changed during collection');
    }
    assertOwnedEvidenceDirectory(output);
    copiedIdentities = {
      apk: sealedApkIdentity,
      aab: sealedAabIdentity,
      mapping: sealedMappingIdentity,
      rawMetadata: sealedMetadataIdentity,
      toolchains: toolchainsBefore,
      dependencyCaches,
      gradleVerificationMetadataSha256: createHash('sha256').update(gitExec(['show', `${sourceBefore.commit}:apps/mobile/android/gradle/verification-metadata.xml`], { cwd: repoRoot })).digest('hex'),
      apksignerJarSha256: apksignerJar.sha256,
      toolchainMutationGuard: { algorithm: 'linux-inotify-authenticated-runner-v3', flutterExcludedTransientBases: [...flutterMutableMetadata].sort((left, right) => Buffer.from(left).compare(Buffer.from(right))), pubExcludedBuildPaths, gradleWrapperLockPaths: runtimeWrapperLockPaths, gradleNativeLockPaths, gradleKotlinDslTransientBases, preStabilizationKotlinDslAccessorBases, gradleKotlinDslScriptTransientBases, preStabilizationKotlinDslScriptBases, prefetchSourceGeneratedPaths, sourceGeneratedPaths, sealedGeneratedInputPaths, dartToolExcludedPaths, sealedGradleExecutableCachePaths, runtimeGradleMutablePaths, outputsCapturedBeforeGuardExit: true, outputsWriteSealedBeforeGuardExit: true, queueOverflowFailsClosed: true },
      signingInputSha256: debugKeystore.sha256,
      signingCertificateSha256,
    };
    const outputMetadataBytes = safeBytes(rawMetadataTarget, 'captured Android output metadata');
    if (outputMetadataBytes.length !== copiedIdentities.rawMetadata.size
      || createHash('sha256').update(outputMetadataBytes).digest('hex') !== copiedIdentities.rawMetadata.sha256) {
      throw new Error('Captured Android output metadata differs from its sealed producer descriptor');
    }
    let outputMetadata;
    try {
      assertUniqueJsonMembers(outputMetadataBytes.toString('utf8'));
      outputMetadata = JSON.parse(outputMetadataBytes);
    } catch {
      throw new Error('Android output metadata must be unambiguous JSON');
    }
    const canonicalOutputMetadata = Buffer.from(canonicalJson(outputMetadata), 'utf8');
    if (canonicalOutputMetadata.length > maxAndroidMetadataBytes) throw new Error('Android output metadata exceeds its evidence size limit');
    writeFileSync(path.join(output, files.metadata[1]), canonicalOutputMetadata, { flag: 'wx', mode: 0o444 });
    rmSync(rawMetadataTarget, { force: false });
    copiedIdentities.outputMetadata = { size: canonicalOutputMetadata.length, sha256: createHash('sha256').update(canonicalOutputMetadata).digest('hex') };
  } finally {
    const metadata = lstatSync(snapshotContainer, { throwIfNoEntry: false });
    if (metadata?.isDirectory() && !metadata.isSymbolicLink()) {
      makeTreeOwnerWritable(snapshotContainer);
      rmSync(snapshotContainer, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
    }
  }
  const source = {
    commit: gitExec(['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
    tree: gitExec(['rev-parse', 'HEAD^{tree}'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
  };
  assertTrackedWorktreeMatchesHead(repoRoot);
  if (canonicalJson(source) !== canonicalJson(sourceBefore) || gitExec(['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8' }).trim()) {
    throw new Error('Android build source changed during collection');
  }
  const files = {
    apk: ['apps/mobile/build/app/outputs/flutter-apk/app-release.apk', 'app-release.apk'],
    aab: ['apps/mobile/build/app/outputs/bundle/release/app-release.aab', 'app-release.aab'],
    mapping: ['apps/mobile/build/app/outputs/mapping/release/mapping.txt', 'mapping.txt'],
    metadata: ['apps/mobile/build/app/outputs/apk/release/output-metadata.json', 'output-metadata.json'],
  };
  if (!copiedIdentities) throw new Error('Android bounded evidence identities were not collected');
  const artifact = (kind) => ({ path: files[kind][0], ...copiedIdentities[kind] });
  const provenance = {
    schema: 'settleora.android-exact-source-build.v1', source,
      commands: ['flutter pub get (dependency prefetch)', 'flutter build apk --release --no-pub (dependency prefetch)', 'flutter build apk --release --no-pub (offline cache stabilization)', 'flutter build apk --release --no-pub (offline)', 'flutter build appbundle --release --no-pub (offline)'],
    artifacts: { apk: artifact('apk'), aab: artifact('aab'), r8MappingSha256: copiedIdentities.mapping.sha256, outputMetadataSha256: copiedIdentities.outputMetadata.sha256 },
    toolchains: copiedIdentities.toolchains,
    dependencyCaches: copiedIdentities.dependencyCaches,
    gradleVerificationMetadataSha256: copiedIdentities.gradleVerificationMetadataSha256,
    verificationTools: { apksignerJarSha256: copiedIdentities.apksignerJarSha256 },
    toolchainMutationGuard: copiedIdentities.toolchainMutationGuard,
    signingInput: { kind: 'explicit-debug-keystore-sha256-v1', sha256: copiedIdentities.signingInputSha256, certificateSha256: copiedIdentities.signingCertificateSha256 },
  };
  writeFileSync(path.join(output, 'build-provenance.json'), canonicalJson(provenance), { flag: 'wx', mode: 0o444 });
  const result = { status: 'collected', output, source };
  if (emit) process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

export function collectAndroid(options, emit = true) {
  const output = path.resolve(options.output ?? '');
  const existed = lstatSync(output, { throwIfNoEntry: false }) !== undefined;
  try {
    return collectAndroidUnsafe(options, emit);
  } catch (error) {
    const metadata = lstatSync(output, { throwIfNoEntry: false });
    if (!existed && metadata?.isDirectory() && !metadata.isSymbolicLink() && metadata.uid === process.getuid()) {
      rmSync(output, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
    }
    throw error;
  }
}

function assertNoSymlinkAncestors(candidate) {
  let cursor = path.resolve(candidate);
  while (cursor !== '/workspace/logs') {
    if (cursor === '/') throw new Error('Evidence path must remain within /workspace/logs');
    const metadata = lstatSync(cursor, { throwIfNoEntry: false });
    if (metadata?.isSymbolicLink()) throw new Error('Evidence path must not contain symlink ancestors');
    cursor = path.dirname(cursor);
  }
  const root = lstatSync('/workspace/logs');
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Evidence root must be a real directory');
}

function assertOwnedEvidenceDirectory(candidate) {
  assertNoSymlinkAncestors(candidate);
  const metadata = statSync(candidate);
  if (!metadata.isDirectory() || metadata.uid !== process.getuid() || (metadata.mode & 0o077) !== 0) {
    throw new Error('Evidence directory must be a private directory owned by the current user');
  }
}

export function collectedAndroidInput(input, output, signature) {
  return {
    ...input,
    android: {
      ...input.android,
      evidenceRoot: output,
      apkPath: path.join(output, 'app-release.apk'),
      aabPath: path.join(output, 'app-release.aab'),
      mappingPath: path.join(output, 'mapping.txt'),
      outputMetadataPath: path.join(output, 'output-metadata.json'),
      buildProvenancePath: path.join(output, 'build-provenance.json'),
      signerCertificateSha256: signature.certificate,
      embeddedR8MappingSha256: signature.embeddedR8MappingSha256,
      verificationToolSha256: signature.verificationTools?.apksignerJarSha256,
      expected: {
        ...input.android.expected,
        ...(signature.apk ? { apk: signature.apk } : {}),
        ...(signature.aab ? { aab: signature.aab } : {}),
      },
    },
  };
}

export function collectedWebInput(input, output) {
  return {
    ...input,
    userWeb: {
      evidenceRoot: output,
      manifestPath: path.join(output, 'user-web-dist-manifest.json'),
    },
  };
}

function collectedReleaseNotesInput(input, notePath) {
  return { ...input, releaseNotes: { ...input.releaseNotes, evidenceRoot: path.dirname(notePath), path: notePath } };
}

export function retainReleaseNotes(input, output) {
  const evidenceRoot = path.resolve(input.releaseNotes.evidenceRoot ?? '');
  const notePath = path.resolve(input.releaseNotes.path ?? '');
  const relative = path.relative(evidenceRoot, notePath);
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('Release-note evidence input must remain inside its declared evidence root');
  if (path.basename(notePath) !== 'release-notes.md') throw new Error('Release-note evidence input must use the bounded release-notes.md filename');
  assertNoSymlinkAncestors(evidenceRoot);
  const rootMetadata = lstatSync(evidenceRoot, { throwIfNoEntry: false });
  if (!rootMetadata?.isDirectory() || rootMetadata.isSymbolicLink() || realpathSync(evidenceRoot) !== evidenceRoot) throw new Error('Release-note evidence root must be a real directory');
  const bytes = safeBytes(notePath, 'Release-note evidence input');
  if (bytes.length === 0 || containsSensitiveMaterial(bytes.toString('utf8'))) throw new Error('Release-note evidence input is empty or contains potentially sensitive material');
  scanPublicArtifact([{ path: 'release-notes.md', contents: bytes }]);
  writeFileSync(output, bytes, { flag: 'wx', mode: 0o444 });
}

function safeOutput(input, candidate) {
  const expectedDirectory = path.resolve(input.retention.canonicalEvidenceDirectory);
  const output = path.resolve(candidate);
  if (path.dirname(output) !== expectedDirectory || path.basename(output) !== 'release-identity-manifest.json') throw new Error('Output must be the canonical manifest path inside the retained candidate directory');
  let cursor = expectedDirectory;
  while (cursor !== '/workspace/logs') {
    const metadata = lstatSync(cursor, { throwIfNoEntry: false });
    if (metadata?.isSymbolicLink()) throw new Error('Output path must not contain symlinks');
    cursor = path.dirname(cursor);
  }
  if (lstatSync(output, { throwIfNoEntry: false })) throw new Error('Output must not already exist');
  return output;
}

function canonicalCandidateDirectory(input) {
  const candidateId = validateCandidateId(input.source?.candidateId);
  const expected = `/workspace/logs/settleora-release-candidates/${candidateId}`;
  if (![expected, RETENTION_DIRECTORY_TEMPLATE].includes(input.retention?.canonicalEvidenceDirectory)) throw new Error('Retention directory must exactly bind the candidate ID before collection');
  return expected;
}

export function canonicalManifestPath(input, candidate) {
  const expected = path.join(canonicalCandidateDirectory(input), 'release-identity-manifest.json');
  const actual = path.resolve(candidate);
  if (actual !== expected) throw new Error('Validation manifest must be the canonical retained candidate manifest');
  return actual;
}

export function canonicalAndroidInput(input, signature) {
  return collectedAndroidInput(input, path.join(canonicalCandidateDirectory(input), 'android'), signature);
}

export function canonicalWebInput(input) {
  return collectedWebInput(input, path.join(canonicalCandidateDirectory(input), 'web'));
}

export function canonicalReleaseNotesInput(input) {
  return collectedReleaseNotesInput(input, path.join(canonicalCandidateDirectory(input), 'release-notes.md'));
}

export function assertCleanCompletion(root, message) {
  assertTrackedWorktreeMatchesHead(root);
  if (gitExec(['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim()) throw new Error(message);
}

export function collectCompiledMigrationIds(privateParent) {
  assertOwnedEvidenceDirectory(privateParent);
  const dotnet = trustedDotnet();
  return exactSourceSnapshot('migrations', privateParent, (snapshot, source) => {
    if (canonicalJson(source) !== canonicalJson(processSource)) throw new Error('Compiled migration snapshot differs from process-bound source');
    const output = path.join(snapshot, '.release-ef-migration-output');
    const packages = path.join(snapshot, '.release-nuget-packages');
    const cliHome = path.join(snapshot, '.release-dotnet-home');
    mkdirSync(output, { recursive: false, mode: 0o700 });
    mkdirSync(packages, { recursive: false, mode: 0o700 });
    mkdirSync(cliHome, { recursive: false, mode: 0o700 });
    const project = path.join(snapshot, 'tools/release/ef-migration-inventory/Settleora.EfMigrationInventory.csproj');
    const nugetConfig = path.join(snapshot, 'tools/release/ef-migration-inventory/NuGet.Config');
    const dotnetEnvironment = {
      PATH: '/usr/bin:/bin',
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      DOTNET_ROOT: '/usr/lib/dotnet',
      DOTNET_CLI_HOME: cliHome,
      DOTNET_NOLOGO: '1',
      DOTNET_CLI_TELEMETRY_OPTOUT: '1',
      NUGET_PACKAGES: packages,
    };
    const isolatedMsbuildProperties = ['-noAutoResponse', '-p:ImportDirectoryBuildProps=false', '-p:ImportDirectoryBuildTargets=false', '-p:ImportDirectoryPackagesProps=false'];
    makeRegularFilesReadOnly(snapshot, 'Migration exact-source snapshot');
    const migrationGeneratedPaths = [
      '.release-ef-migration-output',
      '.release-nuget-packages',
      '.release-dotnet-home',
      'services/api/src/Settleora.Api/bin',
      'services/api/src/Settleora.Api/obj',
      'tools/release/ef-migration-inventory/bin',
      'tools/release/ef-migration-inventory/obj',
    ];
    const migrationSourceGuard = { label: 'migration-exact-source', root: snapshot, excludedPrefixes: migrationGeneratedPaths };
    executeGuardedCommands(
      [migrationSourceGuard],
      dotnet,
      [],
      [['restore', project, '--locked-mode', '--configfile', nugetConfig, '--packages', packages, '--verbosity', 'quiet', ...isolatedMsbuildProperties]],
      { cwd: snapshot, env: dotnetEnvironment, stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 16 * 1024 * 1024 },
    );
    makeTreeReadOnly(packages, 'Restored migration package closure');
    const restoredPackageIdentity = toolchainTreeDigest(packages, 'Restored migration package closure');
    executeGuardedCommands(
      [migrationSourceGuard, { label: 'restored-migration-packages', root: packages, excludedPrefixes: [] }],
      dotnet,
      [],
      [['publish', project, '--configuration', 'Release', '--output', output, '--no-self-contained', '--no-restore', '--verbosity', 'quiet', ...isolatedMsbuildProperties]],
      { cwd: snapshot, env: dotnetEnvironment, stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 16 * 1024 * 1024 },
    );
    if (canonicalJson(toolchainTreeDigest(packages, 'Restored migration package closure')) !== canonicalJson(restoredPackageIdentity)) {
      throw new Error('Restored migration package closure changed during compilation');
    }
    makeTreeReadOnly(output, 'Published EF migration inventory closure');
    const publishedIdentity = toolchainTreeDigest(output, 'Published EF migration inventory closure');
    let stdout;
    try {
      stdout = executeGuardedCommands(
        [{ label: 'published-ef-migration-closure', root: output, excludedPrefixes: [] }],
        dotnet,
        [],
        [[path.join(output, 'Settleora.EfMigrationInventory.dll')]],
        { cwd: output, env: dotnetEnvironment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 },
      );
      if (canonicalJson(toolchainTreeDigest(output, 'Published EF migration inventory closure')) !== canonicalJson(publishedIdentity)) {
        throw new Error('Published EF migration inventory closure changed during execution');
      }
    } finally {
      makeTreeOwnerWritable(output);
    }
    const marker = 'SETTLEORA_MIGRATIONS_JSON:';
    const records = stdout.split(/\r?\n/u).filter((line) => line.startsWith(marker));
    if (records.length !== 1) throw new Error('Compiled EF migration inventory output is ambiguous');
    const parsed = JSON.parse(records[0].slice(marker.length));
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((item) => typeof item?.Id !== 'string' || typeof item?.Type !== 'string')) {
      throw new Error('Compiled EF migration inventory output is invalid');
    }
    return parsed.map((item) => item.Id);
  });
}

export function sanitizedErrorMessage(error) {
  const raw = error instanceof Error ? error.message : String(error);
  if (containsSensitiveMaterial(raw)) return 'Release identity operation failed; sensitive details were suppressed';
  const normalized = raw.replace(/[\u0000-\u001f\u007f]+/gu, ' ').trim();
  return normalized.slice(0, 2048) || 'Release identity operation failed';
}

export function main(argv = process.argv.slice(2)) {
 try {
  const options = args(argv);
  if (options.command === 'collect-android') {
    if (!options.flutter || !options['android-sdk-root'] || !options['java-home'] || !options['debug-keystore'] || !options.output) throw new Error('collect-android requires --flutter, --android-sdk-root, --java-home, --debug-keystore and --output');
    collectAndroid(options);
  } else if (options.command === 'assemble') {
    if (!options.input || !options.output || !options.flutter || !options['android-sdk-root'] || !options['java-home'] || !options['debug-keystore']) throw new Error('assemble requires --input, --output, --flutter, --android-sdk-root, --java-home and --debug-keystore');
    let supplied = safeInput(options.input, 'Evidence input');
    const candidateRoot = canonicalCandidateDirectory(supplied);
    assertOwnedEvidenceDirectory(candidateRoot);
    supplied = bindCompiledMigrationIds(supplied, collectCompiledMigrationIds(candidateRoot));
    const androidRoot = path.join(candidateRoot, 'android');
    const webRoot = path.join(candidateRoot, 'web');
    const notesPath = path.join(candidateRoot, 'release-notes.md');
    if (lstatSync(androidRoot, { throwIfNoEntry: false })) throw new Error('Canonical Android evidence directory must not already exist');
    if (lstatSync(webRoot, { throwIfNoEntry: false })) throw new Error('Canonical user-web evidence directory must not already exist');
    if (lstatSync(notesPath, { throwIfNoEntry: false })) throw new Error('Canonical release-note evidence must not already exist');
    const androidStaging = path.join(candidateRoot, `.android-staging-${randomUUID()}`);
    const webStaging = path.join(candidateRoot, `.web-staging-${randomUUID()}`);
    const notesStaging = path.join(candidateRoot, `.release-notes-staging-${randomUUID()}.md`);
    let androidPromoted = false;
    let webPromoted = false;
    let notesPromoted = false;
    let completed = false;
    try {
      collectWebExactSource(webStaging);
      retainReleaseNotes(supplied, notesStaging);
      collectAndroid({ ...options, output: androidStaging }, false);
      const stagedInputs = collectedReleaseNotesInput(collectedWebInput(supplied, webStaging), notesStaging);
      const unsignedInput = collectedAndroidInput(stagedInputs, androidStaging, { certificate: '0'.repeat(64), embeddedR8MappingSha256: '0'.repeat(64) });
      const signature = verifyAndroidSignature(unsignedInput, options);
      const input = collectedAndroidInput(stagedInputs, androidStaging, signature);
      const stagedManifest = buildManifest(repoRoot, input);
      verifyLiveRegistry(input);
      assertCleanCompletion(repoRoot, 'Source changed before final manifest write');
      const output = safeOutput(input, options.output);
      assertOwnedEvidenceDirectory(path.dirname(output));
      if (lstatSync(androidRoot, { throwIfNoEntry: false })) throw new Error('Canonical Android evidence directory appeared during assembly');
      if (lstatSync(webRoot, { throwIfNoEntry: false })) throw new Error('Canonical user-web evidence directory appeared during assembly');
      renameSync(webStaging, webRoot);
      webPromoted = true;
      renameSync(androidStaging, androidRoot);
      androidPromoted = true;
      renameSync(notesStaging, notesPath);
      notesPromoted = true;
      const retainedInput = canonicalAndroidInput(canonicalReleaseNotesInput(canonicalWebInput(supplied)), signature);
      const manifest = buildManifest(repoRoot, retainedInput);
      if (canonicalJson({ ...manifest, generatedAt: stagedManifest.generatedAt }) !== canonicalJson(stagedManifest)) throw new Error('Promoted evidence differs from verified staging evidence');
      writeFileSync(output, canonicalJson(manifest), { flag: 'wx', mode: 0o444 });
      completed = true;
      process.stdout.write(`${JSON.stringify({ status: 'assembled', identityDigest: manifest.identityDigest, output })}\n`);
    } catch (error) {
      if (!completed) {
        for (const generated of [androidPromoted ? androidRoot : androidStaging, webPromoted ? webRoot : webStaging]) {
          const metadata = lstatSync(generated, { throwIfNoEntry: false });
          if (metadata?.isDirectory() && !metadata.isSymbolicLink()) rmSync(generated, { recursive: true, force: false });
        }
        const generatedNote = notesPromoted ? notesPath : notesStaging;
        const noteMetadata = lstatSync(generatedNote, { throwIfNoEntry: false });
        if (noteMetadata?.isFile() && !noteMetadata.isSymbolicLink()) rmSync(generatedNote, { force: false });
      }
      throw error;
    }
  } else if (options.command === 'validate') {
    if (!options.manifest || !options.input || !options.flutter || !options['android-sdk-root'] || !options['java-home'] || !options['debug-keystore']) throw new Error('validate requires --manifest, --input, --flutter, --android-sdk-root, --java-home and --debug-keystore for independent recollection');
    const requestedManifest = path.resolve(options.manifest);
    const requestedCandidateRoot = path.dirname(requestedManifest);
    if (path.dirname(requestedCandidateRoot) !== '/workspace/logs/settleora-release-candidates'
      || path.basename(requestedManifest) !== 'release-identity-manifest.json') throw new Error('Manifest is not in a canonical candidate directory');
    validateCandidateId(path.basename(requestedCandidateRoot));
    assertOwnedEvidenceDirectory(requestedCandidateRoot);
    const initialManifestBytes = safeBytes(options.manifest, 'Manifest');
    const manifest = validateManifest(parseCanonicalJson(initialManifestBytes, 'Manifest'), repoRoot);
    canonicalManifestPath(manifest, options.manifest);
    const supplied = bindCompiledMigrationIds(safeInput(options.input, 'Evidence input'), collectCompiledMigrationIds(requestedCandidateRoot));
    const webValidation = path.join(canonicalCandidateDirectory(supplied), `.web-validation-${randomUUID()}`);
    const androidValidation = path.join(canonicalCandidateDirectory(supplied), `.android-validation-${randomUUID()}`);
    try {
      const canonicalInputs = canonicalReleaseNotesInput(canonicalWebInput(supplied));
      const unsignedInput = canonicalAndroidInput(canonicalInputs, { certificate: '0'.repeat(64), embeddedR8MappingSha256: '0'.repeat(64) });
      const signature = verifyAndroidSignature(unsignedInput, options);
      const retainedInput = canonicalAndroidInput(canonicalInputs, signature);
      const retained = buildManifest(repoRoot, retainedInput);
      collectWebExactSource(webValidation);
      collectAndroid({ ...options, output: androidValidation }, false);
      const rebuiltAndroidUnsigned = collectedAndroidInput(collectedWebInput(canonicalReleaseNotesInput(supplied), webValidation), androidValidation, { certificate: '0'.repeat(64), embeddedR8MappingSha256: '0'.repeat(64) });
      const rebuiltSignature = verifyAndroidSignature(rebuiltAndroidUnsigned, options);
      if (canonicalJson(rebuiltSignature.payloads) !== canonicalJson(signature.payloads)
        || rebuiltSignature.certificate !== signature.certificate
        || rebuiltSignature.embeddedR8MappingSha256 !== signature.embeddedR8MappingSha256) {
        throw new Error('Retained Android signed payload differs from the exact-source rebuild');
      }
      const retainedProvenance = JSON.parse(safeBytes(retainedInput.android.buildProvenancePath, 'Retained Android build provenance'));
      const rebuiltProvenance = JSON.parse(safeBytes(rebuiltAndroidUnsigned.android.buildProvenancePath, 'Rebuilt Android build provenance'));
      if (canonicalJson(retainedProvenance.toolchains) !== canonicalJson(rebuiltProvenance.toolchains)) {
        throw new Error('Retained Android toolchain provenance differs from the exact-source rebuild');
      }
      if (canonicalJson(retainedProvenance.dependencyCaches) !== canonicalJson(rebuiltProvenance.dependencyCaches)
        || retainedProvenance.gradleVerificationMetadataSha256 !== rebuiltProvenance.gradleVerificationMetadataSha256
        || canonicalJson(retainedProvenance.toolchainMutationGuard) !== canonicalJson(rebuiltProvenance.toolchainMutationGuard)) {
        throw new Error('Retained Android dependency provenance differs from the exact-source rebuild');
      }
      const rebuiltInput = collectedAndroidInput(collectedWebInput(canonicalReleaseNotesInput(supplied), webValidation), androidValidation, rebuiltSignature);
      const rebuilt = buildManifest(repoRoot, rebuiltInput);
      const rebuiltDeterministicProjection = deterministicAndroidRebuildProjection(rebuilt, retained);
      verifyLiveRegistry(retainedInput, true);
      const retainedAfterRebuild = buildManifest(repoRoot, retainedInput);
      assertCleanCompletion(repoRoot, 'Source changed before validation completed');
      if (canonicalJson({ ...retained, generatedAt: manifest.generatedAt }) !== canonicalJson(manifest)
        || canonicalJson({ ...retainedAfterRebuild, generatedAt: manifest.generatedAt }) !== canonicalJson(manifest)
        || canonicalJson({ ...rebuiltDeterministicProjection, generatedAt: manifest.generatedAt }) !== canonicalJson(manifest)) {
        throw new Error('Manifest differs from independently recollected evidence');
      }
      if (!safeBytes(options.manifest, 'Manifest').equals(initialManifestBytes)) throw new Error('Canonical manifest changed during validation');
    } finally {
      const metadata = lstatSync(webValidation, { throwIfNoEntry: false });
      if (metadata?.isDirectory() && !metadata.isSymbolicLink()) rmSync(webValidation, { recursive: true, force: false });
      const androidMetadata = lstatSync(androidValidation, { throwIfNoEntry: false });
      if (androidMetadata?.isDirectory() && !androidMetadata.isSymbolicLink()) rmSync(androidValidation, { recursive: true, force: false });
    }
    process.stdout.write(`${JSON.stringify({ status: 'valid', identityDigest: computeIdentityDigest(manifest) })}\n`);
  } else {
    throw new Error('Command must be assemble or validate');
  }
  } catch (error) {
  console.error(sanitizedErrorMessage(error));
  process.exitCode = 1;
 }
}

function committedModuleSource(relativePath) {
  const working = readFileSync(path.join(repoRoot, relativePath));
  const committed = gitExec(['show', `${processCommit}:${relativePath}`], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 });
  if (!working.equals(committed)) throw new Error(`Release collector module differs from exact source: ${relativePath}`);
  return working.toString('utf8');
}

function replaceClosureToken(source, token, replacement, label, expectedOccurrences = 1) {
  if (source.split(token).length !== expectedOccurrences + 1) throw new Error(`Release collector closure token is ambiguous: ${label}`);
  return source.replace(token, replacement);
}

function sealedCollectorClosure() {
  let webSource = committedModuleSource('tools/ci/user-web-dist-manifest.mjs');
  webSource = replaceClosureToken(webSource,
    "const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');",
    `const repoRoot = ${JSON.stringify(repoRoot)};`, 'web repository root');
  const webUrl = `data:text/javascript;base64,${Buffer.from(webSource).toString('base64')}`;
  let manifestSource = committedModuleSource('tools/release/day1-release-identity.mjs');
  manifestSource = replaceClosureToken(manifestSource, "'../ci/user-web-dist-manifest.mjs'", JSON.stringify(webUrl), 'manifest web import');
  const manifestUrl = `data:text/javascript;base64,${Buffer.from(manifestSource).toString('base64')}`;
  let cliSource = committedModuleSource('tools/release/day1-release-identity-cli.mjs');
  cliSource = replaceClosureToken(cliSource, "'./day1-release-identity.mjs'", JSON.stringify(manifestUrl), 'CLI manifest import', 2);
  cliSource = replaceClosureToken(cliSource, "'../ci/user-web-dist-manifest.mjs'", JSON.stringify(webUrl), 'CLI web import', 3);
  cliSource = replaceClosureToken(cliSource,
    "const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');",
    `const repoRoot = ${JSON.stringify(repoRoot)};`, 'CLI repository root', 3);
  cliSource = replaceClosureToken(cliSource,
    "const invokedDirectly = Boolean(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url));",
    'const invokedDirectly = true;', 'CLI direct execution', 2);
  return replaceClosureToken(cliSource, 'const sealedRuntime = false;', 'const sealedRuntime = true;', 'sealed runtime', 2);
}

if (invokedDirectly) {
  if (!sealedRuntime) {
    try {
      context.bootstrapAccess = process.env.GH_TOKEN;
      if (typeof context.bootstrapAccess !== 'string') context.bootstrapAccess = '';
      if (context.bootstrapAccess && (Buffer.byteLength(context.bootstrapAccess) > 4096 || /[\u0000-\u0020\u007f]/u.test(context.bootstrapAccess))) throw new Error('GitHub authorization has an invalid bounded representation');
      const closure = sealedCollectorClosure();
      const chunks = closure.match(/[\s\S]{1,60000}/gu) ?? [];
      if (chunks.length < 1 || chunks.length > 32) throw new Error('Sealed release collector closure exceeds its transfer boundary');
      const closureEnvironment = Object.fromEntries(chunks.map((value, index) => [`SETTLEORA_CLOSURE_${String(index).padStart(3, '0')}`, value]));
const bootstrap = `
import fcntl, os, sys
count = int(os.environ.pop("SETTLEORA_CLOSURE_COUNT"))
source = "".join(os.environ.pop("SETTLEORA_CLOSURE_" + str(index).zfill(3)) for index in range(count)).encode("utf-8")
authorization_bytes = os.environ.pop("SETTLEORA_GH_CREDENTIAL", "").encode("utf-8")
def sealed_memfd(name, contents):
    descriptor = os.memfd_create(name, os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
    os.write(descriptor, contents)
    fcntl.fcntl(descriptor, fcntl.F_ADD_SEALS, fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL)
    os.lseek(descriptor, 0, os.SEEK_SET)
    return descriptor
source_fd = sealed_memfd("settleora-release-collector", source)
os.dup2(source_fd, 0)
os.set_inheritable(0, True)
if source_fd != 0:
    os.close(source_fd)
authorization_fd = sealed_memfd("settleora-github-authorization", authorization_bytes)
os.dup2(authorization_fd, 3)
os.set_inheritable(3, True)
if authorization_fd != 3:
    os.close(authorization_fd)
for target_fd, name in enumerate(("web", "apk", "metadata", "aab", "mapping"), start=4):
    scratch_fd = os.memfd_create("settleora-release-" + name, os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
    os.dup2(scratch_fd, target_fd)
    os.set_inheritable(target_fd, True)
    if scratch_fd != target_fd:
        os.close(scratch_fd)
environment = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"}
os.execve(sys.argv[1], [sys.argv[1], "--input-type=module", "-", *sys.argv[2:]], environment)
`;
      process.execve(releaseCommand('python'), [releaseCommand('python'), '-I', '-S', '-c', bootstrap, systemNodeCommand, ...process.argv.slice(2)], {
        PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', SETTLEORA_CLOSURE_COUNT: String(chunks.length), ...closureEnvironment, ...(context.bootstrapAccess ? { SETTLEORA_GH_CREDENTIAL: context.bootstrapAccess } : {}),
      });
    } catch (error) {
      console.error(sanitizedErrorMessage(error));
      process.exitCode = Number.isInteger(error?.status) ? error.status : 1;
    }
  } else {
    const allowedEnvironment = new Set(['PATH', 'LANG', 'LC_ALL']);
    if (realpathSync('/proc/self/exe') !== realpathSync(systemNodeCommand)
      || Object.keys(process.env).some((name) => !allowedEnvironment.has(name))) {
      throw new Error('Release collector did not start in its bounded protected Node environment');
    }
    const credentialMetadata = fstatSync(3);
    if (credentialMetadata.isFile()) {
      if (credentialMetadata.size > 4096) throw new Error('Inherited GitHub credential descriptor exceeds its boundary');
      const bytes = Buffer.alloc(credentialMetadata.size);
      if (bytes.length > 0) {
        if (readSync(3, bytes, 0, bytes.length, 0) !== bytes.length) throw new Error('Inherited GitHub credential descriptor is incomplete');
        context.githubAccess = bytes.toString('utf8');
        if (/[\u0000-\u0020\u007f]/u.test(context.githubAccess)) throw new Error('Inherited GitHub authorization has an invalid representation');
      }
    }
    closeSync(3);
    const initialOptions = args(process.argv.slice(2));
    if (initialOptions.command === 'assemble' || initialOptions.command === 'validate') {
      const initialInput = safeInput(initialOptions.input, 'Evidence input');
      const retained = initialOptions.command === 'validate';
      verifyLiveRegistryNetwork(initialInput, retained);
      verifiedRegistryPreflightIdentity = registryPreflightIdentity(initialInput, retained);
      context.githubAccess = null;
    }
    main();
  }
}
