import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyDsymByteAccounting } from '../dsym-byte-accounting.mjs';
import { dsymFixture, fatFixture } from './dsym-fixture.mjs';

for (const wide of [false, true]) for (const little of [false, true]) {
  test(`dSYM accounts thin ${wide ? 64 : 32}-bit ${little ? 'little' : 'big'} endian payloads`, () => {
    const { bytes } = dsymFixture({ wide, little });
    assert.doesNotThrow(() => verifyDsymByteAccounting(bytes));
    for (const tail of [Buffer.from('Alex Smith, apples 2.99'), Buffer.alloc(8)]) {
      assert.throws(() => verifyDsymByteAccounting(Buffer.concat([bytes, tail])), /Unaccounted/);
    }
    const gap = Buffer.from(bytes); gap.write('apples 2.99', 400);
    assert.throws(() => verifyDsymByteAccounting(gap), /Unaccounted/);
  });
  test(`dSYM accounts fat ${wide ? 64 : 32}-bit ${little ? 'little' : 'big'} endian slices`, () => {
    const bytes = fatFixture({ wide, little });
    assert.doesNotThrow(() => verifyDsymByteAccounting(bytes));
    assert.throws(() => verifyDsymByteAccounting(Buffer.concat([bytes, Buffer.from('apples 2.99')])), /Unaccounted/);
    bytes.write('Alex Smith', 1000);
    assert.throws(() => verifyDsymByteAccounting(bytes), /Unaccounted/);
  });
}
for (const [label, mutate] of [
  ['section overlap with commands', ({ w, section }) => w(32, section + 48)],
  ['section outside file', ({ w, section }) => w(520, section + 48)],
  ['section outside segment', ({ q, segment }) => q(8, segment + 48)],
  ['oversized uint64', ({ bytes, section }) => bytes.writeBigUInt64LE(2n ** 63n, section + 40)],
  ['symbol overlap', ({ w, symtab }) => w(512, symtab + 8)],
  ['hidden section-name suffix', ({ bytes, section }) => bytes.write('hi', section + 13)],
  ['extended command payload', ({ w, header }) => w(32, header + 4)],
  ['unknown command', ({ w, header }) => w(0x777, header)],
  ['unconsumed command bytes', ({ w }) => w(208, 20)],
  ['wrong file type', ({ w }) => w(2, 12)],
  ['relocation payload', ({ w, section }) => w(1, section + 60)],
]) test(`dSYM rejects ${label}`, () => {
  const f = dsymFixture(); mutate(f);
  assert.throws(() => verifyDsymByteAccounting(f.bytes), /Unaccounted/);
});
test('declared segment extent cannot hide appended content outside a section', () => {
  const f = dsymFixture(); f.q(40, f.segment + 48);
  assert.throws(() => verifyDsymByteAccounting(Buffer.concat([f.bytes, Buffer.alloc(24, 65)])), /Unaccounted/);
});
