import { constants, openSync, closeSync, fstatSync, lstatSync, readSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReleaseState, inspectReleaseState } from './day1-release-state.mjs';

import { assertUniqueJsonMembers } from '../ci/user-web-dist-manifest.mjs';

const MAX_BYTES = 65536;
const reject = () => { throw new Error('invalid_fixture_input'); };

export function readFixtureState(root, filename) {
  const rootPath = path.resolve(root), filePath = path.resolve(rootPath, filename);
  const rootStat = lstatSync(rootPath);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || rootStat.uid !== process.getuid()
    || (rootStat.mode & 0o077) !== 0 || realpathSync(rootPath) !== rootPath
    || filePath === rootPath || !filePath.startsWith(`${rootPath}${path.sep}`)) reject();
  const ancestors = [[rootPath, rootStat]];
  let current = rootPath;
  for (const part of path.relative(rootPath, filePath).split(path.sep)) {
    current = path.join(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || stat.uid !== process.getuid()
      || (current === filePath ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory() || (stat.mode & 0o077) !== 0)) reject();
    if (current !== filePath) ancestors.push([current, stat]);
  }
  const descriptor = openSync(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.nlink !== 1 || before.uid !== process.getuid() || (before.mode & 0o077) !== 0 || before.size > MAX_BYTES) reject();
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let length = 0, count;
    do { count = readSync(descriptor, buffer, length, buffer.length - length, null); length += count; } while (count && length < buffer.length);
    const after = fstatSync(descriptor), entry = lstatSync(filePath);
    if (length > MAX_BYTES || after.size !== before.size || after.mtimeMs !== before.mtimeMs
      || after.ctimeMs !== before.ctimeMs || after.dev !== entry.dev || after.ino !== entry.ino) reject();
    for (const [directory, original] of ancestors) {
      const now = lstatSync(directory);
      if (!now.isDirectory() || now.isSymbolicLink() || now.dev !== original.dev || now.ino !== original.ino
        || now.uid !== original.uid || now.mode !== original.mode || realpathSync(directory) !== directory) reject();
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
    assertUniqueJsonMembers(text);
    return JSON.parse(text);
  } finally { closeSync(descriptor); }
}

export function main(argv = process.argv.slice(2)) {
  const [command, rootFlag, root, stateFlag, filename, ...extra] = argv;
  if (!['validate', 'inspect'].includes(command) || rootFlag !== '--fixture-root' || !root
    || stateFlag !== '--state' || !filename || extra.length) reject();
  const input = readFixtureState(root, filename);
  return command === 'validate'
    ? { mode: 'offline-fixture', structurallyValid: Boolean(validateReleaseState(input)), operationAuthorized: false, stateWritten: false }
    : inspectReleaseState(input);
}

const invokedAsEntryPoint = () => {
  try { return Boolean(process.argv[1]) && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; } // Imported modules need not have an existing argv entry.
};

if (invokedAsEntryPoint()) {
  try { process.stdout.write(`${JSON.stringify(main())}\n`); }
  catch (error) {
    process.stderr.write(`${JSON.stringify({ error: 'release_state_input_rejected', reason: error?.code && /^[a-z_]+$/u.test(error.code) ? error.code : 'invalid_fixture_input' })}\n`);
    process.exitCode = 1;
  }
}
