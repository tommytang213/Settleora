#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
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
    if (!key?.startsWith('--') || !value) throw new Error('Usage: day1-release-identity-cli.mjs <assemble|validate> --input PATH [--output PATH] [--manifest PATH]');
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

function registryReference(image, api = false) {
  return api ? `${image.repository}:${image.configuredTag}` : image.configuredTag;
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
  const verify = (image, label, api = false, revision) => {
    const reference = registryReference(image, api);
    const document = inspect(reference, '{{json .Manifest}}');
    validateRegistryDocument(image, document, platform, label);
    if (revision) {
      const selected = inspect(`${reference}@${image.platformDigest}`, '{{json .Image}}');
      validateRegistryRevision(image, selected, revision, label);
    }
  };
  verify(input.apiImage, 'apiImage', true, input.source.commit);
  for (const image of input.dependencyImages) verify(image, `dependencyImages.${image.name}`);
  verify(input.rollback.apiImage, 'rollback.apiImage', true, input.rollback.sourceCommit);
}

function verifyAndroidSignature(input) {
  const tool = path.resolve(input.android.apksignerPath ?? '');
  const metadata = lstatSync(tool, { throwIfNoEntry: false });
  if (!metadata?.isFile() || metadata.isSymbolicLink() || realpathSync(tool) !== tool) throw new Error('Android apksigner must be a real executable without symlink indirection');
  const output = execFileSync(tool, ['verify', '--verbose', '--print-certs', path.resolve(input.android.apkPath)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const certificate = /Signer #1 certificate SHA-256 digest:\s*([0-9a-f]{64})/iu.exec(output)?.[1]?.toLowerCase();
  if (!/Signer #1 certificate DN:.*CN=Android Debug/u.test(output) || certificate !== input.android.signerCertificateSha256) {
    throw new Error('Android APK signature observation mismatch');
  }
}

try {
  const options = args(process.argv.slice(2));
  if (options.command === 'assemble') {
    if (!options.input || !options.output) throw new Error('assemble requires --input and --output');
    const input = safeInput(options.input, 'Evidence input');
    verifyLiveRegistry(input);
    verifyAndroidSignature(input);
    const manifest = buildManifest(repoRoot, input);
    const output = path.resolve(options.output);
    if (lstatSync(output, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('Output must not be a symlink');
    mkdirSync(path.dirname(output), { recursive: true, mode: 0o755 });
    writeFileSync(output, canonicalJson(manifest), { flag: 'w', mode: 0o444 });
    process.stdout.write(`${JSON.stringify({ status: 'assembled', identityDigest: manifest.identityDigest, output })}\n`);
  } else if (options.command === 'validate') {
    if (!options.manifest) throw new Error('validate requires --manifest');
    const manifest = validateManifest(safeInput(options.manifest, 'Manifest'));
    if (options.input) {
      const input = safeInput(options.input, 'Evidence input');
      verifyLiveRegistry(input);
      verifyAndroidSignature(input);
      const rebuilt = buildManifest(repoRoot, input);
      if (canonicalJson({ ...rebuilt, generatedAt: manifest.generatedAt }) !== canonicalJson(manifest)) {
        throw new Error('Manifest differs from independently recollected evidence');
      }
    }
    process.stdout.write(`${JSON.stringify({ status: 'valid', identityDigest: computeIdentityDigest(manifest) })}\n`);
  } else {
    throw new Error('Command must be assemble or validate');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
