#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { closeSync, constants, copyFileSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
  validateManifest,
} from './day1-release-identity.mjs';
import { assertTrackedWorktreeMatchesHead, createUserWebDistManifest } from '../ci/user-web-dist-manifest.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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
  const absolute = path.resolve(candidate);
  let descriptor;
  let text;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(descriptor);
    text = readFileSync(descriptor, 'utf8');
    const current = lstatSync(absolute);
    if (!opened.isFile() || current.isSymbolicLink() || current.dev !== opened.dev || current.ino !== opened.ino || realpathSync(absolute) !== absolute || Buffer.byteLength(text) !== opened.size) {
      throw new Error(`${label} changed or resolved through indirection while being read`);
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (containsSensitiveMaterial(text)) {
    throw new Error(`${label} contains potentially sensitive material`);
  }
  return JSON.parse(text);
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

function verifyLiveRegistry(input) {
  if (input.registryResolutionMode !== 'live-read-only') throw new Error('CLI requires registryResolutionMode=live-read-only');
  const platform = input.platform;
  const verify = (image, label, revision) => {
    const reference = registryReference(image);
    const record = inspectRecord(reference);
    validateRegistryDocument(image, record.manifest, platform, label);
    if (revision) {
      const selected = inspectRecord(`${reference}@${image.platformDigest}`);
      validateRegistryRevision(image, selected.image, revision, label);
    }
    return reference;
  };
  const apiReference = verify(input.apiImage, 'apiImage', input.source.commit);
  const publication = validatePublicationRunUrl(input.apiImage.publicationRunUrl, input.source.commit);
  const run = JSON.parse(execFileSync('gh', ['api', `repos/tommytang213/Settleora/actions/runs/${publication.runId}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
  validatePublicationRunDocument(publication, run, input.source.commit);
  const jobs = JSON.parse(execFileSync('gh', ['api', `repos/tommytang213/Settleora/actions/runs/${publication.runId}/jobs?per_page=100`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
  const jobId = validatePublicationJobDocument(jobs, input.source.commit);
  const jobLog = execFileSync('gh', ['api', `repos/tommytang213/Settleora/actions/jobs/${jobId}/logs`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  });
  validatePublicationJobLog(jobLog, input.apiImage, input.source.commit);
  const provenance = inspect(apiReference, '{{json .Provenance.SLSA}}');
  validatePublicationProvenance(publication, provenance, input.source.commit);
  validateRegistryDocument(input.apiImage, inspectRecord(apiReference).manifest, platform, 'apiImage after provenance');
  for (const image of input.dependencyImages) verify(image, `dependencyImages.${image.name}`);
  verify(input.rollback.apiImage, 'rollback.apiImage', input.rollback.sourceCommit);
}

function trustedTool(candidate, expectedName, label) {
  const tool = path.resolve(candidate ?? '');
  const metadata = lstatSync(tool, { throwIfNoEntry: false });
  if (path.basename(tool) !== expectedName || !metadata?.isFile() || metadata.isSymbolicLink() || realpathSync(tool) !== tool || !(metadata.mode & 0o111)) {
    throw new Error(`${label} must be an explicitly trusted real executable named ${expectedName}`);
  }
  return tool;
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

function verifyAndroidSignature(input, options) {
  const sdkRoot = path.resolve(options['android-sdk-root'] ?? '');
  const versions = lstatSync(path.join(sdkRoot, 'build-tools'), { throwIfNoEntry: false });
  if (!versions?.isDirectory() || versions.isSymbolicLink()) throw new Error('Trusted Android SDK root is invalid');
  const version = readdirSync(path.join(sdkRoot, 'build-tools'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort(new Intl.Collator('en', { numeric: true }).compare)
    .at(-1);
  const apksigner = path.join(sdkRoot, 'build-tools', version ?? '', 'apksigner');
  const tool = trustedTool(apksigner, 'apksigner', 'Android apksigner');
  const output = execFileSync(tool, ['verify', '--verbose', '--print-certs', path.resolve(input.android.apkPath)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const certificate = parseSingleApkSigner(output);
  const javaHome = path.resolve(options['java-home'] ?? '');
  const jarsigner = trustedTool(path.join(javaHome, 'bin', 'jarsigner'), 'jarsigner', 'Java jarsigner');
  const keytool = trustedTool(path.join(javaHome, 'bin', 'keytool'), 'keytool', 'Java keytool');
  const aabVerification = execFileSync(jarsigner, ['-J-Duser.language=en', '-J-Duser.country=US', '-verify', '-verbose', '-certs', path.resolve(input.android.aabPath)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
  const signatureControl = /\sMETA-INF\/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))$/u;
  const contentEntries = aabVerification.split(/\r?\n/u).filter((line) => /^[smk? ]{3}\s+\d+\s+\w{3}\s/u.test(line));
  const unsignedEntries = contentEntries.filter((line) => !/^s/u.test(line) && !signatureControl.test(line));
  if (!/jar verified\./u.test(aabVerification) || contentEntries.length === 0 || unsignedEntries.length) throw new Error('Android AAB contains unsigned entries');
  const aabCertificate = execFileSync(keytool, ['-J-Duser.language=en', '-J-Duser.country=US', '-printcert', '-jarfile', path.resolve(input.android.aabPath)], { encoding: 'utf8' });
  const aabDigests = new Set([...aabCertificate.matchAll(/SHA256:\s*([0-9A-F:]{95})/gu)].map((match) => match[1].replaceAll(':', '').toLowerCase()));
  const signerNames = new Set([...aabVerification.matchAll(/^\s+X\.509,\s*(.+)$/gmu)].map((match) => match[1]));
  if (aabDigests.size !== 1 || !aabDigests.has(certificate) || signerNames.size !== 1 || ![...signerNames][0]?.includes('CN=Android Debug')) {
    throw new Error('Android AAB signature observation mismatch');
  }
  const unzip = trustedTool('/usr/bin/unzip', 'unzip', 'System unzip');
  const mappingSize = statSync(path.resolve(input.android.mappingPath)).size;
  if (mappingSize < 1 || mappingSize > 128 * 1024 * 1024) throw new Error('Android R8 mapping exceeds the bounded verification size');
  const embeddedMapping = execFileSync(unzip, ['-p', path.resolve(input.android.aabPath), 'BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map'], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: mappingSize + 1024 * 1024 });
  const r8Metadata = execFileSync(unzip, ['-p', path.resolve(input.android.aabPath), 'BUNDLE-METADATA/com.android.tools/r8.json'], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 });
  if (embeddedMapping.length === 0 || r8Metadata.length === 0) throw new Error('Android AAB is missing embedded R8 evidence');
  return { certificate, embeddedR8MappingSha256: hash(embeddedMapping) };
}

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function exactSourceSnapshot(prefix, callback) {
  const source = {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
    tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
  };
  assertCleanCompletion(repoRoot, `${prefix} requires a clean exact-source checkout`);
  const container = path.join('/workspace/logs', `.settleora-${prefix}-source-${randomUUID()}`);
  const snapshot = path.join(container, 'source');
  const archive = path.join(container, 'source.tar');
  mkdirSync(container, { recursive: false, mode: 0o700 });
  mkdirSync(snapshot, { recursive: false, mode: 0o700 });
  try {
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
  return exactSourceSnapshot('web', (snapshot, source) => {
    const webRoot = path.join(snapshot, 'apps/web-user');
    execFileSync('npm', ['ci'], { cwd: webRoot, stdio: 'inherit' });
    execFileSync('npm', ['run', 'build'], { cwd: webRoot, stdio: 'inherit' });
    const lock = JSON.parse(readFileSync(path.join(repoRoot, 'apps/web-user/package-lock.json'), 'utf8'));
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
  const flutter = trustedTool(options.flutter, 'flutter', 'Flutter tool');
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
  const snapshotContainer = path.join('/workspace/logs', `.settleora-android-source-${randomUUID()}`);
  const snapshotRoot = path.join(snapshotContainer, 'source');
  const archive = path.join(snapshotContainer, 'source.tar');
  mkdirSync(snapshotContainer, { recursive: false, mode: 0o700 });
  mkdirSync(snapshotRoot, { recursive: false, mode: 0o700 });
  try {
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
    for (const [relative, name] of Object.values(files)) copyFileSync(path.join(snapshotRoot, relative), path.join(output, name), constants.COPYFILE_EXCL);
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
  const artifact = (kind) => {
    const [relative, name] = files[kind];
    const bytes = readFileSync(path.join(output, name));
    return { path: relative, size: bytes.length, sha256: hash(bytes) };
  };
  const provenance = {
    schema: 'settleora.android-exact-source-build.v1', source,
    commands: ['flutter clean', 'flutter build apk --release', 'flutter build appbundle --release'],
    artifacts: { apk: artifact('apk'), aab: artifact('aab'), r8MappingSha256: hash(readFileSync(path.join(output, files.mapping[1]))) },
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
    if (!existed) {
      const metadata = lstatSync(output, { throwIfNoEntry: false });
      if (metadata?.isDirectory() && !metadata.isSymbolicLink()) rmSync(output, { recursive: true, force: false });
    }
    throw error;
  }
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
    const androidRoot = path.join(candidateRoot, 'android');
    const webRoot = path.join(candidateRoot, 'web');
    if (lstatSync(androidRoot, { throwIfNoEntry: false })) throw new Error('Canonical Android evidence directory must not already exist');
    if (lstatSync(webRoot, { throwIfNoEntry: false })) throw new Error('Canonical user-web evidence directory must not already exist');
    const androidStaging = path.join(candidateRoot, `.android-staging-${randomUUID()}`);
    const webStaging = path.join(candidateRoot, `.web-staging-${randomUUID()}`);
    let androidPromoted = false;
    let webPromoted = false;
    let completed = false;
    try {
      collectWebExactSource(webStaging);
      collectAndroid({ ...options, output: androidStaging }, false);
      const unsignedInput = collectedAndroidInput(collectedWebInput(supplied, webStaging), androidStaging, { certificate: '0'.repeat(64), embeddedR8MappingSha256: '0'.repeat(64) });
      const signature = verifyAndroidSignature(unsignedInput, options);
      const input = collectedAndroidInput(collectedWebInput(supplied, webStaging), androidStaging, signature);
      const manifest = buildManifest(repoRoot, input);
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
      writeFileSync(output, canonicalJson(manifest), { flag: 'wx', mode: 0o444 });
      completed = true;
      process.stdout.write(`${JSON.stringify({ status: 'assembled', identityDigest: manifest.identityDigest, output })}\n`);
    } catch (error) {
      if (!completed) {
        for (const generated of [androidPromoted ? androidRoot : androidStaging, webPromoted ? webRoot : webStaging]) {
          const metadata = lstatSync(generated, { throwIfNoEntry: false });
          if (metadata?.isDirectory() && !metadata.isSymbolicLink()) rmSync(generated, { recursive: true, force: false });
        }
      }
      throw error;
    }
  } else if (options.command === 'validate') {
    if (!options.manifest || !options.input) throw new Error('validate requires --manifest and --input for independent recollection');
    const manifest = validateManifest(safeInput(options.manifest, 'Manifest'));
    canonicalManifestPath(manifest, options.manifest);
    const supplied = safeInput(options.input, 'Evidence input');
    const webValidation = path.join(canonicalCandidateDirectory(supplied), `.web-validation-${randomUUID()}`);
    try {
      const unsignedInput = canonicalAndroidInput(canonicalWebInput(supplied), { certificate: '0'.repeat(64), embeddedR8MappingSha256: '0'.repeat(64) });
      const signature = verifyAndroidSignature(unsignedInput, options);
      const retainedInput = canonicalAndroidInput(canonicalWebInput(supplied), signature);
      const retained = buildManifest(repoRoot, retainedInput);
      collectWebExactSource(webValidation);
      const rebuiltInput = canonicalAndroidInput(collectedWebInput(supplied, webValidation), signature);
      const rebuilt = buildManifest(repoRoot, rebuiltInput);
      verifyLiveRegistry(retainedInput);
      assertCleanCompletion(repoRoot, 'Source changed before validation completed');
      if (canonicalJson({ ...retained, generatedAt: manifest.generatedAt }) !== canonicalJson(manifest)
        || canonicalJson({ ...rebuilt, generatedAt: manifest.generatedAt }) !== canonicalJson(manifest)) {
        throw new Error('Manifest differs from independently recollected evidence');
      }
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
