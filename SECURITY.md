# Security Policy

## Supported deployment

Security reports should identify the affected NervaEduLa commit or deployed version and the relevant component. Please do not include real student data, passwords, session cookies, API keys, or other secrets in reports.

## Reporting a suspected issue

For a private report, use GitHub's **Report a vulnerability** feature in the repository's Security tab if it is available. If private vulnerability reporting is not enabled, contact the repository maintainer through a private channel before publishing details.

Please include:
- A concise description and potential impact.
- The affected file, route, or configuration.
- Reproduction steps using a local test environment and synthetic data.
- Any relevant logs with credentials and personal data removed.

Do not access other users' accounts or data, disrupt the service, upload malicious files to production, or perform testing against systems without explicit authorization.

## Response and disclosure

The maintainer will triage reports, confirm reproducibility, and coordinate a fix and disclosure timeline. This file does not promise a response-time SLA.

## Deployment operator checklist

- Keep production secrets in the deployment secret manager, not in Git.
- Rotate credentials if exposure is suspected.
- Require HTTPS and secure cookies in production.
- Keep dependencies and GitHub Actions reviewed and updated.
- Restrict production deploy permissions and review changes before merging.
- Maintain tested backups and a documented restore procedure.
