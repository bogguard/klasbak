# Review checklist

Use this when reviewing a change (your own or someone else's). Report only real issues, most important first.

## Correctness

- Does it do what the feature needs, including edge cases (empty, duplicates, concurrency, double submits, time zones, closed days and holidays, odd data)?
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
- Text translated into the project's languages, wording clear for the target user?
- Checked visually (desktop, phone, dark mode; generated PDFs) and walked through as each persona?

## Cost

- Any new fixed monthly cost? Estimate stated?
- Log retention, TTLs and lifecycle rules set?

## Delivery

- One concern, small enough to review in one go? Refactor and behaviour change in separate PRs?
- Short-lived branch, up to date with `main`? Unfinished work behind a flag or hidden?
- Can it be rolled back by redeploying the previous version? Data changes backwards-compatible (expand → migrate → contract)?
- PR description says why, how it was tested, with screenshots for UI changes?

## Maintainability

- Names in domain language? Comments explain why?
- Tests cover the business rules and fail with meaningful messages?
- README still true: new or changed commands, scripts, setup steps, settings and features described, and its commands run as written?
- Decision log updated?
