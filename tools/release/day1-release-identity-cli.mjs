#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readlinkSync, readSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
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
import { assertTrackedWorktreeMatchesHead, assertUniqueJsonMembers, createUserWebDistManifest } from '../ci/user-web-dist-manifest.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const invokedDirectly = Boolean(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url));
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

const registryPreflightMarker = 'SETTLEORA_RELEASE_REGISTRY_PREFLIGHT';
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
    const ghEnvironment = { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', GH_HOST: 'github.com', GH_CONFIG_DIR: '/nonexistent', ...(process.env.GH_TOKEN ? { GH_TOKEN: process.env.GH_TOKEN } : {}) };
    const ghApi = (endpoint, options = {}) => execFileSync(releaseCommand('gh'), ['api', '--hostname', 'github.com', endpoint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: ghEnvironment, ...options });
    const run = JSON.parse(ghApi(`repos/tommytang213/Settleora/actions/runs/${publication.runId}`));
    validatePublicationRunDocument(publication, run, sourceCommit);
    const jobs = JSON.parse(ghApi(`repos/tommytang213/Settleora/actions/runs/${publication.runId}/jobs?per_page=100`));
    const jobId = validatePublicationJobDocument(jobs, sourceCommit);
    const jobLog = ghApi(`repos/tommytang213/Settleora/actions/jobs/${jobId}/logs`, { maxBuffer: 32 * 1024 * 1024 });
    validatePublicationJobLog(jobLog, image, sourceCommit);
    const provenance = inspect(reference, '{{json .Provenance.SLSA}}');
    validatePublicationProvenance(publication, provenance, sourceCommit);
    validateRegistryDocument(image, inspectRecord(reference).manifest, platform, `${label} after provenance`);
  };
  verifyPublication(input.apiImage, input.source.commit, 'apiImage');
  for (const image of input.dependencyImages) verify(image, `dependencyImages.${image.name}`);
  verifyPublication(input.rollback.apiImage, input.rollback.sourceCommit, 'rollback.apiImage');
}

function verifyLiveRegistry(input, retained = false) {
  if (process.env[registryPreflightMarker] !== registryPreflightIdentity(input, retained)) {
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

export function toolchainTreeDigest(root, label, excludedPrefixes = []) {
  const absoluteRoot = path.resolve(root);
  const rootMetadata = lstatSync(absoluteRoot, { throwIfNoEntry: false });
  if (!rootMetadata?.isDirectory() || rootMetadata.isSymbolicLink() || realpathSync(absoluteRoot) !== absoluteRoot) throw new Error(`${label} root is not a stable directory`);
  const records = [];
  let fileCount = 0;
  let directoryCount = 1;
  let symlinkCount = 0;
  let entryCount = 1;
  let totalBytes = 0;
  const walk = (directory, depth) => {
    if (depth > 64) throw new Error(`${label} exceeds its directory-depth boundary`);
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => Buffer.from(left.name).compare(Buffer.from(right.name)));
    for (const entry of entries) {
      entryCount += 1;
      if (entryCount > 250_000) throw new Error(`${label} exceeds its total-entry boundary`);
      const target = path.join(directory, entry.name);
      const relative = path.relative(absoluteRoot, target).split(path.sep).join('/');
      if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error(`${label} contains an unsafe path`);
      if (excludedPrefixes.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`))) continue;
      const metadata = lstatSync(target);
      if (metadata.isDirectory()) {
        directoryCount += 1;
        if (directoryCount > 100_000) throw new Error(`${label} exceeds its directory-count boundary`);
        walk(target, depth + 1);
      } else if (metadata.isSymbolicLink()) {
        symlinkCount += 1;
        if (symlinkCount > 100_000) throw new Error(`${label} exceeds its symlink-count boundary`);
        const link = readlinkSync(target);
        const resolved = path.resolve(path.dirname(target), link);
        const resolvedRelative = path.relative(absoluteRoot, resolved).split(path.sep).join('/');
        if (resolvedRelative.startsWith('..') || path.isAbsolute(resolvedRelative)) throw new Error(`${label} contains an external symlink`);
        const realResolved = realpathSync(target);
        const realResolvedRelative = path.relative(absoluteRoot, realResolved).split(path.sep).join('/');
        if (realResolvedRelative.startsWith('..') || path.isAbsolute(realResolvedRelative)) throw new Error(`${label} contains an external symlink`);
        if (excludedPrefixes.some((prefix) => resolvedRelative === prefix || resolvedRelative.startsWith(`${prefix}/`)
          || realResolvedRelative === prefix || realResolvedRelative.startsWith(`${prefix}/`))) {
          throw new Error(`${label} contains a symlink into an excluded directory`);
        }
        records.push(`link\0${relative}\0${link}\n`);
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
    }
  };
  walk(absoluteRoot, 0);
  return { algorithm: 'sha256(canonical-stable-toolchain-tree-v1)', sha256: createHash('sha256').update(records.join('')).digest('hex'), fileCount, directoryCount, symlinkCount, totalBytes };
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

export function verifyAndroidSignature(input, options) {
  if (input.source?.commit !== processSource.commit || input.source?.tree !== processSource.tree) throw new Error('Android verifier source does not match the process-bound checkout');
  const sdkRoot = path.resolve(options['android-sdk-root'] ?? '');
  const versions = lstatSync(path.join(sdkRoot, 'build-tools'), { throwIfNoEntry: false });
  if (!versions?.isDirectory() || versions.isSymbolicLink()) throw new Error('Trusted Android SDK root is invalid');
  const version = readdirSync(path.join(sdkRoot, 'build-tools'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort(new Intl.Collator('en', { numeric: true }).compare)
    .at(-1);
  const buildToolsRoot = path.join(sdkRoot, 'build-tools', version ?? '');
  const javaHome = path.resolve(options['java-home'] ?? '');
  const java = trustedTool(path.join(javaHome, 'bin', 'java'), 'java', 'Java runtime');
  assertSystemRuntime(javaHome);
  const apksignerJar = trustedFile(path.join(buildToolsRoot, 'lib', 'apksigner.jar'), 'apksigner.jar', 'Android apksigner JAR');
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
    payloads: {
      apk: { sha256: apkObservation.payloadTreeSha256, count: apkObservation.payloadEntryCount, signatureControls: apkObservation.signatureControlEntries, signingBlockIds: apkObservation.apkSigningBlockIds },
      aab: { sha256: aabObservation.payloadTreeSha256, count: aabObservation.payloadEntryCount, signatureControls: aabObservation.signatureControlEntries },
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
  // rebuild proves the separately verified canonical payload, signer, R8 and
  // toolchain identities; those checks occur before this narrow projection.
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
    if (metadata?.isDirectory() && !metadata.isSymbolicLink()) rmSync(container, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
    const after = {
      commit: gitExec(['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
      tree: gitExec(['rev-parse', 'HEAD^{tree}'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
    };
    if (canonicalJson(after) !== canonicalJson(source)) throw new Error(`${prefix} source changed during collection`);
    assertCleanCompletion(repoRoot, `${prefix} source changed during collection`);
  }
}

function collectWebExactSource(output) {
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
    npmExec(['ci'], { cwd: webRoot, env: npmEnvironment, stdio: 'inherit' });
    npmExec(['run', 'build'], { cwd: webRoot, env: npmEnvironment, stdio: 'inherit' });
    const lock = JSON.parse(readFileSync(path.join(webRoot, 'package-lock.json'), 'utf8'));
    const version = (name) => {
      const value = lock.packages?.[`node_modules/${name}`]?.version;
      if (typeof value !== 'string' || !value) throw new Error(`Missing ${name} version in exact-source web lock`);
      return value;
    };
    createUserWebDistManifest({
      dist: path.join(webRoot, 'dist'),
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
    const toolchainsBefore = {
      flutter: toolchainTreeDigest(flutter.root, 'Flutter SDK', ['.git', 'bin/cache/lockfile', 'packages/flutter_tools/gradle/.gradle']),
      android: toolchainTreeDigest(androidSdkRoot, 'Android SDK', ['.knownPackages']),
    };
    const buildCaches = path.join(snapshotContainer, 'build-caches');
    mkdirSync(buildCaches, { recursive: false, mode: 0o700 });
    const buildEnvironment = {
      PATH: '/usr/bin:/bin',
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      FLUTTER_ROOT: flutter.root,
      ANDROID_HOME: androidSdkRoot,
      ANDROID_SDK_ROOT: androidSdkRoot,
      JAVA_HOME: javaHome,
      PUB_CACHE: path.join(buildCaches, 'pub'),
      GRADLE_USER_HOME: path.join(buildCaches, 'gradle'),
      GRADLE_OPTS: '-Dorg.gradle.daemon=false',
    };
    flutter.environment = buildEnvironment;
    executeSealedFlutter(flutter, ['clean'], path.join(snapshotRoot, 'apps/mobile'));
    executeSealedFlutter(flutter, ['build', 'apk', '--release'], path.join(snapshotRoot, 'apps/mobile'));
    executeSealedFlutter(flutter, ['build', 'appbundle', '--release'], path.join(snapshotRoot, 'apps/mobile'));
    const toolchainsAfter = {
      flutter: toolchainTreeDigest(flutter.root, 'Flutter SDK', ['.git', 'bin/cache/lockfile', 'packages/flutter_tools/gradle/.gradle']),
      android: toolchainTreeDigest(androidSdkRoot, 'Android SDK', ['.knownPackages']),
    };
    if (canonicalJson(toolchainsAfter) !== canonicalJson(toolchainsBefore)) throw new Error('Android build toolchain changed during collection');
    const files = {
      apk: ['apps/mobile/build/app/outputs/flutter-apk/app-release.apk', 'app-release.apk'],
      aab: ['apps/mobile/build/app/outputs/bundle/release/app-release.aab', 'app-release.aab'],
      mapping: ['apps/mobile/build/app/outputs/mapping/release/mapping.txt', 'mapping.txt'],
      metadata: ['apps/mobile/build/app/outputs/apk/release/output-metadata.json', 'output-metadata.json'],
    };
    assertOwnedEvidenceDirectory(output);
    copiedIdentities = {
      apk: copyBoundedFile(path.join(snapshotRoot, files.apk[0]), path.join(output, files.apk[1]), maxAndroidArtifactBytes, 'Android APK'),
      aab: copyBoundedFile(path.join(snapshotRoot, files.aab[0]), path.join(output, files.aab[1]), maxAndroidArtifactBytes, 'Android AAB'),
      mapping: copyBoundedFile(path.join(snapshotRoot, files.mapping[0]), path.join(output, files.mapping[1]), maxAndroidMappingBytes, 'Android R8 mapping'),
      toolchains: toolchainsBefore,
    };
    const outputMetadataBytes = safeBytes(path.join(snapshotRoot, files.metadata[0]), 'Android output metadata');
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
    copiedIdentities.outputMetadata = { size: canonicalOutputMetadata.length, sha256: createHash('sha256').update(canonicalOutputMetadata).digest('hex') };
  } finally {
    const metadata = lstatSync(snapshotContainer, { throwIfNoEntry: false });
    if (metadata?.isDirectory() && !metadata.isSymbolicLink()) rmSync(snapshotContainer, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
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
    commands: ['flutter clean', 'flutter build apk --release', 'flutter build appbundle --release'],
    artifacts: { apk: artifact('apk'), aab: artifact('aab'), r8MappingSha256: copiedIdentities.mapping.sha256, outputMetadataSha256: copiedIdentities.outputMetadata.sha256 },
    toolchains: copiedIdentities.toolchains,
  };
  writeFileSync(path.join(output, 'build-provenance.json'), canonicalJson(provenance), { flag: 'wx', mode: 0o444 });
  const result = { status: 'collected', output, source };
  if (emit) process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

function collectAndroid(options, emit = true) {
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
    executeSealedTool(dotnet, ['restore', project, '--locked-mode', '--configfile', nugetConfig, '--packages', packages, '--verbosity', 'quiet', ...isolatedMsbuildProperties], {
      cwd: snapshot,
      env: dotnetEnvironment,
      stdio: ['ignore', 'ignore', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
    executeSealedTool(dotnet, ['publish', project, '--configuration', 'Release', '--output', output, '--no-self-contained', '--no-restore', '--verbosity', 'quiet', ...isolatedMsbuildProperties], {
      cwd: snapshot,
      env: dotnetEnvironment,
      stdio: ['ignore', 'ignore', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
    const stdout = executeSealedTool(dotnet, [path.join(output, 'Settleora.EfMigrationInventory.dll')], {
      cwd: output,
      env: dotnetEnvironment,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 4 * 1024 * 1024,
    });
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

export function main(argv = process.argv.slice(2)) {
 try {
  const options = args(argv);
  if (options.command === 'collect-android') {
    if (!options.flutter || !options['android-sdk-root'] || !options['java-home'] || !options.output) throw new Error('collect-android requires --flutter, --android-sdk-root, --java-home and --output');
    collectAndroid(options);
  } else if (options.command === 'assemble') {
    if (!options.input || !options.output || !options.flutter || !options['android-sdk-root'] || !options['java-home']) throw new Error('assemble requires --input, --output, --flutter, --android-sdk-root and --java-home');
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
    if (!options.manifest || !options.input || !options.flutter || !options['android-sdk-root'] || !options['java-home']) throw new Error('validate requires --manifest, --input, --flutter, --android-sdk-root and --java-home for independent recollection');
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
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
 }
}

if (invokedDirectly) {
  const cleanRuntimeMarker = 'SETTLEORA_RELEASE_CLEAN_NODE';
  if (process.env[cleanRuntimeMarker] !== '1') {
    try {
      const initialOptions = args(process.argv.slice(2));
      let registryIdentity;
      if (initialOptions.command === 'assemble' || initialOptions.command === 'validate') {
        const initialInput = safeInput(initialOptions.input, 'Evidence input');
        const retained = initialOptions.command === 'validate';
        verifyLiveRegistryNetwork(initialInput, retained);
        registryIdentity = registryPreflightIdentity(initialInput, retained);
      }
      process.execve(systemNodeCommand, [systemNodeCommand, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
        PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', [cleanRuntimeMarker]: '1', ...(registryIdentity ? { [registryPreflightMarker]: registryIdentity } : {}),
      });
    } catch (error) {
      process.exitCode = Number.isInteger(error?.status) ? error.status : 1;
    }
  } else {
    const allowedEnvironment = new Set(['PATH', 'LANG', 'LC_ALL', cleanRuntimeMarker, registryPreflightMarker]);
    if (realpathSync('/proc/self/exe') !== realpathSync(systemNodeCommand)
      || Object.keys(process.env).some((name) => !allowedEnvironment.has(name))) {
      throw new Error('Release collector did not start in its bounded protected Node environment');
    }
    main();
  }
}
