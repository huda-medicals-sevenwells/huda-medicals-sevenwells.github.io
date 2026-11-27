# To do (updated Nov 26, 2026)
Rule: when a chat finishes something, move it to "Built, check on phone"; delete it once the owner has confirmed it works. Newest details are in CHANGELOG.md.

## 1. Waiting on the owner (nothing else can be built until these arrive)
1. Delivery rules: delivery time, charge, minimum order, free-delivery limit, delivery areas. Unlocks a delivery line in the cart before Send.
2. Google sign-in and backup: a Google Cloud OAuth Web client ID. Steps (do on a PC): console.cloud.google.com, new project "Huda Medicals", set up the sign-in screen (app name, owner email, External), create credentials > OAuth client ID > Web application, add the authorized JavaScript origin https://huda-medicals-sevenwells.github.io (no slash at the end), copy the Client ID (ends .apps.googleusercontent.com; not secret) and paste it in chat. Then add "Back up with Google" to My profile (Drive appDataFolder access only) to back up and restore the BK_KEYS data. Until then the WhatsApp backup in My profile is the only backup.
3. Native-speaker corrections for Tamil and Hindi: send Huda-translation-check.docx (173 lines, English / Tamil / Hindi / correction column; rebuild it from the I18N keys in index.html if the file is lost) to a Tamil speaker and a Hindi speaker. Test link: site address + ?lang=ta or ?lang=hi. When corrections arrive: edit I18N in index.html, then set LANG_SWITCH_ON=true so everyone sees the Language choice.
4. Answers for a short FAQ page: payment methods, returns, delivery area. (The header already shows Open now / Closed with hours.)
5. Wondersoft item-master export that includes the drug schedule column (H, H1, X, non-scheduled). Unlocks the Rx mark everywhere.
6. Own actual stock list. Generic alternatives list (brand to generic pairs are the owner's professional call).
7. Tamil text for home.html tiles: Install App, WhatsApp Channel, Rate us on Google; Tamil for Working Hours. (index.html Tamil and Hindi are drafted, see item 3.)
8. Test Install App on a real iPhone and on Android Chrome and report what happens.
9. Written answers from the Tamil Nadu Drugs Control Department: (1) can one retail licensee supply another to fill a prescription, (2) is referring the patient to the pharmacy that has it fine, (3) is a WhatsApp availability group fine, (4) do WhatsApp ordering with prescription photos and home delivery need anything extra (e-pharmacy).
10. Optional: short medicine notes in the owner's own wording; Google Maps shop link for a Rate us on Google row in My profile (home.html already has one).
11. Older: verify licence issue date against the certificate, custom domain, WhatsApp Business catalog.

## 2. Upload, then check on a real phone (everything below is built but NOT live until index.html is uploaded)
Upload index.html (logo-mark.png must already sit next to it; if the logo button shows "HM" the file is missing). Upload home.html too if the Nov 23 profile-list version is not live. Then make one real test order on your own phone (Reorder and the refill line need one saved order). WhatsApp keeps old link previews: test with ?v=2 added to the link.
- Search and camera: search bar with mic and camera; camera opens the Huda WhatsApp chat with a prefilled line; mic message if the browser has no voice search (likely inside WhatsApp's browser); category chips stay visible while typing.
- Heart page: Buy later, last order with Reorder, My lists, refill reminder (28+ days, amber dot), previous orders. Back closes the page.
- Cart: Buy later, Save to list, Save all to a list, order note, call button, privacy line, Rx note, floating Cart and Offers buttons not hiding Add buttons or the last card. Pickup or delivery choice (pickup hides the address and the message gets an Order type line). Monthly refill tick (message gets a Refill reminder line; tick clears after sending). "Where is my order?" on the last order card opens WhatsApp with the request number.
- WhatsApp message: bold title with request number (#DDMM-n), numbered bold medicines with quantity and [Rx], italic notes, Name, Phone, Deliver to. Check bold and italic show correctly.
- Header and profile: logo button opens shop info; profile button opens My profile. Back closes profile, cart, heart, offers and location pages.
- My profile additions (Nov 26): Text size (check nothing is cut off at Extra large: header address, category chips, cart rows, poster, floating buttons); Share with family; Install App row (Android Chrome shows the browser prompt; iPhone Safari shows the 3-step guide; WhatsApp's browser says open Safari; nothing shows once installed); Backup (back up, then restore on a second phone or after clearing); Remove my data.
- Saved catalog copy: open once online, switch on airplane mode, open again; suggestions should still work.
- Open/Closed line and offers: header says "Open now · closes 12 AM" between 4 PM and 12 AM India time, else "Closed · opens 4 PM" (TEMPORARY: when normal hours return set OPEN_H 6, CLOSE_H 23 and fix home.html). Offers poster: 12% up to ₹999, 15% ₹1,000 to ₹1,999, 18% from ₹2,000, generic alternatives up to 50%; cart hint "Add ₹X more to get 15% off". Check % signs, wrapping and the footer.
- Location page: add an address, select it, send and read the message; reload keeps it. Location prompt on open only when no address is saved.
- Speed on slow data (battery saver or 3G): "Loading medicine suggestions..." line, and a Try again message if loading fails.
- Quick add shop photos: 24 of 25 uploaded; check each card's reference price against shop-products.json.
- home.html (Nov 23): rows open, About screen, Back, Tamil toggle, Install App row only when installable.
- Tamil and Hindi (switch is OFF): test links ?lang=ta and ?lang=hi on a phone; check that nothing is cut off with the longer text.
- Link preview: og-image.png must exist in the repo root. noindex was removed from index.html (Nov 25); Google can take days or weeks to list it.

## 3. Ready to build once the data arrives
- Rx stars in search and cart (needs the schedule column); prescription reminder in the cart; decide whether to hide cheaper options for any item the owner does not want substituted.
- Cheaper-generic suggestions by brand (needs the generic list). "You might also like", non-prescription only.
- Delivery time line in the cart (needs delivery rules). FAQ page (needs answers). Back up with Google (needs client ID).
- Real products.html from the owner's stock list, then link it.
- Optional: spot-check about 990 duplicate merges matched on brand alone and about 470 where compositions differ; owner review of about 4,500 flagged compositions (customers never see these).

## 4. Later (decided, not started)
- Hide the repo and GitHub name: host on Cloudflare Pages (free, pages.dev address, private repo works). Steps: free Cloudflare account, connect the repo, pick a project name, test, print new QR codes. Only then make the GitHub repo private (on the free plan that takes the github.io site offline and breaks old QR codes). Confirm the free terms at signup.
- Use the Wondersoft and formulary data in the prescription advisor app (private repo): settle which fields it needs, and whether it loads the public reference-catalog.json or keeps a private copy. Optional one-way link from the advisor page to the QR page.

## 5. On hold
- Pharmacy Network page, pending the regulator answer (item 9 above). If revived: referral-style ("who has this for a patient?"), not stock transfer.
- Server-side photo upload and order dashboard (decided to stay WhatsApp-first; if revisited, settle the e-pharmacy position and DPDP duties first, core obligations from 13 May 2027).
- Skipped because they need a server: pill reminders by push, live order tracking, doctor or lab booking.
