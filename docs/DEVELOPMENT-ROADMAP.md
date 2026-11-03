# NervaEduLa Development Roadmap

**Product direction:** LMS + course marketplace  
**User roles:** Student, Teacher, Administrator, Parent/Guardian  
**Delivery strategy:** security and data integrity first, then core academic workflows, then marketplace and advanced learning services  
**Branch policy:** all work is performed on `security/phase-1-production-hardening-2026-11`; `main` is not modified by this work.

## Product vision

Build NervaEduLa as a reliable, mobile-friendly education platform where institutions and independent teachers can publish structured courses, deliver live and recorded lessons, assess learners, track academic progress, and offer paid courses under transparent platform rules.

## Current baseline (repository review)

The current Node.js application already contains student/teacher/admin account flows, teacher verification, subject selection, PDF/video resources, ImageKit integration, video access requests, teacher plan requests, and basic six-question MCQ quizzes. Firebase Admin / Cloud Firestore is the configured cloud persistence layer. The Streamlit `app.py` is a separate preview and is not the main LMS application.

The current repository does **not** yet demonstrate complete attendance, assignment submission/marking, gradebook/report cards, persisted quiz attempt history, parent/guardian access, timetable management, full marketplace checkout/settlement, or AI learning analytics.

## Delivery principles

1. Security, privacy, authorization and data integrity are release gates—not optional later polish.
2. Students only see resources and academic records belonging to their enrolled/assigned courses.
3. Teachers only manage their own courses, learners, assessments and submissions.
4. Parents can only access explicitly linked children and only the permitted read-only information.
5. Admin access is audited and least-privilege; sensitive actions require reasoned audit events.
6. Payment status is verified server-side against a payment provider; a screenshot or client-side flag is not proof of payment.
7. All schema changes require migration/rollback plans and backups.
8. Every feature ships with API, permission, validation and regression tests.
9. `main` remains untouched until a reviewed PR is explicitly approved and merged.

## Phased roadmap

### Phase 0 — Security and operational baseline (current phase)

**Goal:** ensure the production service cannot silently start in unsafe local-storage mode, reduce dependency and deployment risk, and establish release evidence.

- [x] Production requires a dedicated strong session signing secret.
- [x] Browser state-changing requests enforce the configured Origin boundary.
- [x] Quiz submission checks the student's selected teacher/subject relationship.
- [x] Login throttling no longer trusts arbitrary raw `X-Forwarded-For`.
- [ ] Production must fail closed unless Firestore is explicitly selected.
- [ ] Do not write a second local JSON copy of student/teacher data when Firestore is active.
- [ ] Review and resolve npm audit advisories with compatible lockfile updates.
- [ ] Add server-side session revocation/rotation strategy.
- [ ] Add a shared rate limiter suitable for multiple Cloud Run instances.
- [ ] Replace Firestore whole-collection snapshot rewrites with safe per-record operations and concurrency controls.
- [ ] Add CSP in report-only mode, then enforce after frontend compatibility review.
- [ ] Add secret scanning, dependency review, and immutable third-party action pinning.
- [ ] Establish Firestore backup retention and perform a documented restore drill.
- [ ] Add structured security/audit logs without passwords, tokens, or private student data.
- [ ] Add authorization matrix tests for every role and object ownership boundary.

**Exit criteria:** all tests and CI pass; no unresolved high/critical dependency advisories; production configuration validation passes; backup/restore and session/rate-limit operational plans are documented. Moderate advisories require documented risk acceptance if no safe fix exists.

### Phase 1 — Core academic workflows

**Goal:** make the platform useful for real classes and measurable learning.

- Attendance: class session, present/absent/late/excused, correction history, attendance summaries.
- Assignments: teacher-created task, instructions, attachments, due date, resubmission policy, student file submission, feedback and marks.
- Gradebook: configurable assessment weights, score entry, grade calculation, moderation and publish/unpublish.
- Quiz engine: question bank, multiple question types, randomization, timer, attempt limits, autosave, persisted attempts, answer review and result history.
- Student learning dashboard: course completion, upcoming deadlines, attendance, assessment history and progress.
- Teacher class dashboard: roster, pending submissions, attendance and assessment overview.

**Exit criteria:** end-to-end student and teacher workflows tested with role isolation, audit trail and accessible mobile layouts.

### Phase 2 — Course and class operations

- Course catalogue with course outcomes, prerequisites, level, language, duration and syllabus.
- Course sections/modules/lessons, lesson completion and prerequisites.
- Timetable with recurring and one-off sessions, timezone-aware dates and calendar export.
- Live class links (Meet/Zoom or provider integration) with access controls.
- Announcements, email/in-app notifications and configurable reminders.
- Discussion/Q&A per course with moderation, reporting and spam controls.
- Digital library for notes, past papers and downloadable resources with licensing metadata.

**Exit criteria:** teachers can run a complete course from enrolment through lesson delivery and communication.

### Phase 3 — Marketplace and payments

- Public teacher/course storefronts and searchable course catalogue.
- Course pricing, free previews, coupons, bundles and enrolment rules.
- Checkout integration with a supported payment provider; verify webhooks/signatures server-side.
- Payment ledger, refunds, cancellations, receipts and reconciliation.
- Teacher commission, payout eligibility, payout statements and dispute workflow.
- Subscription plans and entitlement checks enforced by the server.
- Fraud controls, rate limits, idempotency keys and payment event audit trail.
- Clear terms, privacy policy, refund policy and teacher/content ownership agreements.

**Exit criteria:** test-mode payment lifecycle is proven end-to-end; reconciliation and refund paths are tested before enabling live payments.

### Phase 4 — Parent/guardian portal and safeguarding

- Parent invitation and verified linking to a student; no search-by-name access.
- Explicit consent and revocation workflow.
- Read-only attendance, grades, assignments, announcements and progress.
- Multiple children per guardian and multiple guardians per student with institution policy.
- Student age/safeguarding settings, reporting and communication boundaries.
- Audit all guardian access to student records.

**Exit criteria:** cross-student access tests pass and consent/revocation is demonstrably enforced.

### Phase 5 — Analytics and AI learning support

- Teacher analytics: attendance patterns, assignment completion, question-level performance.
- Student insights: strengths, topics to revisit and suggested next lessons.
- AI tutor grounded in teacher-approved course materials with source references.
- AI-generated quiz/assignment drafts requiring teacher review before publishing.
- Early-warning indicators with explainable signals; no opaque automated high-stakes decisions.
- Data minimization, opt-out, retention policy, AI safety evaluation and prompt-injection defenses.

**Exit criteria:** privacy review, model evaluation, teacher approval workflow and clear AI limitations are in place.

### Phase 6 — Mobile experience, accessibility and scale

- Progressive Web App installability, offline-safe notes and queued non-sensitive actions.
- Responsive mobile UX and low-bandwidth media delivery.
- Sinhala, English and Tamil localization.
- WCAG-aligned keyboard navigation, screen-reader labels, contrast and captions.
- Performance budgets, pagination, caching and observability.
- Load tests, disaster recovery rehearsal and cost monitoring.

**Exit criteria:** agreed mobile performance/accessibility targets and production load/restore exercises pass.

## Proposed domain model

Use stable document IDs and explicit ownership references. The following are logical entities, not a database migration specification:

- Identity: `users`, `roles`, `parentStudentLinks`, `sessions`, `auditEvents`.
- Learning: `courses`, `courseTeachers`, `enrollments`, `modules`, `lessons`, `resources`.
- Classroom: `classes`, `classSessions`, `attendanceRecords`, `announcements`, `discussionThreads`.
- Assessment: `assignments`, `submissions`, `questionBanks`, `quizzes`, `quizAttempts`, `gradeItems`, `gradeRecords`.
- Marketplace: `orders`, `paymentEvents`, `refunds`, `commissions`, `payouts`, `entitlements`, `coupons`.
- Platform: `notifications`, `files`, `consents`, `supportTickets`.

Do not implement this as a single large migration. Introduce entities incrementally, validate existing data, and preserve backward compatibility during rollout.

## Role and authorization matrix

| Capability | Student | Teacher | Parent | Admin |
|---|---|---|---|---|
| View own profile | Yes | Yes | Yes | Yes |
| View enrolled course content | Yes | Own courses | Linked child's permitted view | Support/admin policy |
| Publish course content | No | Own verified courses | No | Moderation |
| Mark attendance | No | Own class sessions | No | Audited correction |
| Submit assignment | Own work | No | No | No |
| Mark/grade work | No | Own course | No | Audited override |
| View academic records | Own | Assigned learners | Linked child, read-only | Audited access |
| Manage payments | Own purchases | Own sales statements | Only where authorized | Finance/admin roles |

All checks must be enforced on the server, not only by hiding frontend controls.

## Release checklist

- [ ] CI and unit/integration tests pass.
- [ ] Role/ownership/tenant-isolation tests pass.
- [ ] Dependency and secret scans reviewed.
- [ ] Database migration is backward compatible and has rollback instructions.
- [ ] Backup and restore evidence is current.
- [ ] Payment webhooks are signature-verified and idempotent.
- [ ] Logs contain no passwords, tokens, payment secrets or unnecessary student PII.
- [ ] Accessibility and mobile smoke tests pass.
- [ ] Staging acceptance tests are signed off.
- [ ] A reviewed PR is approved before any merge to `main`.

## Current implementation note

This branch starts with Phase 0 only. It does not claim that later phases are implemented. Do not deploy until the production Firestore configuration, secret manager, CI, and operational requirements are verified.
