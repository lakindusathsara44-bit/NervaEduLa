# NervaEduLa Full LMS Audit — 2026-11

**Audit target:** `main` at the audit start point (commit `db9b816ad53d5e338114dba40bb9fce3f6b54e29`)  
**Fix branch:** `audit/full-lms-audit-fixes-2026-11`  
**Method:** source/configuration review and regression-test additions. No production probing, exploitation, live student-data access, or production deployment was performed.

## Executive summary

NervaEduLa is primarily a **Node.js + vanilla HTML/CSS/JavaScript + Firebase Admin/Cloud Firestore** application. The repository also contains a separate Streamlit starter interface (`app.py`); it is explicitly a preview and is not connected to the LMS authentication or database. Supabase is **not currently integrated**: the tracked application dependency is `firebase-admin`, with Firestore configuration and rules present.

The Node.js app already implements student/teacher/admin accounts, teacher verification, subject selection, resource publishing (PDF/video), ImageKit upload integration, paid-video access requests, teacher plan requests, and six-question MCQ quizzes. It is a working LMS foundation, but the source does not demonstrate a complete school LMS feature set such as attendance registers, gradebooks/report cards, persisted quiz history, student progress analytics, or parent accounts.

## Confirmed findings

| ID | Severity | Finding | Evidence / impact | Branch action |
|---|---|---|---|---|
| AUD-01 | High | Production session signing had a predictable fallback and could reuse the admin password. | `server.js` selected `NERVAEDU_SESSION_SECRET`, then `NERVAEDU_ADMIN_PASSWORD`, then a fixed placeholder. If deployed without a dedicated secret, signed sessions and download links could be forged by anyone who knows/guesses the fallback. | Fixed: production now fails closed unless a separate `NERVAEDU_SESSION_SECRET` is at least 32 characters. Added deployment secret mapping and operator documentation. |
| AUD-02 | Medium | Login/registration throttling trusted raw `X-Forwarded-For`. | The header is client-controlled unless the proxy chain is explicitly trusted; an attacker can vary it to evade the per-key in-memory counter. | Fixed conservatively: rate-limit key now uses the transport peer. This avoids spoofed header bypass, but can group users behind a shared proxy. A trusted-proxy-aware distributed limiter remains necessary for accurate per-client production throttling. |
| AUD-03 | Medium | Quiz submission did not verify the student's selected teacher. | `POST /api/quizzes/:id/submit` required a student session and a valid quiz ID, but did not enforce the same subject/teacher relationship applied by `GET /api/quizzes`. A student could submit directly to another teacher's quiz if its ID became known. | Fixed: submission now requires that the student selected that quiz's teacher for its subject. Added allowed/denied regression cases. |
| AUD-04 | Medium | CORS response headers alone did not reject untrusted cross-origin state-changing requests. | `applyApiCors` omitted CORS headers for disallowed origins, but the server still processed the request. CORS is a browser read-control mechanism, not a server-side CSRF check. | Fixed: state-changing requests with an `Origin` now require same-origin or an exact configured CORS origin. The GitHub Pages origin remains supported only through the explicit allowlist. Added a denied-origin regression case. |

## Architecture and functional review

### Implemented in the Node.js LMS
- Student and teacher registration; admin account-manager bootstrap and login.
- Teacher verification workflow and role-gated teacher publishing.
- Subject catalog and student-to-teacher subject selection.
- PDF and video resources; local file signature checks and ImageKit server-side verification.
- Video access requests/unlocks and WhatsApp receipt handoff.
- Teacher capacity-plan request and admin activation workflow.
- Six-question MCQ creation, delivery, and score calculation.
- Firestore persistence through Firebase Admin SDK; direct browser Firestore reads/writes are denied by `firestore.rules`.

### Confirmed scope gaps / product limitations
- `app.py` is a separate Streamlit UI preview. It has no teacher authentication and does not save resources to Firebase/database. It is not a Streamlit migration of the Node.js LMS.
- The current quiz submit route returns a score but does not persist attempts, history, or a longitudinal student-progress record.
- No attendance register, gradebook/report card, course timetable, parent/guardian portal, or student performance analytics was found in the reviewed application source.
- The repository uses Firestore/Firebase Admin, not Supabase. No Supabase client/configuration was found in the tracked project tree.

## Important risks not changed in this branch

1. **Firestore write scalability and concurrency:** `firebase-store.js` reads each collection and rewrites the complete desired collection on every save, deleting records absent from the local in-memory snapshot. This can be expensive and, with multiple Cloud Run instances or concurrent writers, can overwrite/delete another instance's newer data. A transactional per-record persistence design is recommended before scaling. This requires a careful data migration and concurrency design, so it was not changed as a small audit patch.
2. **Rate limiting behind Cloud Run:** using the socket peer prevents spoofed `X-Forwarded-For` values but may group requests behind a proxy. The limiter is also process-local and is not shared between instances. Adopt a trusted proxy strategy plus a shared limiter (for example, a managed Redis/Cloud Armor-based design) before relying on it for production abuse resistance.
3. **Stateless session lifecycle:** sessions are signed and expire after seven days, but there is no server-side session registry/revocation mechanism. Clearing the browser token on logout does not invalidate a previously copied bearer token before expiry.
4. **CSRF depth:** exact Origin allowlisting is a useful browser boundary, but it is not a CSRF-token implementation. Keep bearer-token use for the GitHub Pages frontend and add CSRF tokens if cookie-authenticated browser flows are introduced.
5. **Uploads:** file type/size checks and ImageKit ownership/privacy checks exist, but no malware scanning or automated orphan-file cleanup was found. Verify retention and storage quotas operationally.
6. **Security headers:** the server sets X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and Permissions-Policy. A Content Security Policy is not configured; introduce one in report-only mode first because the frontend contains inline scripts/styles and external font resources.
7. **Workflow supply-chain controls:** some workflows use version tags for GitHub Actions rather than immutable full commit SHAs. Pin and periodically review every third-party action.
8. **Operations:** no live Firestore backup/restore exercise, secret-scanning service result, production dependency-audit result, or production authorization test was performed as part of this review.

## Tests and verification status

The repository already has Node test coverage for Pages API registration/login/resource access, Firestore row synchronization, Pages build behavior, and a frontend startup selector regression. The branch adds tests for:
- rejecting an untrusted Origin on a state-changing API route;
- allowing an assigned student to submit a quiz and rejecting an unassigned student;
- refusing production startup when the dedicated session secret is missing.

**Not yet verified at the time this report was authored:** the full `npm test` run, `npm audit` results, GitHub Actions completion, Cloud Run deployment, real Firestore behavior under concurrent writers, ImageKit production upload, and browser/manual UI testing. Do not treat this report or branch as production approval.

## Deployment action required before production release

Create a new Google Secret Manager secret named `NERVAEDU_SESSION_SECRET` containing a cryptographically random value of at least 32 characters, grant the Cloud Run runtime service account access, and then deploy from the reviewed branch only after CI passes and the deployment configuration is verified. Do not reuse the admin password.

## Supabase note

No Supabase migration or connection was made. The repository's current persistence contract is Firestore; switching to Supabase would be a separate architecture/database migration, not a drop-in audit fix.
