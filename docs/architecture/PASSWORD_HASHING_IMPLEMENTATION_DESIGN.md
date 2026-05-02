# Password Hashing Implementation Design

This document records the implementation shape for Settleora local-account password hashing. It does not authorize migrations, OpenAPI changes, generated clients, login behavior, current-user behavior, session middleware, password reset, recovery, or UI auth behavior.

## References Checked

External sources were reachable and re-checked on 2026-05-02:

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [NuGet: Geralt](https://www.nuget.org/packages/Geralt)
- [Geralt password hashing docs](https://www.geralt.xyz/password-hashing)
- [NuGet: Konscious.Security.Cryptography.Argon2](https://www.nuget.org/packages/Konscious.Security.Cryptography.Argon2)
- [NuGet: Isopoh.Cryptography.Argon2](https://www.nuget.org/packages/Isopoh.Cryptography.Argon2)
- [.NET Rfc2898DeriveBytes.Pbkdf2](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.rfc2898derivebytes.pbkdf2?view=net-9.0)
- [.NET CryptographicOperations.FixedTimeEquals](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.cryptographicoperations.fixedtimeequals?view=net-9.0)

Those sources support the existing Settleora policy direction: prefer Argon2id for normal non-FIPS deployments, keep salts unique, record algorithm and work-factor metadata for migration, benchmark parameters on the actual deployment class, and use PBKDF2-HMAC-SHA-256 only when an explicit FIPS-compatible deployment mode requires it.

NuGet metadata is useful for target frameworks, package versions, licenses, dependencies, owners, and release recency. It is not enough by itself to approve a security dependency. Future package changes must still review source, transitive dependencies, vulnerability/deprecation status, container behavior, and test-vector coverage before choosing or replacing a package.

## Current State

- `local_password_credentials` exists in the EF Core schema foundation.
- `local_password_credentials` is linked to `auth_accounts` and stores password verifier metadata fields: `password_hash`, `password_hash_algorithm`, `password_hash_algorithm_version`, `password_hash_parameters`, `status`, timestamps, `last_verified_at_utc`, `revoked_at_utc`, and `requires_rehash`.
- Internal `IPasswordHashingService` and credential workflow service boundaries exist for Argon2id verifier creation, EF-backed local password credential creation for existing auth accounts, verification, metadata, and rehash decisions.
- Login, token issuance, current-user endpoints, session middleware, password reset, recovery, generated clients, and UI auth behavior do not exist.
- No OpenAPI auth paths exist.
- The API project currently targets `net9.0`.
- Current direct API packages are Geralt 4.0.1, EF Core 9.0.15, EF Core Design 9.0.15, Npgsql 9.0.5, Npgsql EF Core provider 9.0.4, and RabbitMQ.Client 7.1.2.

## Architecture Boundaries

The API/domain auth boundary must own local credential writes and password verification decisions. Endpoint handlers may pass a submitted password into an approved auth service, but they must not parse verifier strings, choose password hashing algorithms, compare derived hash bytes, update credential rows directly, or log credential material.

Workers and clients must not mutate `local_password_credentials`. Generated clients may eventually call reviewed auth endpoints, but generated client availability must not imply authorization and must not expose password verifier internals.

No OpenAPI auth paths, generated client changes, UI auth behavior, or runtime endpoint work belongs in this password hashing boundary. Password hashing must stay behind the internal service boundary until login/current-user/session endpoint contracts are separately reviewed.

## Library Evaluation Criteria

Future dependency selection must evaluate:

- Argon2id support, not only Argon2i or Argon2d.
- Compatibility with the API project's .NET target.
- Maintenance status, release recency, owner posture, issue activity, and deprecation/vulnerability metadata.
- License compatibility with Settleora's intended open-source licensing.
- Native dependency and container implications, including Linux image compatibility, Alpine/musl concerns, Docker build/runtime size, and patching cadence.
- PHC-style or otherwise self-describing verifier support, or the absence of it.
- Whether verification handles constant-time comparison internally; otherwise Settleora must own a fixed-time compare boundary.
- Configurable memory, iteration, parallelism, salt length, output length, and algorithm version.
- Test-vector availability for hash generation, verification, mismatch, malformed verifier input, and parameter parsing.
- Supply-chain risk and operational maturity, including download/adoption signals without treating popularity as proof of security.
- FIPS/PBKDF2 fallback implications and clear deployment policy boundaries.

## Candidate Options

### Geralt 4.0.1

Geralt is a modern .NET cryptography package with Argon2id support. NuGet shows version 4.0.1, last updated 2026-03-22, MIT license, `net8.0` as an included target with computed `net9.0` compatibility, and a `libsodium` dependency. Its documentation exposes Argon2id password-hashing APIs for encoded hash computation, verification, and needs-rehash checks.

Strengths:

- Argon2id is the password hashing primitive exposed for this use case.
- Release recency is good as of this review.
- MIT license is straightforward if confirmed during legal review.
- The API shape appears close to Settleora's needs because it includes encoded hashes, verification, and rehash checks.
- Built on libsodium, which may be operationally attractive if native packaging is acceptable.

Risks and unknowns:

- The native `libsodium` dependency must continue to be validated in the API Docker image and target deployment environments when package/runtime behavior changes.
- The current Geralt encoded verifier length fits the existing `password_hash` max length.
- Geralt delegates verification to libsodium's password-hash verify API; deeper source audit remains a security review follow-up.
- Current version adoption is lower than older Argon2 packages, so operational maturity should be evaluated beyond release recency.
- Not FIPS-approved for password hashing; PBKDF2 fallback is still required for explicit FIPS-compatible mode.

Assessment: selected for the current internal service after package metadata, source posture, verifier format, and Docker behavior validation.

### Konscious.Security.Cryptography.Argon2 1.3.1

Konscious.Security.Cryptography.Argon2 is a .NET Argon2 package. NuGet shows version 1.3.1, last updated 2024-06-19, MIT license, included targets for .NET Framework 4.6, .NET Standard 1.3, .NET 6.0, and .NET 8.0, with computed `net9.0` compatibility. The package description and docs include Argon2id support and configurable parallelism, memory, iterations, salt, associated data, known secret, and derived output length.

Strengths:

- Argon2id-capable and compatible with the current API target through .NET compatibility.
- MIT license is straightforward if confirmed during legal review.
- Popular package with substantial download history.
- No obvious native dependency from NuGet metadata, which may simplify containers compared with libsodium-backed options.
- Low-level API gives Settleora full control over salt, output length, metadata, and future PHC-style encoding.

Risks and unknowns:

- The package primarily exposes derived bytes, not a high-level self-describing verifier and verification lifecycle.
- Settleora would need to own verifier encoding, parsing, parameter normalization, malformed-input handling, fixed-time comparison, and rehash detection.
- Source-level review is needed before trusting constant-time behavior or memory handling.
- Maintenance cadence is slower than Geralt's current package line.
- Not FIPS-approved for password hashing; PBKDF2 fallback is still required for explicit FIPS-compatible mode.

Assessment: viable fallback candidate if Settleora wants to avoid native dependencies and is willing to own a larger verifier wrapper. Not approved by this document.

### Isopoh.Cryptography.Argon2 2.0.0

Isopoh.Cryptography.Argon2 is a fully managed Argon2 package. NuGet shows version 2.0.0, last updated 2023-08-17, included targets for .NET Core 3.1, .NET Standard 2.0, .NET 6.0, and .NET 7.0, with computed `net9.0` compatibility. Its API documentation includes `Argon2Type.HybridAddressing`, which corresponds to the Argon2id direction, encoded hash strings, verification helpers, configurable parameters, and fixed-time comparison support.

Strengths:

- Fully managed implementation reduces native/container complexity.
- Encoded verifier and verify APIs may reduce Settleora wrapper complexity.
- Supports configurable time cost, memory cost, parallelism, hash length, salt, secret, and version.
- Includes secure array helpers and fixed-time comparison support in the API surface.

Risks and unknowns:

- License is Creative Commons Attribution 4.0 according to NuGet/package docs, which is unusual for code and requires explicit license review before adoption.
- Release recency is weaker than Geralt and somewhat older than Konscious.
- The docs note solo support and "provided as is"; support posture needs careful review.
- The implementation branch must confirm exact encoded verifier format, default algorithm selection, and PHC compatibility.
- Not FIPS-approved for password hashing; PBKDF2 fallback is still required for explicit FIPS-compatible mode.

Assessment: technically relevant but not preferred until license and support posture are cleared. Not approved by this document.

### Built-In PBKDF2-HMAC-SHA-256

.NET exposes PBKDF2 through `System.Security.Cryptography.Rfc2898DeriveBytes.Pbkdf2`, including SHA-256. This path requires no new NuGet dependency. It is the FIPS-compatible fallback direction, not the preferred default for normal deployments.

Strengths:

- Built into .NET and compatible with the API target.
- Can be configured for salt length, iteration count, hash algorithm, and output length.
- Works for explicit FIPS-compatible deployments where Argon2id is not acceptable.
- Avoids native package and third-party supply-chain risk for the fallback mode.

Risks and unknowns:

- PBKDF2 is not memory-hard and should not be the default for ordinary non-FIPS deployments.
- Settleora must own verifier encoding, parsing, parameter normalization, fixed-time compare through `CryptographicOperations.FixedTimeEquals`, and rehash decisions.
- Iteration count must be benchmarked and policy-driven; do not freeze fake numbers in design.
- FIPS mode is a deployment policy, not an automatic downgrade.

Assessment: required fallback path for explicit FIPS-compatible deployment mode. Not the default.

## Recommended Direction

Use Argon2id for non-FIPS deployments through Geralt because its API shape matches Settleora's internal boundary: encoded hashes, verification, and rehash checks. Validate its native `libsodium` dependency in the API container when package/runtime behavior changes.

If native dependency risk is unacceptable, evaluate Konscious as the no-obvious-native-dependency fallback, but only with a Settleora-owned verifier wrapper that provides encoded verifier strings, parameter parsing, fixed-time comparison, and rehash decisions. Keep Isopoh in the record as technically relevant but blocked pending license/support review.

Use PBKDF2-HMAC-SHA-256 only when an explicit FIPS-compatible deployment mode is implemented. The current service rejects PBKDF2 configuration as unsupported rather than silently downgrading from Argon2id.

Store the verifier output in `local_password_credentials.password_hash`. Store the algorithm family in `password_hash_algorithm`, such as `argon2id` or `pbkdf2-hmac-sha256`. Store Settleora's policy version in `password_hash_algorithm_version`. Store normalized non-secret parameters in `password_hash_parameters`, such as memory cost, iterations, parallelism, salt length, output length, PRF, encoded-verifier format, and non-secret pepper key identifier if pepper support is enabled.

Support `requires_rehash` as a normal migration path. A credential may require rehash when policy version changes, work factor increases, algorithm family changes, pepper metadata changes, verifier format changes, or a selected library migration requires new encoding. Rehash may occur only after successful verification of an active credential with the submitted password.

Do not store raw passwords, raw verifier inputs, pepper secrets, reset tokens, recovery codes, raw session tokens, or MFA/passkey material in `local_password_credentials`.

## Runtime Shape

The current internal service boundary uses these shapes:

- `PasswordHashingOptions`: binds non-secret password hashing policy under `Settleora:Auth:PasswordHashing`.
- `IPasswordHashingService`: hashes new local credential verifiers, verifies submitted passwords, and decides whether a verified credential needs rehash.
- `PasswordHashResult`: returns verifier output, `Algorithm`, `AlgorithmVersion`, and normalized `ParametersJson`.
- `PasswordVerificationResult`: returns a safe outcome status, `RequiresRehash`, and a bounded rehash reason.
- `PasswordRehashDecision`: explains whether rehash is needed and why, without exposing password material.
- `IPasswordPepperProvider`: optional boundary for retrieving pepper secrets from a secret provider, not appsettings or the database.
- `IAuthAuditEventWriter`: emits safe audit events such as credential created, verification succeeded, verification failed, credential rehashed, credential disabled, or credential revoked.

Non-secret defaults and selected algorithm family can live in application configuration. Pepper values, signing keys, token secrets, reset-token secrets, and any future credential-encryption keys must be secret-provider-backed. Appsettings files committed to source may contain only safe development placeholders, never production pepper material.

The service boundary must normalize all verification failures into safe result categories so endpoint handlers do not learn or log unnecessary detail. Malformed verifier strings, unsupported algorithms, disabled credentials, revoked credentials, wrong passwords, and policy-denied states should be distinguishable enough for audit and operations, but not exposed in a way that enables account or credential enumeration.

## Benchmark And Validation Plan

Future auth workflow work must benchmark deployment-class hardware and container limits before freezing production Argon2id or PBKDF2 parameters. Benchmarks must include the API Docker image or the same runtime constraints expected in production. Memory-heavy Argon2id settings must be tested under realistic concurrent login attempts to avoid turning password verification into a denial-of-service lever.

Latency should be a decision criterion, not an invented measurement. Candidate targets:

- Normal interactive sign-in should usually land in a bounded range such as 100-500 ms per password verification on deployment-class hardware after rate limiting and concurrency controls are considered.
- Very low latency should trigger stronger parameters.
- High latency, excessive memory pressure, swapping, or container OOM risk should trigger parameter reduction, concurrency limits, or deployment guidance.
- PBKDF2 fallback should be tuned separately because iteration count and CPU cost behave differently from Argon2id memory cost.

Required future test categories:

- Hash creation stores a non-empty verifier and normalized non-secret metadata.
- Verification succeeds with the correct password and fails with the wrong password.
- Verification rejects malformed verifier strings safely.
- Unsupported algorithm family or policy version is handled safely.
- Disabled and revoked credentials do not authenticate.
- `requires_rehash` is honored after successful verification only.
- Rehash updates verifier output and metadata, clears `requires_rehash`, and emits a safe audit event.
- Wrong password does not rehash or mutate credential rows.
- FIPS-compatible mode uses PBKDF2-HMAC-SHA-256 and does not silently create Argon2id verifiers.
- Non-FIPS mode uses Argon2id when the dependency is available and configured.
- Fixed-time comparison is used wherever Settleora compares derived bytes directly.
- Logs, metrics, traces, validation output, audit metadata, exceptions, and API responses do not contain plaintext passwords, verifier strings, derived keys, salts, pepper values, reset tokens, recovery codes, raw session tokens, MFA secrets, or passkey material.
- Test vectors cover Argon2id/PBKDF2 output and verification for the selected library and Settleora verifier encoding.

## Explicit Non-Goals

This task does not authorize:

- Migrations.
- Login endpoints.
- Current-user endpoints.
- Password reset or recovery behavior.
- Token issuance.
- Session middleware.
- OpenAPI changes.
- Generated clients.
- UI changes.
- Flutter changes.
- Docker/runtime behavior changes.

## Next Implementation Candidate

After this boundary, public auth runtime work remains blocked on separate review for login/current-user contracts, session issuance, rate limiting, lockout, and audit behavior. PBKDF2-HMAC-SHA-256 fallback remains a separate implementation task for explicit FIPS-compatible deployments.
