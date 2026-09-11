import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shaPattern = /^[0-9a-f]{40}$/;
const unsafePathPatterns = [
  /(^|\/)\.env($|[./-])/i,
  /(^|\/)(?:secrets?|credentials?|tokens?|ssh|private[-_]?keys?)(?:\/|$)/i,
  /(^|\/)[^/]*private[-_]?key[^/]*$/i,
  /(^|\/)(\.npmrc|\.yarnrc(?:\.yml)?|\.pnpmrc|\.netrc|\.pypirc|\.git-credentials|(?:credentials?|secrets?)\.(?:json|ya?ml|txt)|[^/]+\.(?:map|pem|key|p12|pfx))$/i,
  /(^|\/)(?:\.ssh|\.aws|\.azure|\.config\/gcloud)(?:\/|$)/i,
];
const unsafeContentPatterns = [
  /-----BEGIN [^-\r\n]*PRIVATE KEY[^-\r\n]*-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{24,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\b(?:gh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\b(?:(?:[A-Za-z_][A-Za-z0-9_]*)?(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTHORIZATION)|authorization|x-goog-api-key)\b\s*[:=]\s*(?![A-Za-z_$][A-Za-z0-9_$]*\.)["']?[A-Za-z0-9._~+/-]{8,}/i,
  /\bbearer\s+[A-Za-z0-9._~+/-]{12,}/i,
  /["'](?:client_secret|private_key|refresh_token)["']\s*:/i,
  /(?::_authToken|_auth|npmAuthToken)\s*[:=]\s*[^\s"']+/i,
  /(?:\/workspace\/(?:repos|logs)\/|\/home\/[^/\s]+\/(?:work|workspace|repos)\/|\/Users\/[^/\s]+\/(?:work|workspace|repos)\/|[A-Za-z]:\\Users\\[^\\\s]+\\(?:work|workspace|repos)\\)/,
  /sourceMappingURL\s*=/i,
];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

function git(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function packageVersion(lock, packageName) {
  const version = lock.packages?.[`node_modules/${packageName}`]?.version;
  if (typeof version !== 'string' || !version) throw new Error(`Missing ${packageName} version in web package lock`);
  return version;
}

function assertInside(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error(`${label} must be inside ${root}`);
  }
}

function artifactRootLabel(distAbsolute, provenance) {
  const canonicalDist = path.join(repoRoot, 'apps/web-user/dist');
  if (distAbsolute === canonicalDist) return 'apps/web-user/dist';
  const label = provenance?.artifactRoot;
  if (
    typeof label !== 'string'
    || !label
    || path.isAbsolute(label)
    || /[\\\r\n\0]/u.test(label)
    || label.split('/').includes('..')
  ) {
    throw new Error('Noncanonical dist requires a safe provenance artifactRoot label');
  }
  return label;
}

function collectFiles(distRoot) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const metadata = lstatSync(absolute);
      if (metadata.isSymbolicLink()) throw new Error(`Symlinks are not allowed in user-web dist: ${absolute}`);
      if (metadata.isDirectory()) {
        visit(absolute);
      } else if (metadata.isFile()) {
        const relative = path.relative(distRoot, absolute).split(path.sep).join('/');
        if (!relative || relative.startsWith('/') || relative.split('/').includes('..') || /[\r\n\0]/u.test(relative)) {
          throw new Error(`Unsafe dist path: ${JSON.stringify(relative)}`);
        }
        const contents = readFileSync(absolute);
        if (contents.length !== metadata.size) throw new Error(`User-web dist changed while reading: ${absolute}`);
        files.push({ absolute, path: relative, size: contents.length, contents });
      } else {
        throw new Error(`Only regular files are allowed in user-web dist: ${absolute}`);
      }
    }
  };
  visit(distRoot);
  return files.sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)));
}

function scanPublicArtifact(files) {
  for (const file of files) {
    if (unsafePathPatterns.some((pattern) => pattern.test(file.path))) {
      throw new Error(`Unsafe public artifact path: ${file.path}`);
    }
    const text = file.contents.toString('utf8');
    try {
      const candidate = JSON.parse(text);
      if (
        candidate
        && typeof candidate === 'object'
        && !Array.isArray(candidate)
        && candidate.version === 3
        && (
          (Array.isArray(candidate.sources) && typeof candidate.mappings === 'string')
          || Array.isArray(candidate.sections)
        )
      ) {
        throw new Error(`Source-map payload is not allowed in public artifact: ${file.path}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Source-map payload')) throw error;
    }
    for (const pattern of unsafeContentPatterns) {
      if (pattern.test(text)) throw new Error(`Potential sensitive or host-specific material in ${file.path}`);
    }
  }
}

export function createUserWebDistManifest({
  dist = path.join(repoRoot, 'apps/web-user/dist'),
  output = path.join(repoRoot, 'apps/web-user/user-web-dist-manifest.json'),
  expectedSourceSha,
  provenance,
} = {}) {
  const distAbsolute = path.resolve(dist);
  const outputAbsolute = path.resolve(output);
  const artifactRoot = artifactRootLabel(distAbsolute, provenance);
  if (lstatSync(distAbsolute).isSymbolicLink()) throw new Error(`User-web dist root must not be a symlink: ${distAbsolute}`);
  if (!statSync(distAbsolute).isDirectory()) throw new Error(`User-web dist is not a directory: ${distAbsolute}`);
  assertInside(realpathSync(path.dirname(distAbsolute)), realpathSync(distAbsolute), 'Dist');
  const outputRelativeToDist = path.relative(distAbsolute, outputAbsolute);
  if (!outputRelativeToDist.startsWith(`..${path.sep}`) && outputRelativeToDist !== '..') {
    throw new Error('Manifest output must remain outside the hashed dist tree');
  }
  if (lstatSync(outputAbsolute, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new Error('Manifest output must not be a symlink');
  }
  if (!provenance && git(['status', '--porcelain=v1', '--untracked-files=no'])) {
    throw new Error('Tracked build inputs changed after checkout');
  }

  const files = collectFiles(distAbsolute);
  if (files.length === 0) throw new Error('User-web dist must contain at least one regular file');
  scanPublicArtifact(files);

  const source = provenance?.source ?? {
    commit: git(['rev-parse', 'HEAD']),
    tree: git(['rev-parse', 'HEAD^{tree}']),
  };
  if (!shaPattern.test(source.commit) || !shaPattern.test(source.tree)) throw new Error('Invalid source commit or tree identity');
  if (expectedSourceSha && source.commit !== expectedSourceSha) {
    throw new Error(`Source checkout mismatch: expected ${expectedSourceSha}, found ${source.commit}`);
  }

  const lockPath = path.join(repoRoot, 'apps/web-user/package-lock.json');
  const lockBytes = readFileSync(lockPath);
  const lock = JSON.parse(lockBytes);
  const fileEntries = files.map((file) => ({
    path: file.path,
    size: file.size,
    sha256: sha256(file.contents),
  }));
  const treeInput = fileEntries.map((file) => `${file.sha256}  ${file.size}  ${file.path}\n`).join('');
  const manifest = {
    schema: 'settleora.user-web-dist-manifest.v1',
    source,
    dependencyLock: {
      path: 'apps/web-user/package-lock.json',
      sha256: sha256(lockBytes),
      lockfileVersion: lock.lockfileVersion,
    },
    buildTools: provenance?.buildTools ?? {
      node: process.version,
      npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
      typescript: packageVersion(lock, 'typescript'),
      vite: packageVersion(lock, 'vite'),
    },
    artifact: {
      root: artifactRoot,
      fileCount: fileEntries.length,
      totalBytes: fileEntries.reduce((sum, file) => sum + file.size, 0),
      treeDigestAlgorithm: 'sha256(canonical-file-records-v1)',
      treeSha256: sha256(treeInput),
      files: fileEntries,
    },
    publicArtifactChecks: {
      symlinksRejected: true,
      sourceMapsRejected: true,
      sensitiveMaterialScan: 'passed',
    },
  };
  mkdirSync(path.dirname(outputAbsolute), { recursive: true });
  writeFileSync(outputAbsolute, canonicalJson(manifest), { flag: 'w', mode: 0o644 });
  const verifiedEntries = collectFiles(distAbsolute).map((file) => ({
    path: file.path,
    size: file.size,
    sha256: sha256(file.contents),
  }));
  if (canonicalJson(verifiedEntries) !== canonicalJson(fileEntries)) {
    throw new Error('User-web dist changed while package evidence was generated');
  }
  return manifest;
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!value || !['--dist', '--output', '--expected-source-sha'].includes(key)) {
      throw new Error('Usage: user-web-dist-manifest.mjs [--dist PATH] [--output PATH] [--expected-source-sha SHA]');
    }
    if (key === '--dist') options.dist = value;
    if (key === '--output') options.output = value;
    if (key === '--expected-source-sha') options.expectedSourceSha = value;
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const manifest = createUserWebDistManifest(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({
      sourceSha: manifest.source.commit,
      sourceTree: manifest.source.tree,
      fileCount: manifest.artifact.fileCount,
      totalBytes: manifest.artifact.totalBytes,
      treeSha256: manifest.artifact.treeSha256,
    })}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
