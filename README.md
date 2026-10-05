# 👁️ Audiences Analyze

**One real-time analytics dashboard for Brand_Designer and all connected websites/projects.**
Built for personal use on GitHub Pages with Firebase Realtime Database. Install the tracker on every site you want to measure; all sites can share one Firebase project and one dashboard.

---

## ✨ Kya Track Karta Hai?

| Feature | Description |
|---------|-------------|
| 🟢 **Live Visitors** | Real-time active visitor count with city, device, current page |
| 🔗 **Traffic Sources** | Google, Facebook, Instagram, WhatsApp, Direct, Referral — sab kuch |
| 📄 **Page Views** | Kaunsa page kitna dekha, kitna time bitaya |
| 📍 **Geo Location** | Country, city, IP (free ipapi.co se) |
| 📱 **Devices & OS** | Separate iOS/Android session counts plus Mobile/Desktop/Tablet, browser, OS and screen size |
| 🖱️ **Clicks** | Sabhi link, button, outbound links par click tracking |
| 💬 **WhatsApp Clicks** | Aapke WhatsApp button par kitne click aaye |
| 💼 **Lead Contacts** | Searchable lead cards with visitor-submitted name, phone, email, social handles/URLs, and enquiry fields |
| ⏱️ **Session Duration** | Har visitor kitna time raha, heartbeat-based |
| 📜 **Scroll Depth** | 25%, 50%, 75%, 90%+ scroll tracking |
| ⚡ **Live Event Stream** | Real-time event timeline — sab kuch live dikhta hai |
| 🔄 **Returning Visitors** | Pahle bhi aa chuke hai kya? |
| 🎯 **Lead Funnel** | Enquiry → Form fill → Submit / WhatsApp click |
| 🌐 **UTM Parameters** | Campaign tracking (utm_source, utm_medium, etc.) |
| 🧭 **Multiple Websites** | One shared dashboard, an All Sites overview, and a site selector for each tracked website |

---

## 🚀 Setup Guide (5 minutes)

### Step 1: Firebase Project Banaye

1. 🔗 [console.firebase.google.com](https://console.firebase.google.com) par jao
2. **"Create a project"** click karo → Naam de: `audiences-analyze`
3. Google Analytics enable/disable (optional) → Project banao
4. Left menu se **"Build" → "Realtime Database"** par jao
5. **"Create database"** click karo
6. Location select karo (asia-southeast1 nearby hai India ke liye)
7. **Start in locked mode** select karo (recommended; Firebase blocks access by default).
8. Keep the database in locked mode until the Authentication setup and rules in `FIREBASE-SETUP.md` are complete. Do not publish public `.read: true` / `.write: true` rules for real lead data.

### Step 2: Web App Add Karo

1. Project homepage par **"</>"** (Web App) icon par click karo.
2. App nickname `Audiences Analyze` rakhkar register karo; Firebase Hosting ki zaroorat nahi.
3. Aapka diya hua Web App config already `firebase-config.js` aur `tracker.js` mein set hai. Agar naya Firebase project use karo, to generated values exactly copy karke dono files update karo. Details `FIREBASE-SETUP.md` mein hain.

### Step 3: GitHub Par Upload

1. Ek naya GitHub repository banayo: `Audiences-analyze`
2. Is folder ke saare files upload karo:
   - `index.html`
   - `tracker.js`
   - `dashboard.html`
   - `dashboard.css`
   - `dashboard.js`
   - `snippet.js`
   - `firebase-config.js`
   - `database.rules.json`
   - `README.md`
   - `FIREBASE-SETUP.md`
3. **Settings → Pages** mein jao
4. Source: `Deploy from a branch` → Branch: `main` → `/ (root)` → Save
5. URL: `https://rjsarkar83.github.io/Audiences-analyze/dashboard.html`

### Step 4: Auth + Dashboard

1. Firebase **Authentication** mein **Anonymous** aur **Google** sign-in providers enable karo.
2. `database.rules.json` ke `YOUR_GOOGLE_EMAIL_HERE` ko apne Google sign-in email se replace karo; yeh updated rules sirf Firebase Console mein paste karo, public GitHub repo mein email mat commit karo.
3. `database.rules.json` ke rules ko Firebase Console → **Realtime Database → Rules** mein paste karke publish karo.
4. Dashboard URL kholo: `https://rjsarkar83.github.io/Audiences-analyze/dashboard.html` → owner Google account se sign in karo.
5. Firebase Authentication → Settings → Authorized domains mein GitHub Pages hostname add karo. Full steps `FIREBASE-SETUP.md` mein hain.

### Step 5: Har Website Par Tracker Add Karo

Har website ke HTML `</body>` se pehle same tracker script lagao. **Har site ka `__AA_SITE_ID__` alag rakho; Firebase config hosted `tracker.js` mein already hai.**

```html
<!-- Audiences Analyze: example for Brand_Designer -->
<script>
  window.__AA_SITE_ID__ = "brand-designer";
  window.__AA_SITE_NAME__ = "Brand Designer";
  window.__AA_SITE_URL__ = "https://rjsarkar83.github.io/Brand_Designer/";
</script>
<script async src="https://rjsarkar83.github.io/Audiences-analyze/tracker.js"></script>
```

Copy that block to every website and change its site ID/name/URL plus the GitHub username in the tracker URL. For example:

| Website | `__AA_SITE_ID__` | `__AA_SITE_NAME__` |
|---|---|---|
| Brand_Designer | `brand-designer` | `Brand Designer` |
| Counter | `counter` | `Counter` |
| Converter | `converter` | `Converter` |
| Relax-Indore | `relax-indore` | `Relax Indore` |
| Desi Museum | `desi-museum` | `Desi Museum` |
| Portfolio | `portfolio` | `Portfolio` |

Use a unique ID per website (lowercase letters, numbers, hyphens). The names above are examples; update them to match the actual URLs/projects you own. Deploy each site after adding the snippet. The dashboard's site dropdown will discover sites after their first tracked visit; select **All Sites** for a combined view.

`tracker.js` can also guess a site ID from known URL/path names, but explicitly setting the site values is more reliable, especially when several GitHub Pages projects share a domain.

---

## 🌐 Multi-Site: Coverage aur Limitations

- Link ko digital card mein rakhna **akele** destination website ke page views/actions record nahi karta. Us website ke HTML/code mein bhi tracker add hona chahiye.
- Agar kisi destination par code edit/deploy karne ka access nahi hai, to Brand_Designer se us link ka **outbound click** hi measure ho sakta hai; destination ke page journey, time, forms aur actions nahi.
- All Sites view data ko aggregate karta hai; dropdown se ek website alag bhi dekh sakte ho. Har site se data aane ke baad woh selector mein appear hogi.
- Different domains par browser storage alag hota hai. Isliye ek person ko domains ke beech same visitor ke roop mein jodna automatic nahi hai; same-origin projects mein ID share ho sakti hai. Cross-domain identity-linking ko explicit consent and a secure design ke saath alag configure karna hoga.
- Forms/lead fields tabhi capture honge jab tracker us form ko detect kar sake. Custom forms ke liye `<form data-aa-lead-form>` use karein; exclude karne ke liye `<form data-aa-ignore-form>`. Password/file/hidden aur known payment/identity fields are not stored. Har website par privacy/consent requirements alag ho sakte hain.

---

## 📊 Dashboard Features

### Top Stats Bar
- **Active Visitors** — Abhi kitne log site par hai
- **Total Sessions** — Kul kitne sessions aaye
- **Unique Visitors** — Alag-alag log kitne aaye (cookie-based)
- **Avg Session Duration** — Average time spent
- **Page Views** — Total page views
- **🔥 Digital Card Leads** — Kitne log enquiry form bhar ya WhatsApp click kiye

### Panels
1. **🟢 Active Visitors** — Real-time visitor list, city, device, current page, duration — click karke full session details dekh sakte ho
2. **🔗 Traffic Sources** — Kaha se aaye (Google, Social, Direct, Referral)
3. **📄 Top Pages** — Sabse zyada kaunsa page dekha gaya
4. **🌍 Locations** — Country + city breakdown
5. **📱 iOS, Android & Devices** — iOS/Android session counts for the selected site/time range, plus device, browser and OS charts
6. **💼 Lead Contacts** — Visitor-submitted phone/email/social details with call, email, and safe profile links; WhatsApp clicks appear separately
7. **⚡ Live Event Stream** — Har event real-time mein scroll karta hua dikhta hai

### Session Detail Modal
Kisi visitor par click karo to poora session timeline milta hai:
- Location, device, browser, OS, screen, language
- Traffic source
- Page-by-page journey with time spent
- Form data agar unhone enquiry bhari ho
- Full event timeline (100+ events tak)

---

## 🔧 Custom Events Track Karne Ke Liye

Apni site par manually event track karna ho to:

```js
AATrack('portfolio_view', { project: 'Wobbler Design' });
AATrack('video_play', { video: 'intro.mp4' });
AATrack('download', { file: 'brochure.pdf' });
```

---

## 🔒 Privacy & Security Note

- This is intended for your own analytics, but a GitHub Pages dashboard is a public static website unless protected separately. A hidden URL is not access control.
- Tracker events and enquiry details can contain personal data. Do not collect more than needed; tell visitors about analytics where required and provide any required consent/opt-out.
- Dashboard access requires the configured owner Google account; website tracker writes use Firebase Anonymous Authentication. Keep the supplied `database.rules.json` rules restricted to your owner email—never use public database read/write rules for real lead data.
- IP-based location uses a third-party geolocation service and may be blocked or unavailable. Consider removing it if you do not need it.
- Check current Firebase plan quotas/pricing in Firebase Console; limits and billing terms may change.

---

## 📝 File Structure

```
Audiences-analyze/
├── index.html        ← GitHub Pages landing redirect to dashboard
├── tracker.js        ← Website par embed karne wala tracking script
├── dashboard.html    ← Analytics dashboard (ye kholo browser mein)
├── dashboard.css     ← Dashboard styling
├── dashboard.js      ← Dashboard logic and multi-site filters
├── snippet.js        ← Per-site embed template
├── firebase-config.js ← Supplied Firebase Web App config
├── database.rules.json ← RTDB owner/anonymous-writer rules template
├── FIREBASE-SETUP.md ← Console setup and config guide
└── README.md         ← Setup, deployment, and privacy notes
```

---

## Firebase Quotas

Firebase plan limits, availability, and pricing can change. Check the current Realtime Database quota and billing details in your Firebase Console before launch; keep an eye on stored events and usage as the number of sites grows.

---

**Made with ❤️ for Brand_Designer by RJ Sarkar**
