import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shaPattern = /^[0-9a-f]{40}$/;
const maxPublicArtifactFileBytes = 32 * 1024 * 1024;
const maxPublicArtifactTotalBytes = 128 * 1024 * 1024;
const maxPublicArtifactFiles = 10_000;
const maxPublicArtifactDirectories = 10_000;
const maxPublicArtifactDepth = 64;

export function currentNpmVersion() {
  const candidates = [
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/package.json'),
    '/usr/lib/node_modules/npm/package.json',
    '/usr/share/nodejs/npm/package.json',
  ];
  const packageFile = candidates.find((candidate) => existsSync(candidate));
  if (!packageFile) throw new Error('npm package metadata is unavailable');
  const descriptor = openSync(packageFile, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor);
    const current = lstatSync(packageFile);
    if (!opened.isFile() || opened.size < 1 || opened.size > 1024 * 1024 || current.isSymbolicLink()
      || current.dev !== opened.dev || current.ino !== opened.ino
      || realpathSync(packageFile) !== packageFile) throw new Error('npm metadata is not a stable bounded file');
    const bytes = Buffer.alloc(opened.size);
    for (let offset = 0; offset < opened.size;) {
      const count = readSync(descriptor, bytes, offset, opened.size - offset, offset);
      if (count < 1) throw new Error('npm CLI descriptor ended before its declared size');
      offset += count;
    }
    const after = fstatSync(descriptor);
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) throw new Error('npm metadata changed during version collection');
    const version = JSON.parse(bytes.toString('utf8')).version;
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version)) throw new Error('npm version is invalid');
    return version;
  } finally {
    closeSync(descriptor);
  }
}
const unsafePathPatterns = [
  /(^|\/)(?:\.git|\.hg|\.svn|\.bzr|_darcs)(?:\/|$)/i,
  /(^|\/)\.env($|[./-])/i,
  /(^|\/)(?:secrets?|credentials?|tokens?|ssh|private[-_]?keys?)(?:\/|$)/i,
  /(^|\/)[^/]*private[-_]?key[^/]*$/i,
  /(^|\/)(\.npmrc|\.yarnrc(?:\.yml)?|\.pnpmrc|\.netrc|\.pypirc|\.git-credentials|(?:credentials?|secrets?)\.(?:json|ya?ml|txt)|[^/]*\.map[^/]*|[^/]+\.(?:pem|key|p12|pfx))$/i,
  /(^|\/)(?:\.ssh|\.aws|\.azure|\.config\/gcloud)(?:\/|$)/i,
];
const unsafeContentPatterns = [
  /-----BEGIN [^-\r\n]*PRIVATE KEY[^-\r\n]*-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{24,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\b(?:gh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\b(?:(?:[A-Za-z_][A-Za-z0-9_]*)?(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTHORIZATION)|authorization|x-goog-api-key)\b["']?\s*[:=]\s*(?![A-Za-z_$][A-Za-z0-9_$]*\.)["']?[A-Za-z0-9._~+/-]{8,}/i,
  /\bbearer\s+[A-Za-z0-9._~+/-]{12,}/i,
  /["'](?:client_secret|private_key|refresh_token)["']\s*:/i,
  /(?::_authToken|_auth|npmAuthToken)\s*[:=]\s*[^\s"']+/i,
  /(?:\/workspace\/(?:repos|logs)\/|\/home\/[^/\s]+\/(?:work|workspace|repos)\/|\/Users\/[^/\s]+\/(?:work|workspace|repos)\/|[A-Za-z]:\\Users\\[^\\\s]+\\(?:work|workspace|repos)\\)/,
  /sourceMappingURL\s*=/i,
];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

function assertUniqueJsonMembers(text) {
  let offset = 0;
  const whitespace = () => { while (/\s/u.test(text[offset] ?? '')) offset += 1; };
  const stringValue = () => {
    const start = offset;
    if (text[offset] !== '"') throw new Error('Expected JSON string');
    offset += 1;
    while (offset < text.length) {
      if (text[offset] === '\\') {
        offset += 2;
      } else if (text[offset] === '"') {
        offset += 1;
        return JSON.parse(text.slice(start, offset));
      } else {
        offset += 1;
      }
    }
    throw new Error('Unterminated JSON string');
  };
  const value = () => {
    whitespace();
    if (text[offset] === '{') {
      offset += 1;
      whitespace();
      const keys = new Set();
      if (text[offset] === '}') { offset += 1; return; }
      while (true) {
        const key = stringValue();
        if (keys.has(key)) throw new Error('Duplicate JSON member');
        keys.add(key);
        whitespace();
        if (text[offset] !== ':') throw new Error('Expected JSON member delimiter');
        offset += 1;
        value();
        whitespace();
        if (text[offset] === '}') { offset += 1; return; }
        if (text[offset] !== ',') throw new Error('Expected JSON member separator');
        offset += 1;
        whitespace();
      }
    }
    if (text[offset] === '[') {
      offset += 1;
      whitespace();
      if (text[offset] === ']') { offset += 1; return; }
      while (true) {
        value();
        whitespace();
        if (text[offset] === ']') { offset += 1; return; }
        if (text[offset] !== ',') throw new Error('Expected JSON array separator');
        offset += 1;
      }
    }
    if (text[offset] === '"') { stringValue(); return; }
    const primitive = /^(?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null)/u.exec(text.slice(offset));
    if (!primitive) throw new Error('Expected JSON value');
    offset += primitive[0].length;
  };
  value();
  whitespace();
  if (offset !== text.length) throw new Error('Unexpected trailing JSON content');
}

function decodeStaticScriptEscapesForScan(text) {
  return text
    .replace(/\\u\{([0-9A-Fa-f]{1,6})\}/gu, (escape, digits) => {
      const value = Number.parseInt(digits, 16);
      return value <= 0x10ffff ? String.fromCodePoint(value) : escape;
    })
    .replace(/\\u([0-9A-Fa-f]{4})/gu, (_escape, digits) => String.fromCharCode(Number.parseInt(digits, 16)))
    .replace(/\\x([0-9A-Fa-f]{2})/gu, (_escape, digits) => String.fromCharCode(Number.parseInt(digits, 16)));
}

function git(args) {
  return execFileSync('/usr/bin/git', ['--no-replace-objects', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

const gitBlobObjectId = (contents) => createHash('sha1')
  .update(`blob ${contents.length}\0`)
  .update(contents)
  .digest('hex');

export function assertTrackedWorktreeMatchesHead(root = repoRoot) {
  const replacements = execFileSync('/usr/bin/git', ['--no-replace-objects', 'for-each-ref', '--format=%(refname)', 'refs/replace'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (replacements) throw new Error('Git replacement refs are not allowed for provenance collection');
  const rootBytes = Buffer.from(root);
  const verifiedDirectories = new Set(['']);
  const displayPath = (relative) => JSON.stringify(relative.toString('utf8'));
  const absolutePath = (relative) => Buffer.concat([rootBytes, Buffer.from(path.sep), relative]);
  const assertRealDirectoryAncestors = (relative) => {
    const separatorOffsets = [];
    for (let index = 0; index < relative.length; index += 1) {
      if (relative[index] === 0x2f) separatorOffsets.push(index);
    }
    for (const offset of separatorOffsets) {
      const directoryRelative = relative.subarray(0, offset);
      const key = directoryRelative.toString('hex');
      if (verifiedDirectories.has(key)) continue;
      const directory = absolutePath(directoryRelative);
      const metadata = lstatSync(directory, { throwIfNoEntry: false });
      if (!metadata?.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error(`Tracked build input ancestor is not a real directory: ${displayPath(directoryRelative)}`);
      }
      verifiedDirectories.add(key);
    }
  };
  const output = execFileSync('/usr/bin/git', ['--no-replace-objects', 'ls-tree', '-rz', '--full-tree', 'HEAD'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let start = 0; start < output.length;) {
    const end = output.indexOf(0, start);
    if (end < 0) throw new Error('Malformed NUL-delimited tracked HEAD listing');
    const record = output.subarray(start, end);
    start = end + 1;
    if (record.length === 0) continue;
    const tab = record.indexOf(0x09);
    const header = tab < 0 ? '' : record.subarray(0, tab).toString('ascii');
    const match = /^(100644|100755|120000) blob ([0-9a-f]{40})$/u.exec(header);
    if (!match || tab === record.length - 1) {
      throw new Error(`Unsupported tracked HEAD entry header: ${JSON.stringify(header)}`);
    }
    const [, expectedMode, expectedObject] = match;
    const relative = record.subarray(tab + 1);
    const absolute = absolutePath(relative);
    assertRealDirectoryAncestors(relative);
    const metadata = lstatSync(absolute, { throwIfNoEntry: false });
    if (!metadata) throw new Error(`Tracked build input is missing: ${displayPath(relative)}`);
    const actualMode = metadata.isSymbolicLink() ? '120000' : ((metadata.mode & 0o111) ? '100755' : '100644');
    if (actualMode !== expectedMode) throw new Error(`Tracked build input mode differs from HEAD: ${displayPath(relative)}`);
    if (expectedMode !== '120000' && !metadata.isFile()) {
      throw new Error(`Tracked build input is not a regular file: ${displayPath(relative)}`);
    }
    const contents = metadata.isSymbolicLink()
      ? readlinkSync(absolute, { encoding: 'buffer' })
      : readFileSync(absolute);
    if (gitBlobObjectId(contents) !== expectedObject) {
      throw new Error(`Tracked build input differs from HEAD: ${displayPath(relative)}`);
    }
  }
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

export function collectFiles(distRoot) {
  const files = [];
  let totalBytes = 0;
  let directoryCount = 0;
  const visit = (directory, depth) => {
    if (depth > maxPublicArtifactDepth) throw new Error('User-web dist exceeds its directory-depth limit');
    directoryCount += 1;
    if (directoryCount > maxPublicArtifactDirectories) throw new Error('User-web dist exceeds its directory-count limit');
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const metadata = lstatSync(absolute);
      if (metadata.isSymbolicLink()) throw new Error(`Symlinks are not allowed in user-web dist: ${absolute}`);
      if (metadata.isDirectory()) {
        visit(absolute, depth + 1);
      } else if (metadata.isFile()) {
        if (files.length >= maxPublicArtifactFiles) throw new Error('User-web dist exceeds its file-count limit');
        const relative = path.relative(distRoot, absolute).split(path.sep).join('/');
        if (!relative || relative.startsWith('/') || relative.split('/').includes('..') || /[\r\n\0]/u.test(relative)) {
          throw new Error(`Unsafe dist path: ${JSON.stringify(relative)}`);
        }
        let descriptor;
        let contents;
        try {
          descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
          const opened = fstatSync(descriptor);
          if (!opened.isFile() || !Number.isSafeInteger(opened.size) || opened.size < 0 || opened.size > maxPublicArtifactFileBytes) {
            throw new Error(`User-web dist file exceeds its evidence size limit: ${absolute}`);
          }
          if (!Number.isSafeInteger(totalBytes + opened.size) || totalBytes + opened.size > maxPublicArtifactTotalBytes) {
            throw new Error('User-web dist exceeds its aggregate evidence size limit');
          }
          contents = Buffer.allocUnsafe(opened.size);
          let offset = 0;
          while (offset < opened.size) {
            const count = readSync(descriptor, contents, offset, opened.size - offset, null);
            if (count === 0) throw new Error(`User-web dist changed while reading: ${absolute}`);
            offset += count;
          }
          const extra = Buffer.allocUnsafe(1);
          if (readSync(descriptor, extra, 0, 1, null) !== 0) throw new Error(`User-web dist changed while reading: ${absolute}`);
          const current = lstatSync(absolute);
          if (!opened.isFile() || current.isSymbolicLink() || current.dev !== opened.dev || current.ino !== opened.ino || realpathSync(absolute) !== absolute || contents.length !== opened.size) {
            throw new Error(`User-web dist changed while reading: ${absolute}`);
          }
        } finally {
          if (descriptor !== undefined) closeSync(descriptor);
        }
        totalBytes += contents.length;
        files.push({ absolute, path: relative, size: contents.length, contents });
      } else {
        throw new Error(`Only regular files are allowed in user-web dist: ${absolute}`);
      }
    }
  };
  visit(distRoot, 0);
  return files.sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)));
}

export function scanPublicArtifact(files) {
  for (const file of files) {
    if (unsafePathPatterns.some((pattern) => pattern.test(file.path))) {
      throw new Error(`Unsafe public artifact path: ${file.path}`);
    }
    const text = file.contents.toString('utf8');
    const decodedScriptText = decodeStaticScriptEscapesForScan(text);
    let decodedJsonText;
    let candidate;
    try {
      candidate = JSON.parse(text);
    } catch {
      // Non-JSON web assets still receive the raw-text scan below.
    }
    if (candidate !== undefined) {
      try {
        assertUniqueJsonMembers(text);
      } catch (error) {
        if (error instanceof Error && error.message === 'Duplicate JSON member') {
          throw new Error(`Duplicate JSON members are not allowed in public artifact: ${file.path}`);
        }
        throw new Error(`JSON artifact could not be inspected unambiguously: ${file.path}`);
      }
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
      decodedJsonText = JSON.stringify(candidate);
    }
    for (const pattern of unsafeContentPatterns) {
      if (pattern.test(text) || pattern.test(decodedScriptText) || (decodedJsonText !== undefined && pattern.test(decodedJsonText))) {
        throw new Error(`Potential sensitive or host-specific material in ${file.path}`);
      }
    }
  }
}

export function createUserWebDistManifest({
  dist = path.join(repoRoot, 'apps/web-user/dist'),
  output,
  staging,
  expectedSourceSha,
  provenance,
} = {}) {
  const distAbsolute = path.resolve(dist);
  const stagingAbsolute = staging ? path.resolve(staging) : undefined;
  const outputAbsolute = path.resolve(output ?? (stagingAbsolute
    ? path.join(stagingAbsolute, 'user-web-dist-manifest.json')
    : path.join(repoRoot, 'apps/web-user/user-web-dist-manifest.json')));
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
  if (!provenance) assertTrackedWorktreeMatchesHead();

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
      npm: currentNpmVersion(),
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
  const verifiedEntries = collectFiles(distAbsolute).map((file) => ({
    path: file.path,
    size: file.size,
    sha256: sha256(file.contents),
  }));
  if (canonicalJson(verifiedEntries) !== canonicalJson(fileEntries)) {
    throw new Error('User-web dist changed while package evidence was generated');
  }
  if (stagingAbsolute) {
    if (existsSync(stagingAbsolute)) throw new Error('Package evidence staging path must not already exist');
    if (outputAbsolute !== path.join(stagingAbsolute, 'user-web-dist-manifest.json')) {
      throw new Error('Staged manifest output must be the canonical staging manifest path');
    }
    const stagedDist = path.join(stagingAbsolute, 'dist');
    mkdirSync(stagedDist, { recursive: true, mode: 0o755 });
    for (const file of files) {
      const target = path.join(stagedDist, ...file.path.split('/'));
      assertInside(stagedDist, target, 'Staged file');
      mkdirSync(path.dirname(target), { recursive: true, mode: 0o755 });
      writeFileSync(target, file.contents, { flag: 'wx', mode: 0o444 });
    }
    writeFileSync(outputAbsolute, canonicalJson(manifest), { flag: 'wx', mode: 0o444 });
    const stagedEntries = collectFiles(stagedDist).map((file) => ({
      path: file.path,
      size: file.size,
      sha256: sha256(file.contents),
    }));
    if (canonicalJson(stagedEntries) !== canonicalJson(fileEntries)) {
      throw new Error('Staged package evidence differs from scanned user-web dist');
    }
  } else {
    mkdirSync(path.dirname(outputAbsolute), { recursive: true });
    writeFileSync(outputAbsolute, canonicalJson(manifest), { flag: 'w', mode: 0o644 });
  }
  return manifest;
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!value || !['--dist', '--output', '--staging', '--expected-source-sha'].includes(key)) {
      throw new Error('Usage: user-web-dist-manifest.mjs [--dist PATH] [--output PATH] [--staging PATH] [--expected-source-sha SHA]');
    }
    if (key === '--dist') options.dist = value;
    if (key === '--output') options.output = value;
    if (key === '--staging') options.staging = value;
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
