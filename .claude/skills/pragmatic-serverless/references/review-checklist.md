# Review checklist

Use this when reviewing a change (your own or someone else's). Report only real issues, most important first.

## Correctness

- Does it do what the feature needs, including edge cases (empty, duplicates, concurrency, double scans, time zones, school holidays)?
- Are invariants enforced in the database (conditions/transactions), not only in code?
- Are retries safe (idempotent)?

## Simplicity

- Is there a simpler design with the same outcome? Any abstraction used only once?
- Does it follow existing patterns in the codebase?
- Any dead code, unused dependencies, leftover flags?

## Security & privacy

- Server-side authorization (role + ownership) on every new endpoint?
- Input validated? Personal data kept out of logs/URLs/metrics?
- IAM scoped to specific resources?
- Retention/anonymisation considered for new personal data?

## Observability

- Would we notice if this breaks in production (log, metric, alarm)?
- Are errors logged once, with context, at the right level?

## UX & accessibility

- Loading/empty/error/success states?
- Keyboard and screen reader friendly? Contrast OK?
- Text translated in nl-BE and en, wording clear for the target user?

## Cost

- Any new fixed monthly cost? Estimate stated?
- Log retention, TTLs and lifecycle rules set?

## Maintainability

- Names in domain language? Comments explain why?
- Tests cover the business rules and fail with meaningful messages?
- Docs/decision log updated?
