# Command menu (Cmd/Ctrl+K) — research for slice P

Fetched 2026-10-17. Purpose: give every part of Granite's command menu a published source, so we
make no taste-based decisions. Docs pages were read live with a scraper; library behaviour was read
from the libraries' own source on GitHub (cloned 2026-10-17). Quotes are verbatim. Anything not read
live is marked **unverified**.

Copy only hierarchy and interactions. Never copy names, wording, icons, colours or logos.

---

## 1. GitHub Command Palette (best-documented reference)

Source URL: https://docs.github.com/en/get-started/accessibility/github-command-palette (scraped
2026-10-17). The page notes: "The GitHub Command Palette is currently in public preview and is
subject to change." and "is deactivated by default".

### Opening and closing
- "Windows and Linux: `Ctrl` + `K` or `Ctrl` + `Alt` + `K`" / "Mac: `Command` + `K` or `Command` +
  `Option` + `K`".
- "If you are editing Markdown text, open the command palette with `Ctrl` + `Alt` + `K` … or
  `Command` + `Option` + `K`" (the plain shortcut is taken by the text editor there).
- Command mode directly: "`Ctrl` + `Shift` + `K` (Windows and Linux) or `Command` + `Shift` + `K`
  (Mac)". "If you already have the command palette open, press `>` to switch to command mode."
- Closing: "Search and navigation mode: `Esc` or `Ctrl` + `K` … Command mode: `Esc` or `Ctrl` +
  `Shift` + `K`" — the open shortcut toggles it closed.
- Shortcuts are customisable in Accessibility settings, because "The default keyboard shortcuts …
  may conflict with your default OS and browser keyboard shortcuts."

### Default content (nothing typed)
- "The command palette is an on-demand way to show suggestions based on your current context and
  resources you've used recently."
- "When you open the command palette, the suggestions are optimized to give you easy access from
  anywhere … to top-level pages like the Issues page. If the location you want isn't listed, start
  entering the name or number for the location to refine the suggestions."

### Scope
- "When you open the command palette, it shows your location at the top left and uses it as the
  scope for suggestions".
- "To narrow the scope … highlight a repository then use `Tab` to add it to the scope."
- "To expand the scope, highlight and remove an item in the scope using the `Backspace` or `delete`
  key."
- "To clear the scope and text box, click **Clear** or use `Ctrl` + `Backspace` (Windows and Linux)
  or `Command` + `Delete` (Mac)."

### Prefixes (keystroke functions, "not available in command mode")
| Keystroke | Function (verbatim) |
| --- | --- |
| `>` | Enter command mode. |
| `#` | Search for issues, pull requests, discussions, and projects. |
| `@` | Search for users, organizations, and repositories. |
| `/` | Search for files within a repository scope or repositories within an organization scope. |
| `!` | Search just for projects. |
| `Ctrl`/`Command` + `C` | Copy the search or navigation URL for the highlighted result to the clipboard. |
| `Enter` | Jump to the highlighted result or run the highlighted command. |
| `Ctrl`/`Command` + `Enter` | Open the highlighted search or navigation result in a new browser tab. |
| `?` | Display help within the command palette. |

### Navigation vs commands
- Navigation: "Start typing the path you want to navigate to. The suggestions in the command palette
  change to match your text." / "use the arrow keys to highlight the path you want" / "Use `Enter`
  to jump to your chosen location."
- Commands: "you can create a new repository or issue, or change your theme. When you run a command,
  the location for its action is determined by either the underlying page or the scope shown in the
  command palette." "Pull request and issue commands always run on the underlying page." "Higher-level
  commands … run in the scope shown in the command palette."
- "GitHub suggests commands based on your location." Commands are grouped in the reference as
  Global, Organization, Repository, File, Discussion, Issue, Pull request — i.e. **global commands
  everywhere, record commands only when opened from that record**.
- Command naming pattern: verb first ("New …", "Switch theme to <theme name>", "Copy permalink",
  "Close/reopen issue"); a trailing ellipsis marks commands that open a further step ("Delete
  issue...", "Transfer issue...").
- Full syntax: "You can also use the full syntax of GitHub's integrated search within the command
  palette."

### Not documented
Empty-result text, item layout (title + secondary text), footer hints, ARIA roles — **unverified**
from this page (screenshots only).

---

## 2. Linear command menu

Source URLs (scraped 2026-10-17):
- https://linear.app/docs/search
- https://linear.app/docs/select-issues
- Search-engine excerpts only (pages not opened): https://linear.app/docs/editor,
  https://linear.app/docs/members-roles, https://linear.app/docs/exporting-data,
  https://linear.app/docs/creating-issues, https://linear.app/docs/sub-initiatives.
- https://linear.app/docs/peek returned 404 on scrape (a search excerpt said: "When navigating the
  command menu, peek automatically previews supported items as you move between them." —
  **unverified**, page gone).
- No dedicated "Command menu" docs page or keyboard-shortcuts docs page was found — **unverified**.

Rules quoted:
- Opening: "open the command menu (Cmd/Ctrl K)" (editor excerpt); "Open Command menu `Cmd/Ctrl` `K`
  and select **View workspace admins**" (members-roles excerpt).
- Contextual actions: "Once an issue or set of issues are selected, use `Cmd/Ctrl` `K` to open the
  command bar and select the preferred action" (select-issues). Commands found by typing their name:
  "Use `Cmd/Ctrl K` and search for **Issue description history**" (creating-issues excerpt);
  "opening the command menu and selecting **Export customer requests as CSV…**" (exporting-data
  excerpt).
- Type filters inside the command menu (search page): "Type `i` followed by space to focus your
  command menu on issue results" / "Additionally, you can type `p` followed by space for projects,
  `u` for users, `t` for team, `l` for labels, `f` for favorites and `d` for documents."
- Separate quick search on `/`: "When you open the search menu, you’ll be shown recent searches as
  well as a list of recent issues for easy access." "You can search by ID exactly e.g. `LIN-123` or
  shorthand e.g. `lin123`. The search term will be highlighted if it’s in the title." Ordering: "We
  sort search results in what we assume is the most relevant order, showing unstarted and in progress
  issues first, then backlog, completed, canceled, and archived issues."
- Favorites "searching for them in the command menu" (favorites excerpt).

---

## 3. Vercel command menu

Source URLs:
- https://vercel.com/changelog/quickly-navigate-the-dashboard-with-shortcuts (scraped): "The ⌘K
  shortcut on your keyboard now lets you navigate straight to a particular area of the dashboard and
  take important actions without using the dashboard menu." It lets you: "**Navigate** to a specific
  Project, or even Deployments within that Project"; "**Search the documentation**"; "**Invite
  others**"; "**Create new Projects**".
- The changelog's docs link https://vercel.com/docs/personal-accounts/command-menu now redirects to
  a 404 — current docs **unverified**.
- https://vercel.com/changelog/command-menu-now-available-in-deployments (search excerpt only):
  "You can now use `⌘K` (or `Ctrl+K` on Windows) to open the Command Menu on any deployment where the
  Vercel Toolbar is enabled".
- cmdk README history: "Used for the Vercel command menu and autocomplete … in 2020." (so Vercel's
  menu is built on the same library we would use).

---

## 4. Stripe Dashboard search and shortcuts

Source URLs (scraped 2026-10-17):
- https://docs.stripe.com/dashboard/search
- https://docs.stripe.com/dashboard/basics

Rules quoted:
- Scope of search: "Use Dashboard’s search to find important resources, and navigate across
  different Stripe resources, like connected accounts, customers, invoices, payouts, and products."
- Results: "When you perform a search, the top results appear immediately. View all of the matches
  by clicking **View all results** or pressing **Enter**. From the resulting groups of search
  results, click **View all** to see an expanded display with column headings".
- Searchable inputs: last four digits, payment method type, business name, receipt number; dates in
  several formats "like **08/22**, **2020-07-12**, or **last week**". "Use object identifiers … to
  take you directly to the object you’re looking for."
- Filters: "Preface a search term with one of these filters" (e.g. `amount:`, `email:`, `name:`,
  `number:`, `status:`, `created:`/`date:`); quotes for spaces; "negate any search filter with a
  hyphen (`-`)".
- "As search terms are included in the URL, you can bookmark the search or share it".
- Shortcuts: "On your keyboard, press the question mark key (`?`) for a list of available keyboard
  shortcuts for common actions." The shortcut list itself is behind sign-in — **unverified**
  (including the key that focuses search).
- Recent items: "Use the **Shortcuts** section to display your pinned and most recently visited
  pages. After you visit a page, it appears under this section, where you can pin it." (sidebar, not
  the search menu).

---

## 5. cmdk library (the engine behind shadcn Command)

Source: https://github.com/pacocoursey/cmdk (README + `cmdk/src/index.tsx`, commit `dd2250ed`,
2025-10-28); npm `cmdk` latest **1.1.1**. Note: the shadcn docs now link `https://github.com/dip/cmdk`
and credit "Dip" — repository move/rename **unverified** (github.com returned 403 to direct checks);
npm still lists `pacocoursey/cmdk`. `cmdk` is not yet in Granite's `package.json`.

### Structure (README)
`Command` (root) → `Command.Input` → `Command.List` → `Command.Empty`, `Command.Loading`,
`Command.Group heading=…` → `Command.Item`, `Command.Separator`. `Command.Dialog` "Composes Radix
UI's Dialog component."

### Filtering and grouping
- "You render items, it filters and sorts them automatically."
- Item value: "You should provide a unique `value` for each item, but it will be automatically
  inferred from the `.textContent`." `keywords` "act as aliases for the item value, and can also
  affect the rank".
- Ranking uses `command-score`: continuous matches score highest; "A new match at the start of a word
  scores better than a new match elsewhere"; transpositions penalised.
- Source `sort()`: "Sorts items by score, and groups by highest item score." Non-grouped items are
  pushed above groups. The first item is selected automatically after each filter.
- "Groups will not unmount from the DOM, rather the `hidden` attribute is applied".
- Separator: "Visible when the search query is empty or `alwaysRender` is true, hidden otherwise."
- `shouldFilter={false}` to filter yourself (needed for server-side record search); "Good performance
  up to 2,000-3,000 items"; no virtualisation.
- Empty: "Automatically renders when there are no results for the search query." README example:
  "No results found." and, with the query, `No results found for "{search}".`
- Loading: `Command.Loading` for async items (renders `role="progressbar"`).

### Keyboard (source `index.tsx`)
- ArrowDown / ArrowUp: next / previous item; with Meta (Cmd): last / first item; with Alt: next /
  previous **group**.
- Home / End: first / last item. Enter: runs the selected item's `onSelect`.
- Ctrl+N / Ctrl+J and Ctrl+P / Ctrl+K: down / up (`vimBindings`, default `true`).
- `loop` prop: arrows wrap around (default off).
- IME composition is ignored (`isComposing`) so key binds don't fire mid-composition.
- Opening is **not** built in: "**Listen for ⌘K automatically?** No, do it yourself". README pattern:
  `if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen(open => !open) }`.

### Nested pages / scopes (README "Nested items")
"Often selecting one item should navigate deeper … We call these sets of items "pages"". The
example's keydown: "Escape goes to previous page" / "Backspace goes to previous page when search is
empty".

### Accessibility (source)
- Hidden `<label>` linked to the input; root `label` prop.
- Input: `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded={true}`, `aria-controls` =
  list id, `aria-activedescendant` = selected item id.
- List: `role="listbox"` with `aria-label`. Group: wrapper `role="presentation"`, heading
  `aria-hidden`, items container `role="group"` `aria-labelledby` the heading. Item: `role="option"`,
  `aria-selected`, `aria-disabled`. Separator `role="separator"`. Empty `role="presentation"`.
- FAQ: "Labeling, aria attributes, and DOM ordering tested with Voice Over and Chrome DevTools."

---

## 6. shadcn/ui Command (Base UI flavour — our base)

Source: https://github.com/shadcn-ui/ui (commit `d2fba50e`, 2026-10-16):
`apps/v4/content/docs/components/base/command.mdx` (docs source for
https://ui.shadcn.com/docs/components/command, base variant), `apps/v4/registry/bases/base/ui/command.tsx`,
`apps/v4/examples/base/command-dialog.tsx`. Live site not scraped (rate limit) — content above is the
repo source of the page.

- Description: "Command menu for search and quick actions." Built on `cmdk`.
- Composition (verbatim tree): `Command` → `CommandInput`, `CommandList` → `CommandEmpty`,
  `CommandGroup` → `CommandItem`…, `CommandSeparator`, `CommandGroup` → `CommandItem`….
- Exports: `Command`, `CommandDialog`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`,
  `CommandItem`, `CommandShortcut`, `CommandSeparator`.
- `CommandDialog` (base): wraps our Base UI `Dialog`; screen-reader-only `DialogTitle` (default
  "Command Palette") and `DialogDescription` (default "Search for a command to run..."); content
  positioned `top-1/3`, no padding, `showCloseButton` default `false`.
- `CommandInput`: input inside an `InputGroup` with a search icon addon.
- `CommandItem`: icon slot (any leading svg), label, optional `CommandShortcut` at the right; a check
  indicator appears for `data-checked` items and is hidden when the item has a shortcut; disabled
  items get `pointer-events-none` and reduced opacity.
- Demo content: placeholder "Type a command or search...", empty text "No results found.", groups
  "Suggestions" then a separator then "Settings" with shortcuts on the right.
- Demo opening: global `keydown` listener toggling `open` on `metaKey || ctrlKey` + a letter, and a
  visible `<kbd>` hint showing the shortcut on the page.
- Not provided by shadcn: footer key hints, recent items, scopes/pages, async record search — those
  must come from the references above.

---

## 7. Raycast

Not researched beyond cmdk: Raycast is a desktop launcher, and its public manual pages were not
fetched — **unverified**. cmdk's README credits the library's design history to Vercel, not Raycast.

---

## 8. Recommendation — the hierarchy Granite should copy

Each piece names its source. Where no source documents a piece, it says so and needs an owner
decision (no taste-based fill-ins).

### 8.1 How it opens
- `Cmd+K` (Mac) / `Ctrl+K` (Windows/Linux) from anywhere toggles it; pressing it again or `Esc`
  closes it. — GitHub §1 (open + close), cmdk README pattern §5.
- Skip the global shortcut while focus is in a rich-text editor that uses Cmd+K for links. — GitHub
  §1 (Markdown exception), Linear editor excerpt §2.
- A visible trigger button in the header showing the shortcut as a `kbd` hint. — shadcn demo §6
  (shows the shortcut hint on the page); Linear search button in the sidebar §2. Exact placement:
  follow the layout pattern file (owner decision if absent).
- `>` typed into an empty input switches to command mode. Optional dedicated `Cmd/Ctrl+Shift+K`
  for command mode. — GitHub §1.

### 8.2 Structure (top to bottom)
1. **Scope chip(s)** at the left of the input showing where it was opened (e.g. the current client
   record) — GitHub §1 ("shows your location at the top left and uses it as the scope").
2. **Input** with search icon, placeholder text in our own words. — shadcn `CommandInput` §6.
3. **List** of **groups** with headings, separated by separators when the query is empty. — shadcn
   composition §6; cmdk separator rule §5.
4. **Items**: leading icon, title, optional secondary text, keyboard shortcut right-aligned. —
   shadcn `CommandItem` + `CommandShortcut` §6. Secondary text on records: no reference documents
   it in text (GitHub/Linear show it only in screenshots) — **owner decision / unverified**.
5. **Empty** row when nothing matches. — cmdk/shadcn §5–6 ("No results found." pattern, optionally
   echoing the query).
6. **Loading** row while records are fetched. — cmdk `Command.Loading` §5.
7. **Footer key hints**: not documented by any source read (GitHub offers `?` for in-palette help
   instead) — use `?` help, not a footer, unless the owner supplies a reference. — GitHub §1.

### 8.3 What's searchable and how it's grouped
- **No query**: suggestions for the current context first, then recent items, then top-level pages.
  — GitHub §1 ("suggestions based on your current context and resources you've used recently";
  "top-level pages"); Linear §2 ("recent searches as well as a list of recent issues").
- **Pages** (Workers, Clients, Job orders, Invoices, Payroll, Settings …): navigation items; Enter
  goes there, `Ctrl/Cmd+Enter` opens a new tab. — GitHub §1.
- **Records** (workers, clients, job orders, invoices by number): found by name or by exact
  identifier (an invoice number jumps straight to it). — GitHub §1 ("start entering the name or
  number"); Stripe §4 ("Use object identifiers … to take you directly"); Linear §2 (search by ID,
  exact or shorthand). Fetch server-side with `shouldFilter={false}` per group. — cmdk §5.
- **Actions** (commands): verb-first names; global actions everywhere, record actions only when the
  menu is opened from that record (they act on the underlying page); a trailing "…" for actions that
  open a further step. — GitHub §1 reference tables; Linear §2 (contextual actions on selection).
- **Type prefixes** to narrow to one kind: GitHub uses symbols (`#`, `@`, `/`, `!`), Linear uses a
  letter + space (`i `, `p `, `u `). Pick one convention — GitHub is the better documented (full
  table, verbatim). Mapping symbols to Granite record types is an owner decision.
- **"View all results"**: Enter on a free-text query with no highlighted item, or a final "View all
  results" item, goes to a full results page with grouped sections and column headings. — Stripe §4.
- No SSN or date-of-birth search, ever (CLAUDE.md data safety) — not from a reference; a hard rule.

### 8.4 Keyboard
| Key | Behaviour | Source |
| --- | --- | --- |
| `Cmd/Ctrl+K` | open / close | GitHub §1, cmdk §5 |
| `↑` `↓` | move highlight | GitHub §1, cmdk §5 |
| `Cmd+↑` / `Cmd+↓`, `Home` / `End` | first / last item | cmdk §5 |
| `Alt+↑` / `Alt+↓` | previous / next group | cmdk §5 |
| `Ctrl+N`/`Ctrl+P` (`Ctrl+J`/`Ctrl+K`) | down / up | cmdk §5 (`vimBindings`) |
| `Enter` | go to / run highlighted | GitHub §1, cmdk §5 |
| `Cmd/Ctrl+Enter` | open in new tab | GitHub §1 |
| `Tab` | add highlighted record to scope | GitHub §1 |
| `Backspace` on empty input | remove last scope / leave nested page | GitHub §1, cmdk §5 |
| `Ctrl+Backspace` / `Cmd+Delete` | clear scope and text | GitHub §1 |
| `Esc` | leave nested page, else close | cmdk §5 ("Escape goes to previous page"), GitHub §1 |
| `>` | command mode | GitHub §1 |
| `?` | help inside the menu | GitHub §1 |
| `Cmd/Ctrl+C` | copy link of highlighted result | GitHub §1 |
Arrow wrap-around: cmdk default is off (`loop` false) — keep the default.

### 8.5 How records are shown
- Title = the record's name or number, with the matched text highlighted. — Linear §2 ("The search
  term will be highlighted if it’s in the title").
- Ordering within a group: active before finished/archived. — Linear §2 (unstarted/in progress
  first, archived last). Across groups: cmdk ranks groups by their best item §5.
- Secondary text (e.g. client name, status, week): **unverified** in any text source; needs an owner
  decision or a further reference before building.

### 8.6 Accessibility
Use cmdk's roles unchanged: input `combobox` (`aria-autocomplete="list"`, `aria-controls`,
`aria-activedescendant`), list `listbox`, groups `group` labelled by their heading, items `option`
with `aria-selected`; hidden label; dialog with a screen-reader-only title and description
(shadcn `CommandDialog`). — cmdk §5, shadcn §6. When async results arrive, announce the count in an
always-present `role="status"` element ("No items match …" / "5 items match …"). — Primer loading
pattern, "Filter results" (see `docs/research/states-slice-o.md` §3.2).
