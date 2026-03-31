# Changelog

All notable changes to this project will be documented in this file.

## [0.1.6] - 2026-03-31

### Changed
- Bumped package version for a fresh npm release after the previous GitHub release/tag did not match the published package version.

## [0.1.4] - 2024-12-21

### Fixed
- **Stuck Processing State**: Added an `onComplete` handler to the internal workpool. This ensures that if retries are exhausted (e.g., permanent failures or timeouts), any emails remaining in the `processing` state are correctly marked as `failed`, preventing them from getting stuck indefinitely.
- **Explicit Retry Configuration**: Configured the batch sender to retry up to 5 times with exponential backoff (starting at 1s) for temporary errors.

## [0.1.3] - 2024-12-21

### Optimized
- **Parallel Processing**: The batch worker now splits jobs into smaller chunks (10 emails) to fully utilize the worker pool (4 concurrent threads). This significantly increases throughput for large queues.

## [0.1.2] - 2024-12-21

### Improved
- **Durable Execution & Concurrency**: Switched to a Singleton Worker (pulse) pattern for email batching. This eliminates race conditions under high load and ensures strictly ordered execution.
- **Robust Retry Logic**: The component now correctly identifies temporary errors (Rate Limits, 401s, 500s) and throws them, allowing Convex's built-in scheduler to retry with exponential backoff.
- **Processing Safety**: Introduced a `processing` lock state to prevent duplicate processing of the same email by concurrent workers.
- **Cleanup**: Updated `cleanupAbandonedEmails` to handle emails stuck in the `processing` state.

## [0.1.1] - 2024-12-21

- Fixed repository URL in package.json
- Verified organization setup

## [0.1.0] - 2024-12-21

### Added
- 📤 Send emails with durable execution and automatic retries
- 📩 Receive inbound emails via webhooks
- 💬 Reply to emails with proper threading (In-Reply-To, References headers)
- 📊 Batch sending for high-volume email
- 🛡️ Idempotency to prevent duplicate sends
- 📉 Rate limiting to respect API limits
- 🔍 Email tracking (bounced, opened, clicked, complained)
- 🔒 Test mode for safe development
- 🧹 Cleanup utilities for data retention
