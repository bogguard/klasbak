# Frontend & UX conventions

## Structure

```
apps/web/src/
  app/            # routing, providers, layout shells
  features/       # one folder per domain: catalog/, circulation/, readers/ ...
    catalog/
      components/
      api.ts      # TanStack Query hooks for this feature
      routes.tsx
  components/ui/  # shared design-system components (Button, Dialog, Table ...)
  lib/            # api client, i18n setup, formatting helpers
  locales/        # nl-BE.json, en.json
```

## Principles

- **Server state in TanStack Query**, UI state in components. No global store until there is a proven need.
- **Forms**: React Hook Form + the shared Zod schema (`zodResolver`). Validate on blur/submit, show messages next to the field.
- **Optimistic updates only where failure is rare and harmless**; otherwise show progress and confirm.
- **URL is state**: search queries, filters and pagination live in the URL so links can be shared and the back button works.
- **Code-split by route** (`lazy()`), keep the public catalogue bundle small.

## Usability

- **Frequent tasks first.** The desk screen (check-out / check-in) must work with keyboard and barcode scanner only: autofocus the scan field, Enter submits, clear audible/visual feedback, refocus after each scan.
- **Forgiving input**: trim whitespace, accept ISBN with or without dashes, case-insensitive search, typo-tolerant search.
- **Undo over confirm** for reversible actions; confirm dialogs only for destructive ones and name the consequence ("Delete 3 copies?").
- **Feedback within 100 ms** (button state), skeletons for loads > 300 ms, toasts for background success, inline messages for errors.
- **Children as users**: large touch targets (≥ 44px), simple words, covers/images prominently, no time pressure.
- **Empty states** explain what this is and offer the next action.

## Visual design

- Tailwind design tokens: one neutral scale, one accent color, semantic colors for success/warning/danger. Define them once in the theme.
- Typography: one font family (system UI stack or one variable web font), clear scale (e.g. 14/16/20/24/32).
- Spacing on a 4px grid; generous whitespace; align to a consistent layout grid.
- Support light and dark mode via CSS variables if cheap; otherwise light only, done well.
- Icons from one set (e.g. Lucide), always with a text label or `aria-label`.

## Accessibility (WCAG 2.2 AA)

- Semantic elements first (`button`, `nav`, `main`, `table`, `label`).
- Visible focus ring on everything focusable; logical tab order; skip-to-content link.
- Contrast ≥ 4.5:1 for text; don't rely on color alone (add icons/text).
- Announce async results with `aria-live` (e.g. scan result on the desk screen).
- Run axe in Playwright tests on key pages.

## i18n

- All user-visible text goes through `t('feature.key')`. Keys and code are English; Dutch (nl-BE) is the default locale, English the fallback.
- Use ICU/plural support for counts; format dates and numbers with `Intl` using the active locale and the library's time zone.
- Emails and PDFs (labels, reminders) are translated too.
- Never concatenate translated fragments; use interpolation.
