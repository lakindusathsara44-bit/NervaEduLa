# NervaEduLa Security Hardening Status

Date: 2026-10-23
Scope: passive review of tracked source and workflow configuration; no production probing or exploitation.

## Changes proposed on this branch

- Add weekly Dependabot update checks for npm packages and GitHub Actions.
- Add a least-privilege security workflow with dependency audit, project checks, and a basic tracked-text credential-pattern check.
- Add a security reporting policy and production operator checklist.

## Evidence-based observations from the reviewed main branch

- `server.js` defines a session signing secret fallback that ultimately uses a fixed placeholder string. Production should fail closed if a strong dedicated `NERVAEDU_SESSION_SECRET` is missing; the admin password should not be reused as a session-signing key.
- Login and registration throttling use an in-memory map and derive the key from `X-Forwarded-For` before the socket address. Proxy trust must be explicitly configured; untrusted forwarded headers must not control rate-limit identity. In-memory throttling is not shared across instances.
- The session cookie uses `HttpOnly`, `SameSite=Lax`, and adds `Secure` when `NODE_ENV=production`.
- Firestore rules deny all direct client reads and writes, consistent with server-side Firebase Admin SDK access. Server-side authorization still needs route-level tests.
- Existing `npm test` only runs syntax checks. It is not an application security regression suite.
- Existing deployment workflow uses Google Workload Identity Federation and Secret Manager references, which is preferable to embedding credentials in the workflow. Deployment remains unauthenticated at the Cloud Run ingress by design, so application authentication and authorization must be robust.

## Not verified

- No live production tests, authenticated route tests, CSRF tests, upload abuse tests, secret scanning service results, dependency audit results, or backup-restore test were executed as part of this source review.
- No conclusion is made about exploitable authorization flaws without route-level test evidence.
- The simple credential-pattern job is not a replacement for GitHub secret scanning or a full history scan.

## Required follow-up before production approval

1. Fix session secret startup validation and add session expiry/tampering tests.
2. Define a trusted-proxy strategy and use distributed rate limiting for multi-instance deployment.
3. Add origin/CSRF protections to state-changing browser requests and regression tests.
4. Add security headers with a CSP compatible with the current frontend; test before enforcing.
5. Add route authorization tests for student, teacher, and admin actions, including resource ownership and paid-video entitlement.
6. Review upload handling, file signature validation, storage access, and cleanup behavior.
7. Run `npm audit` and review advisories and lockfile integrity; do not automatically apply breaking upgrades.
8. Enable GitHub secret scanning/push protection and branch protection where available.
9. Review and pin GitHub Actions to verified full commit SHAs or use a supported workflow dependency lockfile.
10. Test Firestore backup and restore and ensure production data files are not persisted as unintended public artifacts.
