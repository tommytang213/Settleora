// Synthetic Mach-O layout; DWARF graph/UUID checks are independently mocked.
export function dsymFixture({ wide = true, little = true } = {}) {
  const bytes = Buffer.alloc(528);
  const w = (value, at) => little ? bytes.writeUInt32LE(value, at) : bytes.writeUInt32BE(value, at);
  const q = (value, at) => little ? bytes.writeBigUInt64LE(BigInt(value), at) : bytes.writeBigUInt64BE(BigInt(value), at);
  const header = wide ? 32 : 28, base = wide ? 72 : 56, section = wide ? 80 : 68;
  w(wide ? 0xfeedfacf : 0xfeedface, 0); w(wide ? 0x100000c : 12, 4); w(0, 8); w(10, 12);
  w(3, 16); w(24 + base + section + 24, 20);
  w(0x1b, header); w(24, header + 4); bytes.fill(1, header + 8, header + 24);
  const segment = header + 24;
  w(wide ? 0x19 : 1, segment); w(base + section, segment + 4);
  bytes.write('__DWARF', segment + 8);
  (wide ? q : w)(512, segment + (wide ? 40 : 32));
  (wide ? q : w)(16, segment + (wide ? 48 : 36));
  w(1, segment + (wide ? 64 : 48));
  const at = segment + base;
  bytes.write('__debug_info', at); bytes.write('__DWARF', at + 16);
  (wide ? q : w)(16, at + (wide ? 40 : 36)); w(512, at + (wide ? 48 : 40));
  const symtab = at + section;
  w(2, symtab); w(24, symtab + 4); w(256, symtab + 8); w(1, symtab + 12);
  w(272, symtab + 16); w(8, symtab + 20);
  bytes.write('\0_sym\0\0\0', 272); bytes.fill(0x41, 512);
  return { bytes, header, segment, section: at, symtab, w, q };
}
export function fatFixture({ wide = false, little = false } = {}) {
  const slice = dsymFixture().bytes;
  const bytes = Buffer.alloc(4096 + slice.length);
  const w = (value, at) => little ? bytes.writeUInt32LE(value, at) : bytes.writeUInt32BE(value, at);
  const q = (value, at) => little ? bytes.writeBigUInt64LE(BigInt(value), at) : bytes.writeBigUInt64BE(BigInt(value), at);
  w(wide ? 0xcafebabf : 0xcafebabe, 0); w(1, 4); w(0x100000c, 8);
  (wide ? q : w)(4096, 16); (wide ? q : w)(slice.length, wide ? 24 : 20); w(12, wide ? 32 : 24);
  slice.copy(bytes, 4096);
  return bytes;
}

// Minimal valid DWARF v4 compile unit: DW_AT_name references fixture.c at
// string offset zero. Extra strings have no references. The Linux evidence
// harness verifies both payload variants using the installed LLVM dwarfdump;
// this fixture alone does not claim Apple signature or Xcode compatibility.
export function structuredDsymFixture({ payload = '', symbolTable = false } = {}) {
  const abbrev = Buffer.from([1, 0x11, 0, 3, 0x0e, 0, 0, 0]);
  const info = Buffer.alloc(16);
  info.writeUInt32LE(12); info.writeUInt16LE(4, 4); info[10] = 8; info[11] = 1;
  const strings = Buffer.from(`fixture.c\0${symbolTable ? '' : `${payload}\0`}`);
  const sections = [['__debug_abbrev', abbrev], ['__debug_info', info], ['__debug_str', strings]];
  const dataEnd = 512 + sections.reduce((size, entry) => size + entry[1].length, 0);
  const symbols = Buffer.from(`\0_symbol\0${symbolTable ? `${payload}\0` : ''}`);
  const symoff = Math.ceil(dataEnd / 8) * 8;
  const bytes = Buffer.alloc(symbolTable ? symoff + 16 + symbols.length : dataEnd);
  bytes.writeUInt32LE(0xfeedfacf, 0); bytes.writeUInt32LE(0x100000c, 4); bytes.writeUInt32LE(10, 12);
  bytes.writeUInt32LE(symbolTable ? 3 : 2, 16);
  bytes.writeUInt32LE(24 + 72 + 80 * 3 + (symbolTable ? 24 : 0), 20);
  bytes.writeUInt32LE(0x1b, 32); bytes.writeUInt32LE(24, 36); bytes.fill(1, 40, 56);
  const segment = 56;
  bytes.writeUInt32LE(0x19, segment); bytes.writeUInt32LE(72 + 240, segment + 4);
  bytes.write('__DWARF', segment + 8);
  bytes.writeBigUInt64LE(512n, segment + 40);
  bytes.writeBigUInt64LE(BigInt(dataEnd - 512), segment + 48);
  bytes.writeUInt32LE(3, segment + 64);
  let offset = 512;
  sections.forEach(([name, data], index) => {
    const at = segment + 72 + index * 80;
    bytes.write(name, at); bytes.write('__DWARF', at + 16);
    bytes.writeBigUInt64LE(BigInt(data.length), at + 40);
    bytes.writeUInt32LE(offset, at + 48);
    data.copy(bytes, offset); offset += data.length;
  });
  if (symbolTable) {
    const at = segment + 72 + 240;
    bytes.writeUInt32LE(2, at); bytes.writeUInt32LE(24, at + 4);
    bytes.writeUInt32LE(symoff, at + 8); bytes.writeUInt32LE(1, at + 12);
    bytes.writeUInt32LE(symoff + 16, at + 16); bytes.writeUInt32LE(symbols.length, at + 20);
    bytes.writeUInt32LE(1, symoff); bytes[symoff + 4] = 0x0e; bytes[symoff + 5] = 1;
    symbols.copy(bytes, symoff + 16);
  }
  return bytes;
}
