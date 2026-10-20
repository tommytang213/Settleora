# Unsigned dSYM retention boundary

The complete local review of `96d8b864c605a0aa0de0154f8901d351993c72eb`
found that a dSYM can retain unreferenced private text inside declared DWARF
or symbol string tables while preserving a valid DWARF graph and executable
UUID. Structural byte accounting and a newly observed hash do not authenticate
these unsigned bytes.

The finding was reproduced on Linux with two synthetic Mach-O files containing
`PRIVATE_RECEIPT_TEXT_123`, one in each string-table representation. Both passed
the installed LLVM 18 `dwarfdump --verify`, UUID comparison, structural byte
accounting, and the previous archive verifier. A valid control without the
extra text passed as well. Apple signature checks were mocked for this local
experiment; it is not Xcode, codesign, signing, export, or real macOS evidence.

The signed build now preserves the original Xcode archive at
`build/ios/archive` for local diagnostics and prepares a separate retained copy
under `build/ios/retained-archive`. That copy contains only `Info.plist` and
`Products`: constrained unsigned metadata and application bytes checked
against the signed exported IPA. dSYM bytes are neither rewritten nor claimed
to be authenticated. The original archive is unchanged, and the IPA is not
rebuilt, re-signed, or modified by this step.

The complete retained copy must pass the archive privacy verifier before an
atomic rename places it under the artifact upload glob. Failed copies remain
under a `.pending` name outside that glob. Codemagic's artifact declaration and
archive-count check use only the retained path. Provenance explicitly labels
the retained representation as `signed-app-and-constrained-metadata-only-v1`
and records that unsigned debug symbols are not retained. No new trust anchor,
signing identity, credential, security setting, upload destination, or release
operation is introduced. Retaining debug symbols in distributed artifacts
would require separate authenticated evidence; UUID equality is insufficient.

Tests cover valid controls, both unreferenced payload variants, preservation
of the original archive, unchanged app bytes, failed-copy isolation, existing
output protection, symlink rejection, canonical CLI paths, and the artifact
upload boundary. Real macOS/Xcode archive compatibility remains a separate
gate. This source change does not authorize deployment or distribution.
