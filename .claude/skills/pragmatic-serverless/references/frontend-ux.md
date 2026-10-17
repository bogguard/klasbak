# Frontend & UX conventions

## Structure

The full repository layout is in `SKILL.md` (section 3). In the frontend:

- `features/<domain>/` holds everything for one domain area: `<Name>Page.tsx` per route, components used only there, `api.ts` with its TanStack Query hooks, and pure helpers with their tests next to them.
- `components/ui/` holds the shared design-system components; `app/` routing, layout and guards; `lib/` app-wide helpers.
- A component used by two domains moves to `components/`; a helper used by two domains moves to `lib/` (or `packages/shared` when the API needs it too).

## Principles

- **Server state in TanStack Query**, UI state in components. No global store until there is a proven need.
- **Forms**: React Hook Form + the shared Zod schema (`zodResolver`). Validate on blur/submit, show messages next to the field.
- **Optimistic updates only where failure is rare and harmless**; otherwise show progress and confirm.
- **URL is state**: search queries, filters and pagination live in the URL so links can be shared and the back button works.
- **Code-split by route** (`lazy()`), keep the public catalogue bundle small.

## Usability: think like a demanding UX engineer

Features are not done when they work; they are done when the real person, in the real situation, gets through the task without thinking, without help and without mistakes. Be the critical reviewer of your own work.

**Start from people and their moments**

- Name the personas and their context before designing (the librarian with a queue of children, the child at a shared screen, the administrator once a year, the teacher handing out slips). Design the most frequent moment first and make it fast.
- Write the workflow as steps (e.g. "scan card → scan books → next child") and count clicks, keystrokes and decisions. Every decision you can take for the user is one less mistake.
- Use the users' own words (glossary) and their real-world artefacts (class lists, label sheets, receipt paper, the school's printer) instead of inventing new ones.

**Remove modes and decisions**

- One action that does the right thing beats a choice of modes. Example: at the desk, one scan field — a card selects the reader, a lent book is returned, an available book is lent to the reader at the desk. The server decides, in one place.
- Sensible defaults everywhere (loan period, sort order, sheet type, the current school year); settings only for what really differs between users.
- Offer the next step where the user is: a link to print the label right after adding a copy, "make reminder slips" on the overdue list, the kiosk link on the desk.

**Expect the real world**

- **Repeat-safe**: scanners double-scan, people double-click, networks retry. Detect duplicates (a second scan within a minute is not a return) and make mutations idempotent.
- **Stale state is a bug**: don't leave the previous person on screen ("X is at the desk" a minute later). Clear shared state after inactivity, with a visible countdown and a "stay" button.
- **Forgotten, lost, wrong**: a pupil without card (search by name), a lost card (reprint the same number), a book scanned on the wrong screen ("this is a book, scan your card"), a partly used label sheet (choose where to start), a printer that shifts a few millimetres (offset, remembered).
- **Forgiving input**: trim whitespace, ISBN with or without dashes, case- and accent-insensitive, typo-tolerant search, CSV with `;` or `,`, Excel's byte-order mark, and a preview/dry-run before importing.
- **Messy data**: long titles, accents sent as separate characters, missing covers, readers without a class, classes like "2A" and "10A" (natural sort, empty last).

**Feedback and errors**

- Respond within 100 ms (button state); skeletons for loads over 300 ms; changes appear immediately (update the local cache or search index instead of waiting for a background rebuild).
- After an action, say what happened in the user's terms ("Lent: The Gruffalo — due Thu 5 Nov") and keep the last few results visible.
- Errors say what happened and what to do next, with the details filled in ("This reader already has 3 books. Return one first."). API errors carry a code and details; the UI translates them. Never show technical text.
- Keep the user's place: refocus the main input after every action, dialog or print; keep filters and queries in the URL.
- Undo over confirm for reversible actions; confirm only destructive ones and name the consequence ("Delete 3 copies?").

**Respect roles and trust**

- Show people only what they can do (hide admin-only sections from librarians), and let the server enforce it anyway.
- Shared screens and printouts show the minimum personal data needed; private by default.
- Children as users: large targets (≥ 44 px), simple words, images first, no time pressure, nothing they can break.

**Review it like a tough UX engineer**

- Walk every changed workflow end to end as each persona, including the unhappy paths above, on desktop and phone, with keyboard only.
- Ask: what would confuse a first-time user? What would annoy someone doing this 200 times a day? What happens a minute later, a school year later, when the data is odd?
- Fix what you find, or list it explicitly as a follow-up; never ship "it works if you know how".

## Visual design: aim for "made by a good designer"

The bar is not "a clean admin template" but a product that feels made for its place and its people. Before styling anything, answer: _where is this used, by whom, and what should it feel like?_ (A school library: warm, calm, bookish, friendly to children, not an office tool.) Then let every choice follow from that.

**Character**

- **A palette with a mood, not default greys.** Pick tones that fit the setting (e.g. warm "paper" surfaces and one deep accent) and define them as semantic tokens (`surface`, `surface-sunken`, `ink`, `muted`, `line`, `accent`, `accent-soft`, `success`, `warning`, `danger` and their `-soft` variants) in CSS variables. Components use only tokens, never raw colours, so dark mode and branding change in one place.
- **Typography with a voice:** one readable text family plus, if it adds character, one display face for headings and highlights (e.g. a bookish serif with a rounded sans). Self-host fonts (no third-party font CDN: privacy and CSP). A clear scale, at most two weights per view.
- **Content is the visual.** Show the real thing big (book covers, names, the scanned item) instead of decoration. When content is missing, generate a pleasant placeholder in the same visual language (e.g. a cloth-style cover with the title, same title → same colour) so nothing ever looks broken or empty.
- **Identity of the customer, not ours.** Let the organisation add its name and logo (header, browser tab icon, printed material); the product stays recognisably calm around it.

**Craft**

- Spacing on a 4 px grid, generous whitespace, one content width per page type; align everything to it.
- Rounded corners, borders and shadows used consistently and sparingly (one radius family, hairline borders in `line`, shadow only for things that float).
- One icon set (e.g. Lucide), icons always next to text or with `aria-label`.
- Light and dark mode from the same tokens; check both, and check that print ignores dark mode (white paper, black text).
- Numbers are formatted with `Intl` in the user's language (`1,7`, not `1.7` in Dutch); charts are simple bars with the value written on them, so nothing depends on reading a height or a colour.
- Copy is part of the design: short, warm, in the user's language ("Nothing overdue. Well done!"), and it tells people what to do next.

**Per context**

- **Desk / fast workflows**: one big focused input, large unmistakable feedback (colour + icon + text + optional sound), the last few actions visible, nothing to click between items.
- **Shared or public screens (kiosk)**: full screen without the app's menus, huge type and targets, show the minimum personal data (first name only), clear themselves after a short time.
- **Phones**: every page works at 390 px; wide tables scroll inside their own container, never the page.

**Verify like a designer**

- Screenshot every changed page (desktop, phone, dark mode) with Playwright and actually look at the images before calling it done; fix what looks off (overlaps, wrapping, alignment, empty corners).
- Generate the real PDFs and render them at high resolution to inspect small text; test with awkward real data (long titles, accents, missing covers, no class).

## Printed material (PDFs, labels, cards, tickets)

Print is part of the product: people hold it in their hands, so it gets the same care as screens.

- **Generate in the browser** (jsPDF, loaded on demand) in millimetres; no server, no cost. For a quick slip (e.g. a loan ticket) use the browser's own print with a print-only element instead of a PDF.
- **Design for the physical object**: exact sheet layouts for standard label sheets, credit-card size for cards, 72 mm width for tickets (fits receipt printers, prints at the top of A4 elsewhere). Remember people print "fit to page" by mistake: tell them to print at actual size.
- **Browsers leave out background colours when printing** (the default setting): charts drawn with backgrounds come out empty. Give them `print-color-adjust: exact`, print white paper behind them, and test printing with backgrounds switched off. On paper, write the value on every bar (a blank reads as missing) but leave future periods empty.
- **Barcodes stay scannable**: black on white, quiet zones, enough height; never shrink the barcode to make room for decoration.
- **Make cutting and handling easy**: crop marks in the margin instead of outlines on the item; leave changing data (like a class) off things that should last.
- **Built-in PDF fonts only cover Western European characters**: normalise text to NFC and replace or drop what they can't show, or a single odd character spreads a whole line apart.
- Include the organisation's name (and logo where it fits) so a lost item finds its way back.

## Accessibility (WCAG 2.2 AA)

- Semantic elements first (`button`, `nav`, `main`, `table`, `label`).
- Visible focus ring on everything focusable; logical tab order; skip-to-content link.
- Contrast ≥ 4.5:1 for text; don't rely on color alone (add icons/text).
- Announce async results with `aria-live` (e.g. scan result on the desk screen).
- Run axe in Playwright tests on key pages.

## i18n

- All user-visible text goes through `t('feature.key')`. Keys and code are in English; the default and other languages are named in the project's `CLAUDE.md`.
- Use plural support for counts; format dates and numbers with `Intl` using the active locale and the configured time zone.
- Emails, PDFs and printed material are translated too.
- Never concatenate translated fragments; use interpolation.
