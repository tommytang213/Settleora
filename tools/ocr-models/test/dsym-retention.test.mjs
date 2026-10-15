import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { hashDirectory } from '../hash-directory.mjs';
import { inspectXcarchive, inspectXcarchiveStructure } from '../verify-ios-xcarchive.mjs';
import { prepareRetainedXcarchive } from '../prepare-retained-xcarchive.mjs';
import { verifyDsymByteAccounting } from '../dsym-byte-accounting.mjs';
import { structuredDsymFixture } from './dsym-fixture.mjs';

const inspectPlist = file => readFileSync(file, 'utf8');
const toolOptions = {
  verifySignature() {}, // Synthetic Linux tests; real Apple controls stay separate.
  dwarfTool([command, file]) {
    if (command === '--verify') return '';
    if (command === '--uuid') return `UUID: 01010101-0101-0101-0101-010101010101 (arm64) ${file}\n`;
    throw new Error('Unexpected DWARF command');
  },
};
function fixture({ payload = '', symbolTable = false, includeSymbols = true } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'settleora-dsym-retention-'));
  const source = path.join(root, 'Runner.xcarchive'), app = path.join(root, 'ipa-app');
  const archivedApp = path.join(source, 'Products/Applications/Runner.app');
  const plist = '<plist><dict><key>CFBundleIdentifier</key><string>com.tommytang213.settleora</string></dict></plist>';
  for (const p of [app, archivedApp]) {
    mkdirSync(p, { recursive: true });
    writeFileSync(path.join(p, 'Info.plist'), plist);
    writeFileSync(path.join(p, 'Runner'), Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0, 0, 0, 0]));
  }
  writeFileSync(path.join(source, 'Info.plist'), '<plist><dict/></plist>');
  if (includeSymbols) {
    const symbols = path.join(source, 'dSYMs/Runner.app.dSYM/Contents');
    mkdirSync(path.join(symbols, 'Resources/DWARF'), { recursive: true });
    writeFileSync(path.join(symbols, 'Info.plist'), '<plist><dict><key>CFBundleIdentifier</key><string>com.apple.xcode.dsym.Runner</string><key>CFBundlePackageType</key><string>dSYM</string></dict></plist>');
    const bytes = structuredDsymFixture({ payload, symbolTable });
    verifyDsymByteAccounting(bytes);
    writeFileSync(path.join(symbols, 'Resources/DWARF/Runner'), bytes);
  }
  return { root, source, app, output: path.join(root, 'retained-archive') };
}

for (const [name, payload, symbolTable] of [
  ['valid debug control', '', false],
  ['unreferenced debug string', 'PRIVATE_RECEIPT_TEXT_123', false],
  ['unreferenced symbol string', 'PRIVATE_RECEIPT_TEXT_123', true],
]) test(`retention rejects unsigned ${name} and preserves the original archive`, () => {
  const f = fixture({ payload, symbolTable });
  try {
    const original = hashDirectory(f.source);
    const structural = inspectXcarchiveStructure(f.source, f.app, inspectPlist, toolOptions);
    assert.equal(structural.symbolFileCount, 1);
    assert.equal(structural.unsignedSymbolsAuthenticated, false);
    assert.throws(() => inspectXcarchive(f.source, f.app, inspectPlist, toolOptions), /unreviewed/);
    const retained = prepareRetainedXcarchive(f.source, f.app, f.output, inspectPlist, toolOptions);
    assert.equal(retained.symbolFileCount, 0);
    assert.equal(retained.retentionPolicy, 'signed-app-and-constrained-metadata-only-v1');
    assert.equal(hashDirectory(f.source), original);
    assert.deepEqual(readdirSync(f.output), ['Runner.xcarchive']);
    const destination = path.join(f.output, 'Runner.xcarchive');
    assert.deepEqual(readdirSync(destination).sort(), ['Info.plist', 'Products']);
    assert.equal(hashDirectory(path.join(destination, 'Products/Applications/Runner.app')), hashDirectory(f.app));
    assert.equal(hashDirectory(destination), retained.archiveSha256);
    assert.throws(() => prepareRetainedXcarchive(f.source, f.app, f.output, inspectPlist, toolOptions));
    assert.equal(hashDirectory(destination), retained.archiveSha256);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('a valid archive without symbols retains its exact bytes', () => {
  const f = fixture({ includeSymbols: false });
  try {
    const original = hashDirectory(f.source);
    const result = prepareRetainedXcarchive(f.source, f.app, f.output, inspectPlist, toolOptions);
    assert.equal(result.archiveSha256, original);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('failed copy inspection cannot enter the retained artifact glob', () => {
  const f = fixture();
  try {
    const original = hashDirectory(f.source);
    const options = { ...toolOptions, verifySignature(app) {
      if (app.includes('Runner.pending')) writeFileSync(path.join(app, 'extra.dat'), 'unreviewed');
    } };
    assert.throws(() => prepareRetainedXcarchive(f.source, f.app, f.output, inspectPlist, options));
    assert.equal(hashDirectory(f.source), original);
    assert.equal(existsSync(path.join(f.output, 'Runner.xcarchive')), false);
    assert.deepEqual(readdirSync(f.output), ['Runner.pending']);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('raw archive symlinks fail before any retained artifact is created', () => {
  const f = fixture();
  try {
    symlinkSync('Info.plist', path.join(f.source, 'linked.plist'));
    assert.throws(() => prepareRetainedXcarchive(f.source, f.app, f.output, inspectPlist, toolOptions));
    assert.equal(existsSync(f.output), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('retention preparation CLI rejects caller-supplied paths', () => {
  const result = spawnSync(process.execPath, [path.resolve(import.meta.dirname, '../prepare-retained-xcarchive.mjs'), '/tmp/other.xcarchive'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'xcarchive_retention_preparation_failed\n');
});

test('signed workflow retains only the prepared archive and preserves the Xcode input', () => {
  const repo = path.resolve(import.meta.dirname, '../../..');
  const wrapper = readFileSync(path.join(repo, 'apps/mobile/tool/build-production-ios.sh'), 'utf8');
  const workflow = readFileSync(path.join(repo, 'codemagic.yaml'), 'utf8');
  assert.match(workflow, /- \$CM_BUILD_DIR\/apps\/mobile\/build\/ios\/retained-archive\/\*\.xcarchive/);
  assert.doesNotMatch(workflow, /- \$CM_BUILD_DIR\/apps\/mobile\/build\/ios\/archive\/\*\.xcarchive/);
  assert(wrapper.indexOf('prepare-retained-xcarchive.mjs') < wrapper.indexOf('archive_review=$(node'));
  assert.match(wrapper, /archive_path=\$PWD\/build\/ios\/retained-archive\/Runner\.xcarchive/);
  assert.match(wrapper, /hash-directory\.mjs" retained-archive/);
});
