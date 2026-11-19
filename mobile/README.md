# AbsorbHR phone app (iPhone and Android)

The app is a small native shell (Capacitor 8) that opens the live portal,
https://absorbhr-portal.co.uk, and adds phone features. Because it shows the live portal, almost
every portal change reaches the app straight away with no new store release. Only changes in
this folder (new phone features, icons, permissions) need a new release.

- App name: **AbsorbHR**. App ID / bundle ID: **uk.co.absorbhr.portal** (permanent once published).
- `capacitor.config.ts`: the live address, the no-signal page, start-up screen and status bar colours.
- `www/offline.html`: shown when the portal can't be reached.
- `assets/`: the 1024px icon and start-up screen; `npm run assets` makes every size from them.
- `ios/`, `android/`: the native projects. iOS uses Swift Package Manager (no CocoaPods).

## Phone features so far

- **Face ID / fingerprint / passcode lock** — the portal is covered when the app opens and when it
  comes back after more than 2 minutes away (`components/app/native-lock.tsx` in the portal, using
  `lib/native.ts`; tested by `e2e/app-lock.spec.ts` with a fake app bridge). Normal browsers never see it.
- **Camera for uploads** — on iPhone the portal's file pickers can take a photo (permission text in
  `ios/App/App/Info.plist`). Android picks existing files and photos for now.
- **Microphone** for the assistant's speak button (iPhone permission text in `Info.plist`).
- **No-signal screen**, purple start-up screen and status bar, and only the portal's own address
  can load inside the app (`WKAppBoundDomains` on iPhone).
- The portal can tell it's in the app: the browser name ends in `AbsorbHRApp/1`.

## Test builds (no Mac needed)

GitHub → Actions → **Build phone app** → Run workflow. It makes:
- `absorbhr-android-test`: an `.apk` you can install on an Android phone (allow "install unknown apps").
- `absorbhr-ios-simulator`: an iPhone build for the iOS Simulator only. A real iPhone needs the
  signed TestFlight build below.

## Still to do before the stores

Owner (accounts, all in the name of **Absorb HR Ltd**):
1. D-U-N-S number for Absorb HR Ltd (free, from Dun & Bradstreet).
2. Apple Developer Program, organisation membership (99 USD a year, charged in local currency).
3. Google Play Console, organisation account (25 USD once; organisation accounts skip the
   12-testers-for-14-days rule).
4. A privacy policy page on absorbhr.co.uk (both stores require the link).

Claude, once the accounts exist:
1. Signing: an App Store Connect API key and a Play upload key as GitHub secrets, then a signed
   release workflow that sends builds to TestFlight and Google Play internal testing.
2. Push notifications (holiday approved, shift offered, policy to read): Firebase project for
   Android, an Apple push key, a device-token table (database migration) and sending from the
   portal's existing email queue.
3. Store listings: screenshots from the Brightwater demo company, wording from `brain/facts.md`,
   privacy answers, and an employee-level demo login for Apple's reviewers (admin logins need a
   2-step code the reviewers can't get).
4. No sign-up or payment links inside the app (clients pay AbsorbHR directly).

## Commands (run inside `mobile/`)

| Command | What it does |
|---|---|
| `npm ci` | Install the app's packages |
| `npx cap sync` | Copy config and the offline page into the iPhone and Android projects |
| `npm run assets` | Remake every icon and start-up screen size from `assets/` |
