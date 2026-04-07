# Security Policy

## Supported Reporting Path

Please do not open public issues for security vulnerabilities.

If you discover a vulnerability:

1. Use GitHub's private vulnerability reporting for this repository if enabled
2. If private reporting is not enabled yet, contact the maintainers through a private channel before disclosure
3. Include reproduction steps, impact, and any proposed mitigation

## What To Report

- Authentication or authorization bypass
- Data leakage or cross-user access
- Secret handling failures
- Unsafe file upload or parsing behavior
- Prompt-injection or model-routing issues that expose protected data
- Dependency vulnerabilities with practical impact

## Disclosure Expectations

- Give maintainers reasonable time to investigate and patch
- Do not publish exploit details before coordination
- Keep user data private during reporting

## Out Of Scope

- Purely theoretical issues without a plausible exploit path
- Missing best-practice headers with no concrete risk
- Self-XSS that requires unrealistic operator behavior

## Sensitive Data

Never include real taxpayer data, credentials, or production secrets in a report.
