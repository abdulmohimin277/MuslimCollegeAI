# Build the Muslim College AI Study-Agent APK

This guide turns the web app in the repo root into an installable Android APK
using the wrapper already in `android/`. You have **two options**; pick one.

| | Option A — Cloud (recommended) | Option B — Local build |
|---|---|---|
| Toolchain needed | none (GitHub does it) | JDK 17 + Android SDK + Gradle |
| Disk needed | ~0 | ~2.5 GB |
| Time | ~3–6 min per build | ~10–25 min (downloads) |
| Result | downloaded APK artifact | `app-release.apk` file |

---

## How the wrapper works

`android/` is a minimal Android Studio project. Its only job is to put your web
files into a WebView:

- `android/app/src/main/assets/` holds a **copy** of the web app. It is **auto-
  regenerated on every build** by a Gradle task, so you never hand-sync it:

  ```gradle
  // android/app/build.gradle (already in your repo)
  tasks.register('syncWebAssets', Copy) {
      dependsOn cleanWebAssets
      from rootProject.file('../')        // repo root
      include '*.html', 'css/**', 'js/**', 'app.js', 'sw.js',
              'manifest.webmanifest', 'assets/**'
      into 'src/main/assets/'
  }
  preBuild.dependsOn syncWebAssets
  ```

  ⇒ Tip: after editing `index.html` / `css/` / `js/`, **you don't re-sync the
  assets** — just rebuild. The stale files (old `login.html`, `agent.html`, …)
  are wiped by `cleanWebAssets` automatically.

- `MainActivity.java` loads `file:///android_asset/index.html` in a WebView.
- The manifest only needs `INTERNET`. No AndroidX, no native libs → fast build.

---

## Option A — Cloud build with GitHub Actions (recommended)

This is already wired: `.github/workflows/android.yml` was added to the repo.
It builds a **debug APK** on every push to `main` (and on the manual button)
and uploads it as a downloadable artifact.

### Steps

```bash
# 1) From the repo root
git add .github/workflows/android.yml android/gradlew \
        android/gradlew.bat android/gradle/wrapper/
git commit -m "chore: add Android APK build workflow"
git push origin main
```

2) Open `https://github.com/TheDeveloperSahal/MuslimCollegeAI/actions` →
   the run will appear as **Build Android APK**.

3) Wait for the green check, then open the run → expand **Artifacts** →
   download **muslim-college-apk** (it contains `app-debug.apk`).

4) Save it to your phone and install (jump to ["Install on the phone"](#install-on-the-phone)).

> To rebuild after changing the web app later: re-push to `main`, or open the
> Actions tab → **Build Android APK** → **Run workflow** → Run.

---

## Option B — Local build (Windows, command-line)

Only needed if you don't want to use GitHub. Install three things:

### 1. JDK 17

Download and install **Temurin 17 (LTS)** for Windows x64:
https://adoptium.net/temurin/releases/?version=17

After install, verify:

```bash
java -version
# Expect: openjdk version "17.0.xx"  → needs 17, not 21/8
```

### 2. Android SDK command-line tools

```bash
# Download cmdline-tools (Windows):
curl -L -o cmdtools.zip \
  "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"

# Unzip so the folder is:  %LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\
# (e.g. unzip to a scratch dir, then move cmdline-tools → ...\latest)

# Accept licenses + install platforms;36 and build-tools by auto-answer "y":
yes | sdkmanager --licenses
yes | sdkmanager "platforms;android-36" "build-tools;36.0.0" "platform-tools"

# Point the build at your SDK:
#   set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
#   set ANDROID_SDK_ROOT=%LOCALAPPDATA%\Android\Sdk
```

(Your wrapper pins `compileSdk 36` + `buildToolsVersion '36.0.0'`, so those two
packages are what AGP needs. `sdkmanager` lives in
`cmdline-tools\latest\bin\`.)

### 3. Gradle

```bash
# The repo ships a Gradle wrapper (android/gradlew[.bat]) pinned to Gradle 8.13,
# so on Windows you can simply run:  android\gradlew.bat :app:assembleDebug
# No wrapper-free global install needed any more.
```

### 4. Build the APK

```bash
cd /c/Users/sahal/Downloads/MuslimCollegeAI/android

# Debug APK (no signing config → auto-debug signature, installable):
./gradlew :app:assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk

# Release APK — first add a signingConfig (below), then:
./gradlew :app:assembleRelease
# Output: app/build/outputs/apk/release/app-release.apk
```

### 5. (Release only) Sign the APK

Debug builds are auto-signed with the debug key, so you can skip this. For a
release build add to `android/app/build.gradle`:

```gradle
android {
    signingConfigs {
        release {
            storeFile     file("../keystore.jks")
            storePassword "YOURPASS"
            keyAlias      "mc"
            keyPassword   "YOURPASS"
        }
    }
    buildTypes {
        release {
            minifyEnabled false
            signingConfig signingConfigs.release
        }
    }
}
```

Generate the keystore once (JDK's `keytool`):

```bash
keytool -genkeypair -v -keystore keystore.jks -alias mc \
  -keyalg RSA -keysize 2048 -validity 10000
```

---

## Install on the phone

1. Copy the `.apk` to the phone (USB `MTP` transfer, or send the downloaded
   artifact to yourself via WhatsApp/Drive).
2. Android will block the install → tap **Settings** and enable:
   - **Install unknown apps** for your file manager / Chrome, or on newer
     Android **Install from unknown sources** for "My Files" / browser.
   - Older Android: **Settings → Security → Unknown sources**.
3. Open the APK and confirm **Install**.
4. Launch **Muslim College** — it's offline-capable after first load and keeps
   your name/API key/chat in the app's own storage.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `sdkmanager: command not found` | Use its full path `...\cmdline-tools\latest\bin\sdkmanager`. |
| `Failed to find target with hash string 'android-36'` | Reinstall: `yes \| sdkmanager "platforms;android-36"`. |
| `> Task :app:syncWebAssets` / stale pages in the app | It re-copies on every build; also remember edits must be saved in the **repo root** files, not `android/app/src/main/assets/`. |
| `Minimum supported Gradle version is X` | Upgrade Gradle (Option B step 3) — the wrapper targets AGP 8.9.2. |
| Download of artifact blocked | Sign in on the device with the same GitHub account, or use **Run → Artifacts** on a desktop. |
| White screen after install | Wipe the app data (Settings → Apps → Muslim College → Storage → Clear data); localStorage may be empty. |

---

*Last updated with the animated-icon + responsive polish. The web assets in
`android/app/src/main/assets/` are kept in sync during every build, so an APK
built now contains the latest UI.*
