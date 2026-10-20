import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateAndroidV2SignerRecords } from "../android-v2-framing.mjs";

const { cases } = JSON.parse(readFileSync(
  new URL("./fixtures/v2-structure.json", import.meta.url), "utf8",
));
// Pure grammar controls only; none of these bytes assert cryptographic validity.
for (const fixture of cases) {
  test(`v2 structure: ${fixture.name}`, () => {
    const value = Buffer.from(fixture.hex, "hex");
    const before = Buffer.from(value);
    if (fixture.valid) {
      assert.doesNotThrow(() => validateAndroidV2SignerRecords(value));
      const surrounded = Buffer.concat([Buffer.from([1]), value, Buffer.from([2])]);
      assert.doesNotThrow(() => validateAndroidV2SignerRecords(surrounded.subarray(1, -1)));
    } else {
      assert.throws(() => validateAndroidV2SignerRecords(value), /Production APK v2/);
    }
    assert.deepEqual(value, before);
  });
}
