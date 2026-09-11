#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildManifest,
  canonicalJson,
  computeIdentityDigest,
  validateRegistryDocument,
  validateRegistryRevision,
  validateManifest,
} from './day1-release-identity.mjs';

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

function safeInput(candidate, label) {
  const absolute = path.resolve(candidate);
  const metadata = lstatSync(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink() || realpathSync(absolute) !== absolute) throw new Error(`${label} must be a real regular file without symlink indirection`);
  return JSON.parse(readFileSync(absolute, 'utf8'));
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

function verifyLiveRegistry(input) {
  if (input.registryResolutionMode !== 'live-read-only') throw new Error('CLI requires registryResolutionMode=live-read-only');
  const platform = input.platform;
  const verify = (image, label, revision) => {
    const reference = registryReference(image);
    const document = inspect(reference, '{{json .Manifest}}');
    validateRegistryDocument(image, document, platform, label);
    if (revision) {
      const selected = inspect(`${reference}@${image.platformDigest}`, '{{json .Image}}');
      validateRegistryRevision(image, selected, revision, label);
    }
  };
  verify(input.apiImage, 'apiImage', input.source.commit);
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
  const certificate = /Signer #1 certificate SHA-256 digest:\s*([0-9a-f]{64})/iu.exec(output)?.[1]?.toLowerCase();
  if (!/Signer #1 certificate DN:.*CN=Android Debug/u.test(output) || !certificate) {
    throw new Error('Android APK signature observation mismatch');
  }
  const javaHome = path.resolve(options['java-home'] ?? '');
  const jarsigner = trustedTool(path.join(javaHome, 'bin', 'jarsigner'), 'jarsigner', 'Java jarsigner');
  const keytool = trustedTool(path.join(javaHome, 'bin', 'keytool'), 'keytool', 'Java keytool');
  const aabVerification = execFileSync(jarsigner, ['-verify', '-verbose', path.resolve(input.android.aabPath)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const unsignedEntries = aabVerification.split(/\r?\n/u).filter((line) => /^\s*\d+\s+\w{3}\s/u.test(line) && !line.includes('META-INF/'));
  if (!/jar verified\./u.test(aabVerification) || unsignedEntries.length) throw new Error('Android AAB contains unsigned entries');
  const aabCertificate = execFileSync(keytool, ['-printcert', '-jarfile', path.resolve(input.android.aabPath)], { encoding: 'utf8' });
  const aabDigest = /SHA256:\s*([0-9A-F:]{95})/u.exec(aabCertificate)?.[1]?.replaceAll(':', '').toLowerCase();
  if (!/Owner:.*CN=Android Debug/u.test(aabCertificate) || aabDigest !== certificate) {
    throw new Error('Android AAB signature observation mismatch');
  }
  return certificate;
}

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function collectAndroid(options, emit = true) {
  const flutter = trustedTool(options.flutter, 'flutter', 'Flutter tool');
  const output = path.resolve(options.output ?? '');
  const relative = path.relative('/workspace/logs', output);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Android evidence output must remain under /workspace/logs');
  if (lstatSync(output, { throwIfNoEntry: false })) throw new Error('Android evidence output directory must not already exist');
  const sourceBefore = {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
    tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
  };
  if (execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8' }).trim()) throw new Error('Android build requires a clean exact-source checkout');
  execFileSync(flutter, ['clean'], { cwd: path.join(repoRoot, 'apps/mobile'), stdio: 'inherit' });
  execFileSync(flutter, ['build', 'apk', '--release'], { cwd: path.join(repoRoot, 'apps/mobile'), stdio: 'inherit' });
  execFileSync(flutter, ['build', 'appbundle', '--release'], { cwd: path.join(repoRoot, 'apps/mobile'), stdio: 'inherit' });
  const source = {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
    tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
  };
  if (canonicalJson(source) !== canonicalJson(sourceBefore) || execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8' }).trim()) {
    throw new Error('Android build source changed during collection');
  }
  const files = {
    apk: ['apps/mobile/build/app/outputs/flutter-apk/app-release.apk', 'app-release.apk'],
    aab: ['apps/mobile/build/app/outputs/bundle/release/app-release.aab', 'app-release.aab'],
    mapping: ['apps/mobile/build/app/outputs/mapping/release/mapping.txt', 'mapping.txt'],
    metadata: ['apps/mobile/build/app/outputs/apk/release/output-metadata.json', 'output-metadata.json'],
  };
  mkdirSync(output, { recursive: false, mode: 0o755 });
  for (const [relative, name] of Object.values(files)) copyFileSync(path.join(repoRoot, relative), path.join(output, name));
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

function collectedAndroidInput(input, output, certificate) {
  return {
    ...input,
    android: {
      evidenceRoot: output,
      apkPath: path.join(output, 'app-release.apk'),
      aabPath: path.join(output, 'app-release.aab'),
      mappingPath: path.join(output, 'mapping.txt'),
      outputMetadataPath: path.join(output, 'output-metadata.json'),
      buildProvenancePath: path.join(output, 'build-provenance.json'),
      signerCertificateSha256: certificate,
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
  const expected = `/workspace/logs/settleora-release-candidates/${input.source?.candidateId}`;
  if (input.retention?.canonicalEvidenceDirectory !== expected) throw new Error('Retention directory must exactly bind the candidate ID before collection');
  return expected;
}

try {
  const options = args(process.argv.slice(2));
  if (options.command === 'collect-android') {
    if (!options.flutter || !options.output) throw new Error('collect-android requires --flutter and --output');
    collectAndroid(options);
  } else if (options.command === 'assemble') {
    if (!options.input || !options.output || !options.flutter) throw new Error('assemble requires --input, --output and --flutter');
    const supplied = safeInput(options.input, 'Evidence input');
    const androidRoot = path.join(canonicalCandidateDirectory(supplied), 'android');
    collectAndroid({ ...options, output: androidRoot }, false);
    const unsignedInput = collectedAndroidInput(supplied, androidRoot, '0'.repeat(64));
    const certificate = verifyAndroidSignature(unsignedInput, options);
    const input = collectedAndroidInput(supplied, androidRoot, certificate);
    const manifest = buildManifest(repoRoot, input);
    verifyLiveRegistry(input);
    const output = safeOutput(input, options.output);
    mkdirSync(path.dirname(output), { recursive: true, mode: 0o755 });
    writeFileSync(output, canonicalJson(manifest), { flag: 'wx', mode: 0o444 });
    process.stdout.write(`${JSON.stringify({ status: 'assembled', identityDigest: manifest.identityDigest, output })}\n`);
  } else if (options.command === 'validate') {
    if (!options.manifest || !options.input) throw new Error('validate requires --manifest and --input for independent recollection');
    const manifest = validateManifest(safeInput(options.manifest, 'Manifest'));
    const supplied = safeInput(options.input, 'Evidence input');
    const certificate = verifyAndroidSignature(supplied, options);
    const input = { ...supplied, android: { ...supplied.android, signerCertificateSha256: certificate } };
    const rebuilt = buildManifest(repoRoot, input);
    verifyLiveRegistry(input);
    if (canonicalJson({ ...rebuilt, generatedAt: manifest.generatedAt }) !== canonicalJson(manifest)) {
      throw new Error('Manifest differs from independently recollected evidence');
    }
    process.stdout.write(`${JSON.stringify({ status: 'valid', identityDigest: computeIdentityDigest(manifest) })}\n`);
  } else {
    throw new Error('Command must be assemble or validate');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
