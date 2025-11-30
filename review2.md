# Conceptual Improvements

- **Unify pagination**: Extract a reusable paginator that stops when `items.length < limit` or `offset >= total_count`, and use it for events, transactions, delegations, and validator histories to avoid subtle infinite loops and off-by-one issues.
- **Handle clipped data gracefully**: When `is_total_count_clipped` is true or `total_count > fetched`, return partial results with a clear warning (“results truncated—refine filters”) instead of throwing outright.
- **Normalize addresses once**: Normalize all addresses (`from`, `to`, `to_eth`, contract) at ingestion to avoid repeated `.toLowerCase()` calls and prevent casing-related misses.
- **Add schema guards**: Use optional chaining or small validators on nested fields (e.g., `ev.body.amount.Amount`, `ev.evm_log_params`) and log unexpected shapes as warnings rather than crashing the entire export.
- **Targeted tests**: Add tests for pagination continuation, ERC20 contract sanity handling, and Sapphire 2023 transaction backfill overflow to cover the control paths where failures have been observed.
- **Adaptive backoff**: Replace fixed `sleep(100)` with simple exponential backoff and honor `Retry-After` headers to reduce throttling risk and improve performance on small fetches.
