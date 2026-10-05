# Firebase setup — Audiences Analyze

Use **one Firebase project** for the dashboard and all tracked websites. The supplied Firebase Web App config is already included in `firebase-config.js` and `tracker.js`.

## 1) Create the Realtime Database

1. Open [Firebase Console](https://console.firebase.google.com/) and choose project `audiences-analyze`.
2. Open **Build → Realtime Database → Create Database**.
3. Select **Singapore (`asia-southeast1`)** if offered; it is a nearby region for India. Choose carefully because an RTDB location cannot be changed after creation. [Firebase RTDB locations](https://firebase.google.com/docs/database/locations)
4. Choose **Start in locked mode** and finish.
5. Confirm the URL shown in the RTDB page matches the config already supplied in this project:
   `https://audiences-analyze-default-rtdb.asia-southeast1.firebasedatabase.app`

Do not switch to public `.read: true` / `.write: true`. Firebase rules are enforced by the server; default rules deny access unless a rule grants it. [Realtime Database Security Rules](https://firebase.google.com/docs/database/security)

## 2) Enable Firebase Authentication

1. Open **Build → Authentication → Get started**.
2. In **Sign-in method** (or **Sign-in providers**), enable:
   - **Anonymous** — the public website tracker uses an anonymous identity to write its own event records.
   - **Google** — you use this to sign in to the private dashboard.
3. In **Authentication → Settings → Authorized domains**, add the domain that will host the dashboard. For the existing portfolio account this is likely `rjsarkar83.github.io`; use the exact hostname of your deployed GitHub Pages dashboard.

## 3) Apply owner-only database rules

1. In `database.rules.json`, replace every `YOUR_GOOGLE_EMAIL_HERE` with the Google account you will use to sign in. Use the same email spelling/case as the Google account.
2. Open Firebase Console → **Realtime Database → Rules**.
3. Paste the edited JSON and click **Publish**.
4. Do **not** commit the edited file containing your personal email to a public GitHub repository. The ZIP includes only the placeholder template.

These rules allow the owner account to read analytics and allow anonymous website tracker identities to write only records associated with their own Firebase Auth UID. Do not add an open `.read` or `.write` rule.

## 4) Confirm the Web App config

The config supplied for this project is in `firebase-config.js` and the tracker fallback. It contains:

- `apiKey`: `AIzaSyAKpZygbqLHpA6MlJHXpMBzQI_RWeDZ2VE`
- `authDomain`: `audiences-analyze.firebaseapp.com`
- `databaseURL`: `https://audiences-analyze-default-rtdb.asia-southeast1.firebasedatabase.app`
- `projectId`: `audiences-analyze`
- `storageBucket`: `audiences-analyze.firebasestorage.app`
- `messagingSenderId`: `963492962298`
- `appId`: `1:963492962298:web:44d27cc51359cca5cc0e43`
- `measurementId`: `G-9D5J5F08ET` (optional; Audiences Analyze records its own events in Realtime Database and does not need a separate Analytics import)

The browser Web App config is not a service-account secret. Never create or upload a service-account private key to GitHub; database rules and sign-in are what protect the data.

## 5) Add each website

1. Upload the project files to the `Audiences-analyze` GitHub repository and enable GitHub Pages.
2. On each website you control, copy the per-site code from `snippet.js` just before `</body>`.
3. Change its site ID/name/URL for each website. Keep the same shared tracker URL and Firebase project.
4. Open the dashboard on the deployed GitHub Pages URL, sign in with the owner Google account, and check the **All Sites** selector.

For a site you cannot edit, Audiences Analyze can only record the outbound click from a tracked source site—not that destination's page views or visitor contact details.

## Is this the best option?

For a GitHub Pages static dashboard that needs real-time multi-site events, Realtime Database plus Firebase Authentication is a good fit and matches the current code. A basic Google Analytics setup is simpler for general traffic reports, but it will not by itself provide this custom lead/contact panel. Authentication and the owner-only rules above are required before using real visitor contact data.
