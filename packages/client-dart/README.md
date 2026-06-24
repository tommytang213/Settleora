# Dart API Client

The Dart/Flutter API client is generated from `packages/contracts/openapi/settleora.v1.yaml`.

Generated files live in `packages/client-dart/lib/generated/` and must not be manually edited.

Regenerate and validate from the repo root:

```powershell
npm run generate:clients
npm run validate:clients
```

`npm run validate:clients` is non-mutating: it generates into a temporary
workspace and compares that output with the checked-in generated files.
