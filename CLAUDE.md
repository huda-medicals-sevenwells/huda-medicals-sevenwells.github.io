# Huda Medicals: project guide (any Claude chat: read this first, then TODO.md and CHANGELOG.md)

## How to work in this repo
1. Read this file, then TODO.md (what is pending) and CHANGELOG.md (what changed, newest first). If a zip was uploaded in the chat, its copies may be newer than the repo: use the newer one.
2. Owner: Seyed, a pharmacist (not a developer). Explain in plain language, as to a pharmacist, no developer jargon. Very short replies. State the plan in one line and wait for a go-ahead before acting. No filler, no closing offers. End every reply with only these two lines: `Repo https://github.com/huda-medicals-sevenwells/huda-medicals-sevenwells.github.io` and `Site https://huda-medicals-sevenwells.github.io`. No token or session line.
3. The owner uploads files to the repo root by hand from a phone (same filename overwrites; live in 2-3 minutes). Every index.html you give is the full file with all earlier changes, so uploading only the newest is enough. Deliver only the changed code files each turn.
4. AFTER EVERY CHANGE update the notes in the working copy: TODO.md (move finished work to "Built, check on phone"; delete items the owner has confirmed), CHANGELOG.md (new entry at the top of the current month), CLAUDE.md (only if a rule, key name or how-it-works detail changed). Hand over the three .md files, together with the code, at the end of a work session, when the owner asks, or when a new chat is needed (chat limits). If this chat can write to the repo (GitHub connector), ask once before committing the notes there.
5. Before shipping: check HTML tag balance and JS syntax (`node --check`), run jsdom tests with fetch, geolocation and localStorage mocks, check contrast. Claude's sandbox is temporary: keep work scripted and reproducible. Never name a global variable `history` (it hides window.history and breaks Back).

## What this is
Static website for Huda Medicals pharmacy, Seven Wells, George Town, Chennai. GitHub Pages, repo `huda-medicals-sevenwells.github.io`. Customers scan a QR code. No server: everything runs in the browser. Strategy (Oct 2026): WhatsApp-first. Customers search, then a prefilled WhatsApp message goes to the shop (WHATSAPP_NUMBER 919962269992; shop phone 9962 269 992). Photos and prescriptions are attached inside WhatsApp. No server uploads or dashboards for now. The owner has ONE pharmacy.

## Files (repo root)
- index.html = the request page (the QR code and the installed app open this). About 205 KB, all HTML, CSS and JS in one file. Main work happens here.
- home.html = the old landing page (profile card, Contact and More lists, About, English/Tamil toggle, Install App button). request.html = a tiny redirect to the root so old links work.
- shop-products.json = curated shop list (id, name, cat, ref = exact catalog name, freq = true for Frequently bought). Price, composition and maker come from reference-catalog.json through ref (wrong ref = no price). 25 products, 24 photos in images/shop/<id>.jpg or .png.
- reference-catalog.json = search data, about 41,000 items, 3.4 MB (not in the chat zip; it is in the repo). Schema: n name, m manufacturer, p MRP (0 or missing = unknown), u pack/unit, c composition, f form, g group, s "F" = from the 2026 formulary, r = 1 prescription (Rx). The r flag is NOT in the data yet (needs the Wondersoft schedule export), so no item shows Rx yet.
- products.html (confirmed-stock catalog, sample data, NOT linked), pharmacy-network.html (ON HOLD, never link), sw.js (passthrough service worker, caches nothing), manifest.json, icons, og-image.png, logo-mark.png, huda-medicals.vcf.
- Tools (private inputs): formulary_pipeline.py, wondersoft_match.py, merge_duplicates.py.

## Rules that must not be broken
- Never show purchase/cost prices. Only MRP, labelled "reference price, not a confirmed quote".
- Show composition only when confident (EXACT DATASET MATCH, AI-VERIFIED, AI-MATCHED); never for strength-conflict or ambiguous rows.
- The request page means "we will check availability". Never imply stock.
- Prescription items carry an Rx mark; a valid prescription is shown at pickup or delivery.
- Tamil and Hindi: Claude may DRAFT, but nothing goes live to customers until a native speaker has checked it (see Language below). Medicine names and WhatsApp stay in English.
- All text must pass WCAG AA (4.5:1). Muted grey is #5F7878 on light backgrounds, never #8AA3A3.
- No patient data, raw exports (Wondersoft, other pharmacies' sales) or secrets in this public repo.
- Pharmacy Network stays on hold until the Tamil Nadu Drugs Control Department confirms in writing that supply between retail licensees is permitted. Do not re-enable.
- iPhone cannot one-tap install (Apple does not allow it): show the guide only.
- Every font-size in index.html is written `calc(Npx*var(--ts,1))` so the Text size setting works. New CSS and inline styles must use the same form.
- Messages sent to the shop (WhatsApp text, tracking text, backup text) always stay English. Never read translated DOM text in logic: use i18nEn(el).

## Design tokens
--teal-deep #0B5B5D, --teal #0F8B8D, --teal-bright #108485, --paper #F5FBFA, --ink #0B2323, --red #C1272D, WhatsApp green #19874C. Header gradient --teal-deep to #0D7072. Fonts: Poppins (headings), Inter (body), Noto Sans Tamil. Offers poster colours in the .po-* rules.

## How index.html works (current)
- Header: logo button (left, opens home.html), location label and address line (opens Select Your Location), heart button (opens favPage), cart button with count badge, profile button (openSub('profile')). Open/Closed line: OPEN_H 16, CLOSE_H 24 (TEMPORARY 4 PM to 12 AM, India time; normal hours 6 AM to 11 PM: change both constants, home.html Working Hours and the schema opens/closes when hours change).
- Search bar (input #prodName, own line above the sticky category bar) with mic (startVoice, en-IN speech recognition) and camera (openPhotoChat opens wa.me with a short prefilled line; the customer attaches the photo in WhatsApp). The page opens on Categories (shop cards from shop-products.json; chips All, Digestion, Fever & pain, Cold & cough, Baby care, Skin & first aid, Wellness). Typing or focusing the bar opens the search panel (suggestions, quantity, note, Add to my list); clearing returns to Categories. There are no tabs, no Upload Rx page and no bottom send bar.
- Search: catalog normalised once on load. Ranking: name starts with, name contains, composition contains, all tokens. Typo correction by edit distance plus consonant skeleton. "Same contents, lower price" panel after a pick: up to 3 items with same composition and strength (composition must contain a number), same pack unit, lower price. Rx badge and `[Rx]` in the message when the item is flagged. Catalog loads through catGet(): saved copy in the Cache API (huda-catalog-v1) served at once and refreshed in the background; change CAT_CACHE to v2 if the catalog's shape changes.
- Cart page (cartPage; full screen via openSub/closeSub so phone Back closes it): items with Buy later and Save to list, "Save all to a list", How do you want it? (Home delivery default or Pick up at shop; pickup hides the address and leaves it out of the message), monthly refill tick (#cartRemind), order note (#cartNote), Send via WhatsApp (the only send button), call button, privacy line, Rx note, offer hint from reference prices (OFFER_T1 1000, OFFER_T2 2000). Floating buttons bottom right: Offers pill (poster) and Cart.
- Heart page (favPage): Buy later, Your last order card (Reorder, Where is my order? button), My lists (family lists), refill reminder (REFILL_DAYS 28, amber dot), previous orders, Frequently bought. Edit view for lists is #listEdit.
- My profile (profilePage): name and phone (added to the message), Text size, Language (hidden until enabled), My things rows, Last orders, Call, Share with family, Install App (only when installable), Backup (back up and restore as a WhatsApp-able text), Remove my data.
- Location: saved addresses (typed once, kept only on the phone, max 10) and live position (memory only, added as a map link only while chosen). Asked on open only when no address is saved.
- WhatsApp message (sendRequest): `*Medicine request #DDMM-n*`, numbered `*n. Name*` [Rx] ×qty and `_Note: ..._` (the item's pack field = the customer's own words only; selecting a suggestion must never fill it), then `*Order type:*`, optional `*Refill reminder:*`, `*Name:*`, `*Phone:*`, `*Deliver to (label):*` or `*Location:*`, `_Order note: ..._`. The characters * _ ~ ` are stripped from typed text.
- Install App: index.html links manifest.json and apple-touch-icon.png, registers sw.js; an early script in <head> catches beforeinstallprompt into window.__ip; paintInstall() shows #pfInstall; installTap() prompts or opens the iOS guide overlay #igOv (iosKind: safari, other, inapp).
- Language: I18N = {ta:{English:Tamil}, hi:{English:Hindi}} keyed by the exact English text; I18N_PAT has lines with changing parts. i18nWalk/i18nText/i18nAttrs swap text nodes and placeholder, aria-label, title (originals kept in WeakMaps so switching back works); a MutationObserver (i18nStart) translates new content; tr(msg) is used by toast(); askOK(msg) replaces window.confirm. LANG_SWITCH_ON=false: customers see English only; a phone that opens the site with ?lang=ta or ?lang=hi (saved in huda_lang_v1; ?lang=en clears it) sees that language and the Language choice. Not translated on purpose: the Offers poster, the iPhone install steps, lines with names or numbers.
- Frequent items, lists, Buy later, orders: items are stored as copies; item identity = shop id if it has one, else lower-cased name + pack (itemKey). The order history array is orderHist; lastOrder() takes the items sharing the newest t.

## localStorage keys (all start with huda_; wipeData() removes every huda_ key)
cart_v1, prev_orders_v1 (latest 30 medicines), addresses_v1 (max 10), lists_v1 (max 10 lists, 40 medicines each), later_v1 (max 30), profile_v1, order_note_v1, reqno_v1, textsize_v1, fulfil_v1, lastreq_v1, lang_v1. BK_KEYS (what Backup saves and restores): profile, addresses, lists, later, prev_orders, cart, textsize, fulfil, lastreq, lang. A new key that matters must be added to BK_KEYS. Backup text = `HUDA-BACKUP-1:` + base64 of JSON {v:1, t, d:{key:value}}.

## Data pipeline (private inputs: Wondersoft export, indian_medicine_data.csv, formulary PDF)
1. Wondersoft item master (36,380 rows) matched to a 254K-row Indian medicine dataset on normalised brand AND verified strength (unit-converted). Name-only matching put the wrong strength on 62% of "confident" matches: always verify strength.
2. 2026 formulary PDF: table extraction, repair, spelling fixes, 7,687 items added (excluded: implants, monopoly drugs).
3. merge_duplicates.py folds formulary items into matching Wondersoft records; run it before replacing reference-catalog.json.
4. Refresh: the owner sends a new Wondersoft export every 1-2 weeks; rerun steps 1-3, then replace reference-catalog.json.

## Testing notes
jsdom works for logic; set the user agent with Object.defineProperty on navigator (the constructor option does not do it). MutationObserver callbacks run after the current code, so await a short delay before checking translated text. Preview engine wkhtmltoimage is old: no clamp(), no ES6, ignores accent-color.
