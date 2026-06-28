# Settleora User Portal

This directory contains the first React + Vite user portal foundation: a
responsive user-web shell, Day 1 navigation placeholders, privacy-safe
auth-required states, and a bounded session boundary seam.

The current shell does not implement web sign-in, credential storage, fake
current-user data, or feature-complete bills/groups/settlement/report runtime.
Protected information remains hidden unless a future reviewed web auth flow
provides a real session credential to the generated API client boundary.

Generated API client code must come from
`packages/contracts/openapi/settleora.v1.yaml`, and generated files must not be
manually edited.

The user portal must not directly access the database. User-facing operations
go through the backend API.

## Local commands

From the repository root:

```bash
npm ci --prefix apps/web-user
npm run test --prefix apps/web-user
npm run build --prefix apps/web-user
npm run dev --prefix apps/web-user
```
