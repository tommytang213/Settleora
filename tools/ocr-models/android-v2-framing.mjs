// Validate only the outer v2 signers envelope. Signer payloads remain opaque;
// genuine cryptographic verification still belongs to the pinned apksigner.
export function validateAndroidV2SignersEnvelope(value) {
  if (!Buffer.isBuffer(value) || value.length < 4) {
    throw new Error("Production APK v2 signers envelope is truncated");
  }
  const envelopeLength = value.readUInt32LE(0);
  if (envelopeLength !== value.length - 4) {
    throw new Error("Production APK v2 signers envelope has unaccounted bytes");
  }

  let cursor = 4;
  let signerCount = 0;
  while (cursor < value.length) {
    if (value.length - cursor < 4) {
      throw new Error("Production APK v2 signer length is truncated");
    }
    const signerLength = value.readUInt32LE(cursor);
    cursor += 4;
    if (signerLength === 0 || signerLength > value.length - cursor) {
      throw new Error("Production APK v2 signer is empty or truncated");
    }
    cursor += signerLength;
    signerCount += 1;
    if (signerCount > 1) {
      throw new Error("Production APK v2 envelope must contain exactly one signer");
    }
  }
  if (signerCount !== 1) {
    throw new Error("Production APK v2 envelope must contain exactly one signer");
  }
}

// Complete structural consumption only: cryptography, supported algorithms,
// certificate trust and primitive X.509 semantics remain pinned apksigner's job.
function framingError(message) {
  throw new Error(`Production APK v2 structure: ${message}`);
}

function lpReader(bytes) {
  let position = 0;
  return {
    remaining: () => bytes.length - position,
    take() {
      if (bytes.length - position < 4) framingError("truncated length prefix");
      const size = bytes.readUInt32LE(position);
      position += 4;
      if (size > bytes.length - position) framingError("record exceeds its container");
      const result = bytes.subarray(position, position + size);
      position += size;
      return result;
    },
    end() {
      if (position !== bytes.length) framingError("unconsumed record bytes");
    },
  };
}

function derReader(bytes) {
  let position = 0;
  return {
    remaining: () => bytes.length - position,
    take(expectedTag) {
      const start = position;
      if (bytes.length - position < 2) framingError("truncated DER value");
      const tag = bytes[position++];
      if ((tag & 0xdf) === 0) framingError("DER end-of-contents is not a value");
      if ((tag & 31) === 31) {
        const tagStart = position;
        let octet;
        do {
          if (position >= bytes.length) framingError("truncated DER tag");
          octet = bytes[position++];
          if (position === tagStart + 1 && (octet & 127) === 0) framingError("nonminimal DER tag");
        } while (octet & 128);
        if (position === tagStart + 1 && octet < 31) framingError("nonminimal DER tag");
      }
      const tagSize = position - start;
      if (position >= bytes.length) framingError("missing DER length");
      let size = bytes[position++];
      if (size & 128) {
        const count = size & 127;
        if (count === 0 || count > 4 || count > bytes.length - position) {
          framingError("invalid DER length");
        }
        if (bytes[position] === 0) framingError("nonminimal DER length");
        size = 0;
        for (let index = 0; index < count; index += 1) size = size * 256 + bytes[position++];
        if (size < 128) framingError("nonminimal DER length");
      }
      if (size > bytes.length - position) framingError("DER value exceeds its container");
      if (expectedTag !== undefined && (tagSize !== 1 || tag !== expectedTag)) {
        framingError("unexpected certificate field tag");
      }
      const value = bytes.subarray(position, position + size);
      position += size;
      return { tag, tagSize, value };
    },
    peek: () => bytes[position],
    end() {
      if (position !== bytes.length) framingError("unconsumed certificate fields");
    },
  };
}

function validateDerTree(bytes) {
  // Iterative traversal bounds work by input length without a recursion limit.
  const root = derReader(bytes);
  const node = root.take(0x30);
  root.end();
  const stack = [derReader(node.value)];
  while (stack.length) {
    const reader = stack[stack.length - 1];
    if (!reader.remaining()) { stack.pop(); continue; }
    const child = reader.take();
    if (child.tag & 0x20) stack.push(derReader(child.value));
  }
  return node.value;
}

function algorithm(reader) {
  const fields = derReader(reader.take(0x30).value);
  fields.take(0x06);
  if (fields.remaining()) fields.take(); // At most one fully framed ANY parameter.
  fields.end();
}

function name(reader) {
  const rdns = derReader(reader.take(0x30).value);
  while (rdns.remaining()) {
    const attributes = derReader(rdns.take(0x31).value);
    if (!attributes.remaining()) framingError("empty relative distinguished name");
    while (attributes.remaining()) {
      const pair = derReader(attributes.take(0x30).value);
      pair.take(0x06);
      pair.take();
      pair.end();
    }
  }
}

function certificate(bytes) {
  const fields = derReader(validateDerTree(bytes));
  const tbs = derReader(fields.take(0x30).value);
  algorithm(fields);
  fields.take(0x03);
  fields.end();
  if (tbs.peek() === 0xa0) {
    const version = derReader(tbs.take(0xa0).value);
    version.take(0x02);
    version.end();
  }
  tbs.take(0x02);
  algorithm(tbs);
  name(tbs);
  const validity = derReader(tbs.take(0x30).value);
  for (let index = 0; index < 2; index += 1) {
    const time = validity.take();
    if (time.tagSize !== 1 || ![0x17, 0x18].includes(time.tag)) framingError("invalid certificate time tag");
  }
  validity.end();
  name(tbs);
  const key = derReader(tbs.take(0x30).value);
  algorithm(key);
  key.take(0x03);
  key.end();
  // These are IMPLICIT BIT STRINGs, not nested DER containers.
  if (tbs.peek() === 0x81) tbs.take(0x81);
  if (tbs.peek() === 0x82) tbs.take(0x82);
  if (tbs.peek() === 0xa3) {
    const wrapper = derReader(tbs.take(0xa3).value);
    const extensions = derReader(wrapper.take(0x30).value);
    wrapper.end();
    while (extensions.remaining()) {
      const extension = derReader(extensions.take(0x30).value);
      extension.take(0x06);
      if (extension.peek() === 0x01) extension.take(0x01);
      extension.take(0x04); // Signed opaque extension value, not nested DER.
      extension.end();
    }
  }
  tbs.end();
}

function algorithmRecords(bytes) {
  const sequence = lpReader(bytes);
  while (sequence.remaining()) {
    const record = sequence.take();
    if (record.length < 4) framingError("truncated algorithm identifier");
    const payload = lpReader(record.subarray(4));
    payload.take();
    payload.end();
    // Unknown algorithm IDs/values remain compatible with the pinned verifier.
  }
}

export function validateAndroidV2SignerRecords(value) {
  validateAndroidV2SignersEnvelope(value);
  const envelope = lpReader(value);
  const signers = lpReader(envelope.take());
  envelope.end();
  const signer = lpReader(signers.take());
  signers.end();
  const signedData = lpReader(signer.take());
  algorithmRecords(signer.take());
  signer.take(); // Pinned apksigner checks exact equality with certificate SPKI.
  signer.end();
  algorithmRecords(signedData.take());
  const certificates = lpReader(signedData.take());
  while (certificates.remaining()) certificate(certificates.take());
  const attributes = lpReader(signedData.take());
  // Pinned apksig's V2SchemeSigner encodes one final empty LP element.
  // Accept that exact representation or the standard three-field form only.
  if (signedData.remaining() && signedData.take().length !== 0) {
    framingError("nonempty signed-data compatibility field");
  }
  signedData.end();
  while (attributes.remaining()) {
    const attribute = attributes.take();
    if (attribute.length < 4) framingError("truncated attribute identifier");
    // Unknown values occupy the entire remainder and are signed opaque metadata.
    if (attribute.readUInt32LE(0) === 0xbeeff00d && attribute.length !== 8) {
      framingError("stripping-protection attribute must contain one uint32");
    }
  }
}
