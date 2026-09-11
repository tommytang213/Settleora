#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readlinkSync, readSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildManifest,
  canonicalJson,
  computeIdentityDigest,
  containsSensitiveMaterial,
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
import { assertTrackedWorktreeMatchesHead, createUserWebDistManifest } from '../ci/user-web-dist-manifest.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const maxTrustedToolBytes = 256 * 1024 * 1024;
const maxAndroidArtifactBytes = 256 * 1024 * 1024;
const maxAndroidMappingBytes = 128 * 1024 * 1024;
const maxAndroidMetadataBytes = 4 * 1024 * 1024;
const processCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const processSource = Object.freeze({
  commit: processCommit,
  tree: execFileSync('git', ['rev-parse', `${processCommit}^{tree}`], { cwd: repoRoot, encoding: 'utf8' }).trim(),
});
const committedVerifierHelper = execFileSync('git', ['show', `${processSource.commit}:tools/release/sealed_android_verifier.py`], {
  cwd: repoRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
  maxBuffer: 1024 * 1024,
});

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
  return JSON.parse(text);
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

function inspect(reference, format) {
  return JSON.parse(execFileSync('docker', ['buildx', 'imagetools', 'inspect', reference, '--format', format], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
}

function inspectRecord(reference) {
  return inspect(reference, '{{json .}}');
}

function verifyLiveRegistry(input, retained = false) {
  if (input.registryResolutionMode !== 'live-read-only') throw new Error('CLI requires registryResolutionMode=live-read-only');
  const platform = input.platform;
  const verify = (image, label, revision) => {
    const reference = retained ? `${image.repository}@${image.indexDigest}` : registryReference(image);
    const record = inspectRecord(reference);
    validateRegistryDocument(image, record.manifest, platform, label);
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
    const run = JSON.parse(execFileSync('gh', ['api', `repos/tommytang213/Settleora/actions/runs/${publication.runId}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    validatePublicationRunDocument(publication, run, sourceCommit);
    const jobs = JSON.parse(execFileSync('gh', ['api', `repos/tommytang213/Settleora/actions/runs/${publication.runId}/jobs?per_page=100`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    const jobId = validatePublicationJobDocument(jobs, sourceCommit);
    const jobLog = execFileSync('gh', ['api', `repos/tommytang213/Settleora/actions/jobs/${jobId}/logs`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
    validatePublicationJobLog(jobLog, image, sourceCommit);
    const provenance = inspect(reference, '{{json .Provenance.SLSA}}');
    validatePublicationProvenance(publication, provenance, sourceCommit);
    validateRegistryDocument(image, inspectRecord(reference).manifest, platform, `${label} after provenance`);
  };
  verifyPublication(input.apiImage, input.source.commit, 'apiImage');
  for (const image of input.dependencyImages) verify(image, `dependencyImages.${image.name}`);
  verifyPublication(input.rollback.apiImage, input.rollback.sourceCommit, 'rollback.apiImage');
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
    return { path: tool, dev: metadata.dev, ino: metadata.ino, sha256: digest.digest('hex') };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function trustedTool(candidate, expectedName, label) {
  return trustedFile(candidate, expectedName, label, true);
}

function assertSystemRuntime(root) {
  const visited = new Set();
  const assertProtectedAncestorChain = (missing) => {
    let existing = path.dirname(missing);
    while (!lstatSync(existing, { throwIfNoEntry: false })) {
      const parent = path.dirname(existing);
      if (parent === existing) throw new Error('Java runtime broken symlink has no protected ancestor');
      existing = parent;
    }
    const assertChain = (candidate) => {
      let cursor = '/';
      for (const part of candidate.split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        const metadata = lstatSync(cursor);
        if (metadata.uid !== 0 || (!metadata.isSymbolicLink() && (metadata.mode & 0o022) !== 0)) {
          throw new Error('Java runtime broken symlink target is not protected by system-owned ancestors');
        }
      }
    };
    assertChain(existing);
    assertChain(realpathSync(existing));
  };
  const visit = (candidate) => {
    const metadata = lstatSync(candidate);
    if (metadata.isSymbolicLink()) {
      if (metadata.uid !== 0) throw new Error('Java runtime symlink is not system-controlled');
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
    if (metadata.uid !== 0 || (metadata.mode & 0o022) !== 0) throw new Error('Java runtime must be root-owned and not writable by the invoking user, group, or others');
    const key = `${metadata.dev}:${metadata.ino}`;
    if (visited.has(key)) return;
    visited.add(key);
    if (metadata.isDirectory()) {
      for (const entry of readdirSync(candidate)) visit(path.join(candidate, entry));
    } else if (!metadata.isFile()) {
      throw new Error('Java runtime contains an unsupported filesystem entry');
    }
  };
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
    result = JSON.parse(execFileSync('/usr/bin/python3', ['-I', '-S', '-', kind, javaPath, ...tools.map((tool) => tool.sha256)], {
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
  return { certificate, embeddedR8MappingSha256: aabObservation.embeddedR8MappingSha256, apk, aab };
}

export function assertCommitHasNoSymlinks(commit, label, root = repoRoot) {
  const records = execFileSync('git', ['ls-tree', '-r', '-z', commit], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    .toString('utf8').split('\0').filter(Boolean);
  if (records.some((record) => record.startsWith('120000 '))) throw new Error(`${label} source snapshot contains a tracked symlink`);
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

function exactSourceSnapshot(prefix, privateParent, callback) {
  const source = {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
    tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
  };
  assertCleanCompletion(repoRoot, `${prefix} requires a clean exact-source checkout`);
  assertOwnedEvidenceDirectory(privateParent);
  const container = path.join(privateParent, `.settleora-${prefix}-source-${randomUUID()}`);
  const snapshot = path.join(container, 'source');
  const archive = path.join(container, 'source.tar');
  mkdirSync(container, { recursive: false, mode: 0o700 });
  mkdirSync(snapshot, { recursive: false, mode: 0o700 });
  try {
    assertCommitHasNoSymlinks(source.commit, prefix);
    execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, source.commit], { cwd: repoRoot, stdio: ['ignore', 'ignore', 'pipe'] });
    execFileSync('/usr/bin/tar', ['-xf', archive, '-C', snapshot], { stdio: ['ignore', 'ignore', 'pipe'] });
    rmSync(archive, { force: false });
    return callback(snapshot, source);
  } finally {
    const metadata = lstatSync(container, { throwIfNoEntry: false });
    if (metadata?.isDirectory() && !metadata.isSymbolicLink()) rmSync(container, { recursive: true, force: false });
    const after = {
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
      tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
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
    execFileSync('npm', ['ci'], { cwd: webRoot, stdio: 'inherit' });
    execFileSync('npm', ['run', 'build'], { cwd: webRoot, stdio: 'inherit' });
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
        buildTools: { node: process.version, npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(), typescript: version('typescript'), vite: version('vite') },
      },
    });
    return source;
  });
}

function collectAndroidUnsafe(options, emit = true) {
  const flutter = trustedTool(options.flutter, 'flutter', 'Flutter tool').path;
  const output = path.resolve(options.output ?? '');
  const relative = path.relative('/workspace/logs', output);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Android evidence output must remain under /workspace/logs');
  assertNoSymlinkAncestors(output);
  if (lstatSync(output, { throwIfNoEntry: false })) throw new Error('Android evidence output directory must not already exist');
  mkdirSync(output, { recursive: false, mode: 0o700 });
  const sourceBefore = {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
    tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
  };
  assertTrackedWorktreeMatchesHead(repoRoot);
  if (execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8' }).trim()) throw new Error('Android build requires a clean exact-source checkout');
  const snapshotContainer = path.join(output, `.settleora-android-source-${randomUUID()}`);
  const snapshotRoot = path.join(snapshotContainer, 'source');
  const archive = path.join(snapshotContainer, 'source.tar');
  mkdirSync(snapshotContainer, { recursive: false, mode: 0o700 });
  mkdirSync(snapshotRoot, { recursive: false, mode: 0o700 });
  let copiedIdentities;
  try {
    assertCommitHasNoSymlinks(sourceBefore.commit, 'Android');
    execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, sourceBefore.commit], { cwd: repoRoot, stdio: ['ignore', 'ignore', 'pipe'] });
    execFileSync('/usr/bin/tar', ['-xf', archive, '-C', snapshotRoot], { stdio: ['ignore', 'ignore', 'pipe'] });
    rmSync(archive, { force: false });
    execFileSync(flutter, ['clean'], { cwd: path.join(snapshotRoot, 'apps/mobile'), stdio: 'inherit' });
    execFileSync(flutter, ['build', 'apk', '--release'], { cwd: path.join(snapshotRoot, 'apps/mobile'), stdio: 'inherit' });
    execFileSync(flutter, ['build', 'appbundle', '--release'], { cwd: path.join(snapshotRoot, 'apps/mobile'), stdio: 'inherit' });
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
    };
    copyBoundedFile(path.join(snapshotRoot, files.metadata[0]), path.join(output, files.metadata[1]), maxAndroidMetadataBytes, 'Android output metadata');
  } finally {
    const metadata = lstatSync(snapshotContainer, { throwIfNoEntry: false });
    if (metadata?.isDirectory() && !metadata.isSymbolicLink()) rmSync(snapshotContainer, { recursive: true, force: false });
  }
  const source = {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
    tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
  };
  assertTrackedWorktreeMatchesHead(repoRoot);
  if (canonicalJson(source) !== canonicalJson(sourceBefore) || execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8' }).trim()) {
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
    artifacts: { apk: artifact('apk'), aab: artifact('aab'), r8MappingSha256: copiedIdentities.mapping.sha256 },
  };
  writeFileSync(path.join(output, 'build-provenance.json'), canonicalJson(provenance), { flag: 'wx', mode: 0o444 });
  const result = { status: 'collected', output, source };
  if (emit) process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

function collectAndroid(options, emit = true) {
  return collectAndroidUnsafe(options, emit);
}

function assertNoSymlinkAncestors(candidate) {
  let cursor = path.resolve(candidate);
  while (cursor !== '/workspace/logs') {
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

function retainReleaseNotes(input, output) {
  const bytes = safeBytes(input.releaseNotes.path, 'Release-note evidence input');
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
  if (input.retention?.canonicalEvidenceDirectory !== expected) throw new Error('Retention directory must exactly bind the candidate ID before collection');
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
  if (execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim()) throw new Error(message);
}

export function main(argv = process.argv.slice(2)) {
 try {
  const options = args(argv);
  if (options.command === 'collect-android') {
    if (!options.flutter || !options.output) throw new Error('collect-android requires --flutter and --output');
    collectAndroid(options);
  } else if (options.command === 'assemble') {
    if (!options.input || !options.output || !options.flutter) throw new Error('assemble requires --input, --output and --flutter');
    const supplied = safeInput(options.input, 'Evidence input');
    const candidateRoot = canonicalCandidateDirectory(supplied);
    assertOwnedEvidenceDirectory(candidateRoot);
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
    if (!options.manifest || !options.input) throw new Error('validate requires --manifest and --input for independent recollection');
    const requestedManifest = path.resolve(options.manifest);
    const requestedCandidateRoot = path.dirname(requestedManifest);
    if (path.dirname(requestedCandidateRoot) !== '/workspace/logs/settleora-release-candidates'
      || path.basename(requestedManifest) !== 'release-identity-manifest.json') throw new Error('Manifest is not in a canonical candidate directory');
    validateCandidateId(path.basename(requestedCandidateRoot));
    assertOwnedEvidenceDirectory(requestedCandidateRoot);
    const initialManifestBytes = safeBytes(options.manifest, 'Manifest');
    const manifest = validateManifest(JSON.parse(initialManifestBytes.toString('utf8')));
    canonicalManifestPath(manifest, options.manifest);
    const supplied = safeInput(options.input, 'Evidence input');
    const webValidation = path.join(canonicalCandidateDirectory(supplied), `.web-validation-${randomUUID()}`);
    try {
      const canonicalInputs = canonicalReleaseNotesInput(canonicalWebInput(supplied));
      const unsignedInput = canonicalAndroidInput(canonicalInputs, { certificate: '0'.repeat(64), embeddedR8MappingSha256: '0'.repeat(64) });
      const signature = verifyAndroidSignature(unsignedInput, options);
      const retainedInput = canonicalAndroidInput(canonicalInputs, signature);
      const retained = buildManifest(repoRoot, retainedInput);
      collectWebExactSource(webValidation);
      const rebuiltInput = canonicalAndroidInput(collectedWebInput(canonicalReleaseNotesInput(supplied), webValidation), signature);
      const rebuilt = buildManifest(repoRoot, rebuiltInput);
      verifyLiveRegistry(retainedInput, true);
      const retainedAfterRebuild = buildManifest(repoRoot, retainedInput);
      assertCleanCompletion(repoRoot, 'Source changed before validation completed');
      if (canonicalJson({ ...retained, generatedAt: manifest.generatedAt }) !== canonicalJson(manifest)
        || canonicalJson({ ...retainedAfterRebuild, generatedAt: manifest.generatedAt }) !== canonicalJson(manifest)
        || canonicalJson({ ...rebuilt, generatedAt: manifest.generatedAt }) !== canonicalJson(manifest)) {
        throw new Error('Manifest differs from independently recollected evidence');
      }
      if (!safeBytes(options.manifest, 'Manifest').equals(initialManifestBytes)) throw new Error('Canonical manifest changed during validation');
    } finally {
      const metadata = lstatSync(webValidation, { throwIfNoEntry: false });
      if (metadata?.isDirectory() && !metadata.isSymbolicLink()) rmSync(webValidation, { recursive: true, force: false });
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
