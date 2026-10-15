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
