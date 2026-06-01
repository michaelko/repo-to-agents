# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to semantic versioning.

## [0.1.1] - 2026-06-01

### Added

- Python and Go fixture coverage for detector and generated command behavior.

## [0.1.0] - 2026-06-01

### Added

- Initial TypeScript CLI with `repo-to-agents` binary.
- Repository inspection for common Node.js, Python, Go, Rust, Docker, Makefile, test, CI, README, and source directory signals.
- Deterministic `AGENTS.md` generation.
- Optional GitHub Copilot, Cursor, and Claude instruction targets.
- Safe `--write`, drift-detecting `--check`, `--force`, `--stdout`, `--targets`, and `--output` options.
- Tests for detection, markdown generation, target paths, CLI behavior, and protected writes.
