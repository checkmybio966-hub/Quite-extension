# QuietBlock — Anti-adblock helper

Chrome / Chromium-based Edge 120+ ke liye **Manifest V3** extension.

**uBlock ko ON hi rehne do.** QuietBlock adblocker nahi hai. Yeh kuch common
DOM/layout-based “Adblock detected” tests ko mask karne ki koshish karta hai.
Har website par kaam karne ya 100% undetectable rehne ki guarantee **nahi** hai.

## Install — 1 minute

1. `QuietBlock-v1.0.0.zip` ko **extract** karo. ZIP ko seedha install nahi karna.
2. Chrome: `chrome://extensions` — Edge: `edge://extensions` kholo.
3. **Developer mode** ON karo.
4. **Load unpacked** click karo.
5. Extracted `quietblock` folder select karo — isi folder mein `manifest.json` hona chahiye.
6. Browser ke Extensions menu se **QuietBlock** pin kar lo.

Folder ko baad mein delete/move mat karna; browser unpacked extension isi se load karta hai.
Work/school-managed browsers unpacked extensions ko block kar sakte hain.
Yeh local, unsigned/unpacked build hai; Chrome Web Store listing nahi hai.

## Use

1. Jis website par warning aa rahi hai, use kholo.
2. QuietBlock icon → **Enable & reload**.
3. Permission pooche toh us website ke liye allow karo. Current tab reload hoga,
   isliye unsaved form ya kaam ho toh pehle save kar lo.
4. uBlock Origin / uBlock Origin Lite ko enabled hi rakho.
5. Popup phir bhi dikhe toh optional **Dismiss adblock popups** ON karke
   **Reload to apply change** click kar sakte ho. Yeh experimental hai aur
   galat panel chhupa sakta hai; zaroorat na ho toh OFF hi rakho.

Site access exact **hostname** ke liye hai: `example.com` aur `www.example.com`
alag entries hain. Us hostname par HTTP + HTTPS, sab paths/ports cover hote hain.
Dusri sites par helper default OFF hai; all-sites access automatically nahi leta.
Enabled hostname ki koi tab pehle se khuli ho toh usse bhi reload karna hoga.

## Band / remove kaise karein

- Current site: QuietBlock → **Turn off & reload**.
- Saved sites: **Site settings** → **Remove** ya **Remove all**.
- Purana injected JavaScript clear karne ke liye affected tabs **reload** karo.
- Page kharab lage aur popup na khule toh browser Extensions page se QuietBlock
  disable/remove karo, phir page reload karo. uBlock ko band karna zaroori nahi.

## Kya karta hai

- Page ke start par, top-level document mein narrow DOM hooks lagata hai.
- Known test names (`adsbox`, `text-ad`, `pub_300x250`, etc.) wale chhote,
  almost-empty bait elements ke zero dimensions / null offset parent ko mask karta hai.
- Unhi elements ke computed display/visibility aur bounding rectangle readings
  ko normal-looking values de sakta hai.
- Optional cleanup explicit adblock text wale short modal-like popups ko hide
  karne ki koshish karta hai. Yeh detection ko pass karwana **nahi** hai.
- **Green blinking dot** top-right corner mein dikhta hai jab site ON hai —
  clear signal ki helper is page par active hai (blink heartbeats; koi data
  bheja nahi jaata).
- **Long-press image save**: kisi bhi image par 0.7 second press-and-hold karo
  (ya right-click → *Save image with QuietBlock*) — image seedha browser ki
  Downloads mein save hoti hai. Chrome Desktop + Edge Desktop par kaam karta
  hai. Koi server shamil nahi; sirf wahi image download hoti hai jo aapne
  press ki. Bas hostname enabled hona chahiye.

## Honest note: “fake links” / real download button

File-hosting sites (jaisi `torupload.com`, `upfiles.com`) par asli download
button ke saath fake/ad buttons bhi dikhte hain. Yeh aksar ad networks ke
responses hote hain jinhe **uBlock Origin ki ad filter lists** (Default +
Annoyances) block karti hain — QuietBlock unhe “recognise kar ke remove”
**nahi** kar sakta, kyunki har site ke fake vs real button ka pattern server
side se badalta hai aur extension usse reliably alag nahi kar paata. Ek
extension jo “har fake link auto-hata deta hai” ka claim karta hai woh
**overpromise** hai — main aisaa claim nahi karta.

Tum kya kar sakte ho: uBlock ON rakho, filter lists update rakho, popup
cleanup wala toggle aur niche diye site-note dekho. Download button dhoondne
ke liye hamesha page ke text/form ke andar wala main button chuno; ad wale
buttons usually “Download” jaise bade labels ke saath alag overlay/neche hote
hain.

## Site-specific notes (checked by me on 2026-09-08)

- `upfiles.com`: download pages par adblock-detect → download block hona
  confirmed issue hai (AdGuard reports #83747). Aaj maine `upfiles.com/jM8ys`
  live fetch kiya — ab 404 ("file expired"), isliye actual detection page par
  test nahi ho paaya. Home page par abhi koi adblock-block nahi mila.
- `d.torupload.com` / `torupload.com/file/...`: popup → adblock page →
  hidden alternate link ka flow confirmed report hai (AdGuard #225758).
  Purana example file expire ho chuki thi (404 "File Not Found"), isliye
  live flow test nahi ho paya.
- **Conclusion (honest):** in dono par jaisa aap chahte ho 100% download
  bypass ho, uska main **live verify nahi** kar paaya kyunki test
  environment mein browser nahi tha aur active file page access nahi hua.
  QuietBlock available features use karo; agar koi current working file link
  do toh main site-specific selectors ke liye analyse kar sakta hoon.

Website aam taur par installed extensions ki seedhi list nahi dekhti; woh blocked
requests ya page behavior se adblock ka andaaza lagati hai. Yeh helper sirf kuch
page-behavior checks ko handle karta hai — extension ki maujoodgi ko guaranteed
chhupata nahi.

## Important limits

- Blocked ad request, blocked script / missing global, iframe, worker,
  sophisticated browser-API or server-side detection bypass guaranteed nahi.
- Native APIs ki identity / behavior badalta hai; determined website in changes
  ko notice kar sakti hai. All DOM APIs spoof nahi kiye gaye hain.
- Cross-origin / nested iframes mein injection nahi; protection top-level only.
- Asli ads ko unblock, fake ad impressions generate, ya uBlock rules modify nahi karta.
- Withheld video/content restore nahi karta. Login, subscription ya paywall unlock nahi karta.
- Popup cleanup default OFF. Likely subscription, login and payment dialogs
  deliberately skip karta hai; some backdrops/scroll locks reh sakte hain.
- Browser internal pages, extension stores, built-in PDF viewers, `file://`
  aur incognito modes supported nahi hain (incognito manifest mein
  `not_allowed` hai).
- Koi target website URL provide nahi kiya gaya, isliye specific-site compatibility
  claim nahi hai. Apni real website par test karna zaroori hai.

Agar kaam na kare, website ka exact URL, warning ka text/screenshot, browser version,
aur blocker ka exact naam (Origin ya Lite) bhejo. Site-specific fix assess kiya ja sakta hai.
Apne adblocker ki filter lists bhi updated rakho.

## Privacy & permissions

- `activeTab`: popup kholne par current tab ki URL/hostname samajhne ke liye.
- `scripting`: approved sites par helper ko page start par run karne ke liye.
- `storage`: enabled hostnames aur per-site preferences local save karne ke liye.
- `contextMenus`: enabled sites ke images par "Save image with QuietBlock" ka
  menu item. Sirf jab site enable hai tabhi menu dikhta hai.
- `downloads`: sirf jab aap koi image long-press/right-click karte ho, wahi
  ek URL download hoti hai. Background/automatic downloads koi nahi.
- Optional HTTP/HTTPS host permissions: sirf aapke Enable click ke baad requested
  hostname par page read/modify access. Manifest mein optional wildcards available
  hain, lekin installation par all-sites access grant nahi hota.
- `incognito: not_allowed`: extension incognito windows mein run nahi hota.

No analytics, accounts, remote code, external fonts, telemetry, cookie API,
browsing-history API, or extension-originated network requests in this version.
Popup cleanup sirf matching page text ko tab ke andar inspect karta hai; text
save/upload nahi hota. Saved hostnames local data hain. Remove action optional
site permission bhi revoke karta hai. Uninstall extension data ko hata deta hai.

## Source files

- `manifest.json`: Manifest V3 / minimal permissions.
- `background.js`: optional site permissions, dynamic script registrations,
  context-menu and image-download handling.
- `page-guard.js`: narrowly scoped main-world DOM hooks.
- `dismiss.js`: optional, conservative isolated-world popup cleanup.
- `indicator.js`: green blinking "protected" dot (per enabled site).
- `image-saver.js`: long-press image download (isolated world, no page API spoofing).
- `popup.*`, `options.*`, `ui.css`, `icons/`: local UI and assets.
- `tests/` + `package.json`: dev-only test harness (Node + jsdom); release ZIP
  mein tests/package.json included **nahi** hote.
- `TESTING.md`: kis level tak validation hua (aur kya nahi hua).

No build step, package installation, API key or remote service required for the
extension itself. Independent helper; uBlock project se affiliated nahi hai.

## Testing status (short)

`npm install && npm test` run karke **16/16 checks pass** hain (JS syntax,
manifest/MV3 + permissions validation, background logic with Chrome API stubs,
DOM-hook aur popup/options UI logic jsdom mein). Phir bhi yeh **real browser
test nahi** hai — Chromium/Edge binary aur real website availability is
environment mein nahi thi, aur koi target website URL bhi provide nahi hua.
Details ke liye `TESTING.md` padho. Browser/real-site testing complete nahi maani
jaati.

License: MIT. See `LICENSE.txt`.
