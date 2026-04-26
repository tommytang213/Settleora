# CI_CD_AND_PUBLISHING_REQUIREMENTS.md

## Goal
Settleora must include a real CI/CD design that supports code quality, safe releases, and image/app publication.

## CI Requirements
On pull requests and protected branch pushes, run:
- formatting/linting
- unit tests
- integration tests where practical
- dependency/security scanning
- build validation for touched components
- migration validation where practical
- container build validation

## CD / Publishing Requirements
The release workflow should support:
- publishing container images to GitHub Container Registry
- optional mirroring to Docker Hub
- generating release notes/changelog
- semantic version tagging
- packaging web artifacts
- creating mobile release artifacts for iOS and Android
- staged promotion from test/staging to production where applicable

## Registry Strategy
Primary:
- GitHub Container Registry

Optional mirror:
- Docker Hub

## Tagging Strategy
Support tags such as:
- `latest`
- semantic versions like `v1.2.3`
- commit/build tags
- branch preview tags where useful

## Environment Strategy
Recommended environments:
- development
- CI test
- staging
- production

## Secrets Handling
- never commit secrets
- use CI secret stores
- keep prod and non-prod secrets separated
- protect signing keys/tokens carefully

## Manual Approval Gates
Support manual approval gates for:
- production deploy
- mobile store release submission
- destructive migrations
- sensitive config changes

## Mobile Publishing
Pipelines should be designed to enable future automation for:
- iOS build/sign/export
- Android build/sign/export
- TestFlight/App Store preparation
- Play Store preparation

Human approval may still be required before final submission/release.
