# Daftari la Duka

A tap-to-sell app for small street shops and kiosks (dukas) in Tanzania. **One tap = one sale.**
Each tap records the money and removes the right amount from stock. At the end of the day, the report is ready on its own.

> Prototype: all items and prices in the app are **samples** guessed from shop photos. Change them under ⚙️ Mipangilio.

## Why it exists

A shopkeeper serving 100+ mostly cash customers a day, alone, can't write every sale in a notebook, and can't count stock and cash every night either. Daftari keeps the recording to about one second per sale and does all the calculations itself.

## What it does

| Screen | What it's for |
|---|---|
| **Uza** (Sell) | Big buttons. Items sold by weight (rice, sugar, flour) have **¼, ½, 1 kg** buttons, each with its own price. Other items have one button, or several (e.g. egg / tray). Groups at the top (**⭐ Maarufu**, Zote, Vyakula, Vinywaji…) keep the fast sellers on one screen. The green bar shows the current customer's items; each has an **✕** to take it off if the customer changes their mind. They stay until **✓ Maliza**, which shows the **change** and asks how they paid: **Taslimu / Simu / Deni**. **Nyingine** records a sale of an item not on the list (money only). |
| **Stoo** (Stock) | **+ Mzigo**: record stock you bought (quantity + amount paid, which gives the buying price). **Imeisha**: press when a sack/box is empty. The app compares it with the tapped sales and shows any gap. **Matumizi**: used at home or spoiled, so it doesn't show up as a gap. |
| **Madeni** (Credit) | Who owes what, with history. **Amelipa** records a payment. |
| **Ripoti** (Report) | Sales for the day (cash / credit), estimated profit, cash expected in the drawer, sales per item, items running low, gaps found, and a **Send via WhatsApp** button. You can go back to earlier days. |
| **Mipangilio** (Settings, owner only) | Users (add a helper, change PIN), auto-lock, add / edit items (group, ⭐ favourite), **add many at once by pasting a list**, backup/restore. |

## Accounts and security (on the phone)

- The first time, the owner creates an account: shop name, their name, a **4-digit PIN**, and a **recovery code** (for a forgotten PIN; write it on paper).
- The owner adds **helpers**, each with their own PIN. Helpers can only sell, record credit payments, and see a short report.
- These need the **owner's PIN**: settings, prices, stock in / Imeisha / Matumizi, cancelling a sale, the full report with profit. A helper can call the owner over to enter the PIN on the spot.
- **Every record has a name**: who sold, who removed an item, who changed a price. The **Kumbukumbu** section of the report shows it all.
- The app **locks itself** after a period without use (default 15 minutes), and after 5 wrong PINs you have to wait.
- PINs are stored as a hash, never in plain form.
- **Limitation:** data is only on this phone. Someone who clears the browser data erases everything (which is itself noticeable). Online accounts with sync come next.

### Bulk-adding items (paste format)

```
Name, price, buying price, stock, group
Soda, 1000, 800, 24, Vinywaji
Sukari, kg, 3000, 2650, 50
```
For kg items write `kg` and the price for 1 kg. The ¼, ½ and 1 kg buttons are created automatically.

## How the calculations work

- **Stock** is kept in kg or pieces. Tapping "Sukari ½" removes 0.5 kg.
- **Profit** = selling price − (buying price per kg/piece × quantity). The buying price is updated on every **+ Mzigo**.
- **Drawer** = cash sales + credit payments received that day.
- **Imeisha check**: whatever stock the app still shows when a sack is empty was not tapped. Up to 5% difference on kg items is treated as normal (weighing/spillage).
- **✕ and "Futa" don't erase the record**: removed or cancelled sales stay in the Kumbukumbu with the name of who did it, so the owner can see if many sales are being cancelled.
- **Drawer** = cash sales + credit payments received. Mobile money (Simu) is counted separately.

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
- No online sync yet. The owner and a helper can't see the same data on two phones (the WhatsApp report is the stopgap).
- The "Nyingine" button doesn't reduce stock and its profit isn't known.

## Next steps

- [ ] Field test for 2–3 days: compare the day's taps with the cash in the drawer (target: within 10–15%).
- [ ] Replace the samples with the shop's real items and prices (use bulk add).
- [ ] Online accounts + sync (Supabase/Firebase): an owner view on a second phone to watch a helper remotely.
- [ ] SMS/WhatsApp reminder for credit customers.
