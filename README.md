# Daftari la Duka

A tap-to-sell app for small street shops and kiosks (dukas) in Tanzania. **One tap = one sale.**
Each tap records the money and removes the right amount from stock. At the end of the day, the report is ready on its own.

> Prototype: all items and prices in the app are **samples** guessed from shop photos. Change them under ⚙️ Mipangilio.

## Why it exists

A shopkeeper serving 100+ mostly cash customers a day, alone, can't write every sale in a notebook, and can't count stock and cash every night either. Daftari keeps the recording to about one second per sale and does all the calculations itself.

## What it does

| Screen | What it's for |
|---|---|
| **Uza** (Sell) | Big buttons. Items sold by weight (rice, sugar, flour) have **¼, ½, 1 kg** buttons, each with its own price. Other items have one button, or several (e.g. egg / tray). The green bar shows the current customer's running total and clears itself after a few seconds with no taps. **↶ Rudisha** undoes the last tap. **Deni** puts the current customer's items on credit. **Nyingine** records a sale of an item not on the list (money only). |
| **Stoo** (Stock) | **+ Mzigo**: record stock you bought (quantity + amount paid, which gives the buying price). **Imeisha**: press when a sack/box is empty. The app compares it with the tapped sales and shows any gap. **Matumizi**: used at home or spoiled, so it doesn't show up as a gap. |
| **Madeni** (Credit) | Who owes what, with history. **Amelipa** records a payment. |
| **Ripoti** (Report) | Sales for the day (cash / credit), estimated profit, cash expected in the drawer, sales per item, items running low, gaps found, and a **Send via WhatsApp** button. You can go back to earlier days. |
| **Mipangilio** (Settings) | Add / edit items, buttons and prices; change the order; save/restore a backup. |

## How the calculations work

- **Stock** is kept in kg or pieces. Tapping "Sukari ½" removes 0.5 kg.
- **Profit** = selling price − (buying price per kg/piece × quantity). The buying price is updated on every **+ Mzigo**.
- **Drawer** = cash sales + credit payments received that day.
- **Imeisha check**: whatever stock the app still shows when a sack is empty was not tapped. Up to 5% difference on kg items is treated as normal (weighing/spillage).
- **↶ Rudisha** doesn't erase the record: undone sales are counted and shown in the report, so the owner can see if many sales are being undone.

## Technology

- Plain HTML + CSS + JavaScript. **No build step, no server, no dependencies.**
- Data is kept on the phone (`localStorage`), so it works **without internet** (service worker `sw.js`).
- The screen stays awake while the app is open (Wake Lock).
- Files: `index.html`, `styles.css`, `app.js` (all the logic), `sw.js` (offline), `manifest.webmanifest` + `icons/` (install on phone).

## Running it on your computer

```bash
cd daftari
python3 -m http.server 8000
# open http://localhost:8000
```

## Putting it on the phone (GitHub Pages)

1. Push this repo to GitHub.
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save.
3. After a minute or two the link is ready: `https://<username>.github.io/daftari/`
4. Open it in Chrome on the phone → menu ⋮ → **Add to Home screen**. It now opens like an app, even without internet.

**When you update the app:** change `VERSION` in `sw.js` (e.g. `daftari-v2`) so phones pick up the new version.

## Known limitations (prototype)

- Data is on one phone only. If the phone is lost or the browser data is cleared, it's gone. **Save a backup** (Mipangilio → Hifadhi nakala) often.
- No login or sync. The owner and a helper can't see the same data on two phones yet (the WhatsApp report is the stopgap).
- The "Nyingine" button doesn't reduce stock and its profit isn't known.

## Next steps

- [ ] Field test for 2–3 days: compare the day's taps with the cash in the drawer (target: within 10–15%).
- [ ] Replace the samples with the shop's real items and prices.
- [ ] Owner view on a second phone (sync) to watch a helper remotely.
- [ ] SMS/WhatsApp reminder for credit customers.
