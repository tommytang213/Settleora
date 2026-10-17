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
