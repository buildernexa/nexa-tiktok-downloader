# Nexa-TikTok Downloader

APK Android, dibangun via GitHub Actions. Tanpa Pages, tanpa terminal.

## Deploy

1. Buat repo baru di GitHub, **Public**.
2. Upload 7 file sesuai struktur folder.
3. Commit.
4. Buka tab **Actions** → workflow **Build Nexa-TikTok APK** → tunggu hijau.
5. Buka run terakhir → scroll ke bawah → download **nexa-tiktok-vN**.
6. Extract zip → `app-debug.apk` → install di HP.

## Stack

- Frontend: HTML/CSS/JS di `www/`
- Pembungkus: Capacitor 6
- Build: GitHub Actions (Ubuntu + Java 17 + Android SDK + Gradle)
- API unduhan: cobalt.tools → tikwm.com → TikTok oEmbed (cascade)
- Save: Capacitor Filesystem → Documents (fallback ke browser download)

## Fitur

Single · Batch · HD/SD · MP3 · Cover · History · Dark mode · Copy · Paste · Auto versionCode.
