# Security Policy

## Supported Versions

Security fixes are provided for the latest released version.

## Reporting a Vulnerability

Please do not open public issues for suspected security vulnerabilities.

Send a private report to the maintainers with:

- A description of the issue.
- Steps to reproduce or a proof of concept.
- Affected versions.
- Any known mitigations.

Maintainers should acknowledge reports within 7 days and provide a remediation plan when the issue is confirmed.

## Security Model

`repo-to-agents` reads repository metadata and writes generated instruction files only when requested. It should not execute project scripts during inspection. Treat repositories from untrusted sources as untrusted input.
