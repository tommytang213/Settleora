# Local Tooling Troubleshooting

This note covers recurring local Windows/npm validation friction seen during Codex runs. It is not a product-code failure and should not be fixed by weakening repository security defaults.

## Known npm install pattern

Some local runs of exact `npm ci` have failed with npm's internal `Exit handler never called!` error. Related logs have also shown certificate or TLS failures such as `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, and local cache/log write failures under the user's npm cache directory.

When this happens, downstream Settleora validation has often passed after one local recovery install:

```powershell
npm ci --no-audit --prefer-offline
```

Use that command only after the required exact `npm ci` attempt fails with this known local npm/certificate/cache pattern. Record the exact failure and do not claim exact `npm ci` passed when only the recovery install passed.

## Safe machine-level fixes

- Keep `strict-ssl=true`. This is npm's secure default and must remain the expected behavior.
- If the machine or network uses TLS interception, configure npm with a user/global `cafile` that points to the organization's trusted CA bundle.
- Do not commit certificates, local machine paths, proxy credentials, tokens, or user-specific npm configuration.
- Do not commit a project `.npmrc` that sets `strict-ssl=false`.
- Do not hide real dependency vulnerability work. `--no-audit` is a local recovery path for an install-network failure, not a replacement for reviewing actual audit results when needed.
- `prefer-offline` avoids cache staleness checks but still fetches packages that are missing from the local npm cache.

Example user-level CA configuration, using a machine-specific path:

```powershell
npm config set cafile "C:\path\to\trusted-corporate-ca.pem" --location=user
npm config set strict-ssl true --location=user
```

## Diagnostic commands

Run the scoped validation doctor before changing machine configuration:

```powershell
npm run doctor:validation
```

Use Docker and mobile preflight only when that validation is relevant:

```powershell
npm run doctor:docker
npm run doctor:mobile
```

The base doctor checks Node, npm, npm cache/log writability, and dotnet. Docker checks require both Docker client and server. Mobile checks probe Flutter responsiveness and call out possible stale Flutter lock/process symptoms without killing processes automatically.

For deeper npm-specific diagnostics, run:

```powershell
node --version
npm --version
npm config get registry
npm config get strict-ssl
npm config get cafile
npm config get audit
npm config get proxy
npm config get https-proxy
npm ping --registry=https://registry.npmjs.org/
```

Do not paste full `npm config list`, environment dumps, or verbose logs into reports unless secrets have been reviewed and redacted. Full npm config output can expose tokens, registry credentials, proxy credentials, or user-specific machine paths.

## Codex recovery rule

For Settleora validation work:

1. Run exact `npm ci` once when the task requires it.
2. If it fails with the known local certificate/npm exit-handler pattern, capture the error summary.
3. Run one recovery install:

   ```powershell
   npm ci --no-audit --prefer-offline
   ```

4. Continue validation only if the recovery install succeeds.
5. Do not loop repeated npm installs. Stop and report if the recovery command also fails.

## Long-command retry rule

Retry long validation commands only after a concrete change that could affect the failure, such as a code fix, dependency install, cache/permission repair, Docker startup repair, or Flutter SDK/cache repair. Do not blindly rerun `npm ci`, Docker builds, `flutter pub get`, `flutter analyze`, or `flutter test`.

Mobile validation for the Flutter app must use Flutter:

```powershell
cd apps/mobile
flutter pub get
flutter analyze
flutter test
```

Do not use `dart test` for the Flutter app.
