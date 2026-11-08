# Wordle + Define — Android app (Capacitor)

The game lives in `www/` (plain HTML/CSS/JS). Capacitor wraps it as a native Android app.

## Option A — Build the APK in the cloud (no Android Studio needed)
1. Create a GitHub repo and upload everything in this folder (keep the `.github` folder).
2. Open the repo's **Actions** tab. The **Build Android APK** workflow runs on every push (or click *Run workflow*).
3. When it finishes (~5 min), open the run and download the **wordle-define-apk** artifact (a zip containing `app-debug.apk`).
4. Copy `app-debug.apk` to your phone, tap it, and allow "Install unknown apps" when asked.

## Option B — Build locally with Android Studio
1. Install Node 22+, Android Studio (includes JDK 21).
2. In this folder: `npm install` then `npx cap sync android` then `npx cap open android`.
3. In Android Studio: **Build > Build APK(s)**, or press Run with a phone/emulator connected.

## Updating the game
Edit files in `www/`, then run `npx cap sync android` (or just push to GitHub for Option A).

## Notes
- The debug APK is for personal use. A Play Store release needs a signed release build (keystore) and a custom icon.
- Internet is only used for the online grammar check (LanguageTool); everything else works offline.
- App name: "Wordle Define", package: `com.wordledefine.app` (change in `capacitor.config.json` before the first `cap add`/Play upload).
