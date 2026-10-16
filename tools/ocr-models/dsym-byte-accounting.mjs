// Account for Mach-O dSYM payloads and zero alignment gaps, independently of
// dwarfdump (which need not consume trailing bytes). Format definitions:
// https://github.com/llvm/llvm-project/blob/main/llvm/include/llvm/BinaryFormat/MachO.h
// This is structural accounting, not authentication of arbitrary DWARF strings.
function invalid() { throw new Error("Unaccounted dSYM bytes"); }
function readers(bytes, little) {
  return {
    u32: (at) => little ? bytes.readUInt32LE(at) : bytes.readUInt32BE(at),
    u64: (at) => {
      const n = little ? bytes.readBigUInt64LE(at) : bytes.readBigUInt64BE(at);
      if (n > BigInt(Number.MAX_SAFE_INTEGER)) invalid();
      return Number(n);
    },
  };
}
function range(bytes, offset, size) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) ||
      offset < 0 || size < 0 || offset > bytes.length - size) invalid();
  return [offset, offset + size];
}
function covered(bytes, ranges) {
  let end = 0;
  for (const [left, right] of ranges.sort((a, b) => a[0] - b[0])) {
    if (left < end || bytes.subarray(end, left).some((v) => v !== 0)) invalid();
    end = right;
  }
  // No payload, including an all-zero appended tail, follows the last extent.
  if (end !== bytes.length) invalid();
}
function name(bytes, at) {
  const field = bytes.subarray(at, at + 16);
  const zero = field.indexOf(0);
  const length = zero < 0 ? 16 : zero;
  if (field.subarray(length).some((v) => v !== 0) ||
      !/^[A-Za-z0-9_.$]+$/.test(field.subarray(0, length).toString("ascii")) ||
      field.some((v) => v > 127)) invalid();
  return field.subarray(0, length).toString("ascii");
}
function thin(bytes) {
  if (bytes.length < 28) invalid();
  const magic = bytes.readUInt32BE(0);
  if (![0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe].includes(magic)) invalid();
  const wide = magic === 0xfeedfacf || magic === 0xcffaedfe;
  const { u32, u64 } = readers(bytes, magic === 0xcefaedfe || magic === 0xcffaedfe);
  const header = wide ? 32 : 28;
  if (bytes.length < header || u32(12) !== 10 || (wide && u32(28) !== 0)) invalid();
  const count = u32(16), commandEnd = header + u32(20);
  range(bytes, header, u32(20));
  if (!count || count > 4096) invalid();
  const ranges = [[0, commandEnd]];
  let cursor = header, uuids = 0, symtabs = 0, debugSections = 0;
  const add = (offset, size) => { if (size) ranges.push(range(bytes, offset, size)); };
  for (let i = 0; i < count; i++) {
    if (cursor + 8 > commandEnd) invalid();
    const command = u32(cursor), size = u32(cursor + 4);
    if (size < 8 || size % (wide ? 8 : 4) || cursor + size > commandEnd) invalid();
    if (command === 0x1b) { // LC_UUID
      if (size !== 24 || ++uuids !== 1) invalid();
    } else if (command === 0x2) { // LC_SYMTAB
      if (size !== 24 || ++symtabs !== 1) invalid();
      add(u32(cursor + 8), u32(cursor + 12) * (wide ? 16 : 12));
      add(u32(cursor + 16), u32(cursor + 20));
    } else if (command === (wide ? 0x19 : 0x1)) {
      const base = wide ? 72 : 56, step = wide ? 80 : 68;
      if (size < base) invalid();
      const segment = name(bytes, cursor + 8);
      const fileoff = wide ? u64(cursor + 40) : u32(cursor + 32);
      const filesize = wide ? u64(cursor + 48) : u32(cursor + 36);
      range(bytes, fileoff, filesize);
      const sections = u32(cursor + (wide ? 64 : 48));
      if (size !== base + sections * step) invalid();
      for (let j = 0; j < sections; j++) {
        const at = cursor + base + j * step;
        const section = name(bytes, at);
        if (name(bytes, at + 16) !== segment) invalid();
        const length = wide ? u64(at + 40) : u32(at + 36);
        const offset = u32(at + (wide ? 48 : 40));
        const relocations = u32(at + (wide ? 60 : 52));
        if (relocations || u32(at + (wide ? 56 : 48))) invalid();
        // dsymutil retains original executable section addresses/sizes but
        // clears their offsets; only debug data and eh_frame have file bytes.
        if (!offset) {
          if (segment === "__DWARF" && length) invalid();
          continue;
        }
        if (segment !== "__DWARF" && !(segment === "__TEXT" && section === "__eh_frame")) invalid();
        if (offset < fileoff || length > fileoff + filesize - offset) invalid();
        if (segment === "__DWARF") debugSections++;
        add(offset, length);
      }
      // Segment extents do not own arbitrary bytes between their sections.
    } else if (command === 0x32) { // LC_BUILD_VERSION
      if (size < 24 || size !== 24 + u32(cursor + 20) * 8) invalid();
    } else if ([0x24, 0x25, 0x2f, 0x30].includes(command)) {
      if (size !== 16) invalid(); // LC_VERSION_MIN_*
    } else {
      invalid(); // New layouts require explicit accounting before acceptance.
    }
    cursor += size;
  }
  if (cursor !== commandEnd || uuids !== 1 || !debugSections) invalid();
  covered(bytes, ranges);
  return [u32(4), u32(8)];
}
export function verifyDsymByteAccounting(bytes) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length < 4) invalid();
    const magic = bytes.readUInt32BE(0);
    if (![0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca].includes(magic)) {
      thin(bytes);
      return;
    }
    const wide = magic === 0xcafebabf || magic === 0xbfbafeca;
    const { u32, u64 } = readers(bytes, magic === 0xbebafeca || magic === 0xbfbafeca);
    const count = u32(4), step = wide ? 32 : 20;
    if (!count || count > 32) invalid();
    const ranges = [range(bytes, 0, 8 + count * step)], identities = new Set();
    for (let i = 0; i < count; i++) {
      const at = 8 + i * step;
      const offset = wide ? u64(at + 8) : u32(at + 8);
      const size = wide ? u64(at + 16) : u32(at + 12);
      const align = u32(at + (wide ? 24 : 16));
      if (align > 30 || offset % (2 ** align) || (wide && u32(at + 28))) invalid();
      ranges.push(range(bytes, offset, size));
      const identity = thin(bytes.subarray(offset, offset + size));
      if (identity[0] !== u32(at) || identity[1] !== u32(at + 4) || identities.has(identity.join(':'))) invalid();
      identities.add(identity.join(':'));
    }
    covered(bytes, ranges);
  } catch { invalid(); }
}
