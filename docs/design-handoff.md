# Daftari la Duka — redesign handoff ("Tikiti")

Direction 1c: palette **Msitu** (deep green + marigold on warm paper), basket as a **bottom ticket tray** with ✓ Maliza at thumb height.

## Files

| File | What |
|---|---|
| `handoff/styles.css` | Complete replacement for `styles.css`. Tokens in `:root`, dark set under `prefers-color-scheme: dark`. System fonts only. |
| `handoff/index.html`, `handoff/app.js` | Drop-in replacements with all 5 markup changes below already applied. |
| `01 Kuingia.dc.html` | 7.1 Setup, 7.2 Login + recovery |
| `02 Uza na Malipo.dc.html` | 7.3 Uza, user menu, 7.4 Maliza (4 states), 7.5 Deni pickers, 7.6 Nyingine, toasts, 412 × 915 check |
| `03 Stoo na Madeni.dc.html` | 7.7 Stoo + all stock sheets, 7.11 owner PIN, 7.8 Madeni + customer sheet |
| `04 Ripoti na Mipangilio.dc.html` | 7.9 Ripoti (owner, helper, drawer states, sales list), 7.10 Mipangilio + all sheets, 7.12 confirms |
| `05 Mfumo na Vipengele.dc.html` | Tokens, type, spacing, radius, component sheet, dark mode |

Artboards use `mock/app.css`, which is generated from `handoff/styles.css` (same rules, scoped to `.ap`), so what you see is what ships.

## How it fits the code

- Every selector targets markup app.js already renders. No class, ID or data attribute is renamed.
- `app.js` inline styles use `var(--ok)`, `var(--danger)` etc. These names are kept as aliases of the new `--color-*` tokens.
- Done in CSS only, no markup change:
  - The basket tray and ✓ Maliza: `.bchips` and `.barbtn` are `position: fixed` above `#tabs`; `.custbar::after` paints the tray's right end; `#app:has(.custbar)` adds bottom padding.
  - "TSh" before the running total (`.total::before`) and before the Nyingine amount.
  - Sheet drag handle (`#sheet::before`) and sticky `.btnrow`.
  - Status pills get a symbol (✓ / ! / ↑) so colour is never the only signal.
  - Payment buttons are colour-coded by `[data-pay]`. A confirm sheet's `.btn.danger` is filled red, except `#del` (Futa in the editor and customer sheet stays outlined).
  - Customer balance in `openCustomer` is bumped to 32px via `#sheet h2 + p > b[style]` (overrides the inline 22px).
  - Toast sits above the tray on Uza, and at the top when a sheet is open.

## Markup changes (all applied in handoff/index.html + handoff/app.js)

1. **index.html, `#tabs`**: replace the emoji inside each `span.ico` with the SVG below (same `button[data-tab]`, same label text).
2. **index.html, `<head>`**: `theme-color` → `#17603f`. Optional dark: add `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#164a32">`.
3. **renderSetup / renderLogin, `.logo`**: replace `📒` with `<img src="icons/icon.svg" alt="">`. The 🔑 logos (recovery screens) stay as they are.
4. **Setup step indicator** (adds new copy "Hatua X kati ya 3", please confirm wording):
   - renderSetup: first child of `.auth` → `<div class="step" data-step="1">Hatua 1 kati ya 3</div>`
   - choosePin, when called from setup only: before `<div id="pp">` → `<div class="step" data-step="2">Hatua 2 kati ya 3</div>` (e.g. an optional 5th argument `step`)
   - recovery-code screen in renderSetup: first child of `.auth` → `<div class="step" data-step="3">Hatua 3 kati ya 3</div>`
5. **updateBar, total pulse** (optional): after `$('#btotal').textContent = …`, add
   `const t = $('#btotal'); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash');`
   CSS for `.total.flash` is already in styles.css.

## Bottom bar and tab transition (option 2a, Kidonge)

- CSS only for the bar: `#tabs::before` is a green pill that slides to the `.on` tab (280 ms, transform only). Position comes from `#tabs:has([data-tab=…].on)`; browsers without `:has` fall back to a static pill behind the active icon.
- `paint()` in handoff/app.js now adds `.tabin` and `--dir` to `#view` on a tab change, so the new screen slides 16 px in from the side you moved to (220 ms). In-tab re-renders don't animate. The Uza header stays still because the tray inside it is `position: fixed`.
- Bar height is 68 px (`--nav-h`). Everything is off under `prefers-reduced-motion`.

## Type weight

Bold is reserved for a few things so pages read lighter: **800** running total, Jumla ya mauzo, customer balance · **700** page/sheet titles, PIN title, ✓ Maliza, payment buttons, change due · **600** prices, list amounts, buttons, h2, pills · **500** item names, labels · **400** body and secondary text. Inline `<b>` in copy is 600.

## Icons (Lucide-style, 24 × 24, stroke via CSS)

Put each inside `span.ico`. styles.css sets `fill:none; stroke:currentColor; stroke-width:2`.

- **Uza** (cart): `<svg viewBox="0 0 24 24"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`
- **Stoo** (package): `<svg viewBox="0 0 24 24"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.7 4.73a2 2 0 0 0 2 0L20.7 7"/><path d="m7.5 4.27 9 5.15"/></svg>`
- **Madeni** (notebook): `<svg viewBox="0 0 24 24"><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M16 2v20"/></svg>`
- **Ripoti** (bar chart): `<svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>`
- **Mipangilio** (sliders): `<svg viewBox="0 0 24 24"><path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/></svg>`

Emoji stay where they help recognition and are part of app.js copy (💵 📱 📒 ⭐ 🔒 🔑 📤 ⚠️ ✅ ℹ️).

## State classes → visuals

`.on` filled chip/tab pill/tinted user tile · `.low` red + dot · `.flash` green pulse ring · `.shake` horizontal shake + red dots while `.pinerr` has text · `.kg` marigold card, amber-edged portions · `.other` dashed tile · `.ok/.gap/.over` green/red/amber + symbol · `.primary/.danger/.warn/.block/.sm` buttons · `[disabled]` dimmed Maliza stays in the tray · `body.locked` hides tabs · `#sheet[hidden]`/`#toast[hidden]` display:none.

## Suggestions (not built, need logic)

- Search field in the customer picker and Madeni when the list is long; "Karibu kuisha" filter on Stoo.
- Small hourly sales bar chart on Ripoti.
- "Mkumbushe kwa WhatsApp" on the customer sheet.
- "+ Bidhaa" button in the Uza empty state for the owner.
- 🔒 badge on the Mipangilio tab for helpers (needs a `body.helper` class).
- Show "PIN hazikulingana — anza tena" in `.pinerr` (red) instead of `.pinsub`.

## Notes

- Uza ⭐ Maarufu fits 4 portion cards + 4 tiles + Nyingine on 360 × 800 with the tray visible. Other screens use more generous spacing (16–20 px page padding, 60 px rows, 28 px section gaps).
- Contrast: body ink on paper ≈ 16:1, secondary ink ≈ 8:1, white on brand ≈ 7.4:1, danger on white ≈ 6.4:1, warn text ≈ 5.9:1.
