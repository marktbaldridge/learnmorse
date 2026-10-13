# Morse Trainer (PWA)

Practice copying Morse code by ear. Installs to the iPhone Home Screen, works offline, no accounts, no dependencies.

## Host it (needs HTTPS)

iOS only installs and caches a PWA from an HTTPS address. Any static host works. Upload this folder as-is:

- **Cloudflare Pages / Netlify Drop**: drag the folder onto the dashboard.
- **GitHub Pages**: push the folder to a repo, enable Pages. Subpaths are fine; all URLs are relative.
- **Your own machine** (from this folder): `python -m http.server 8000`, then expose it over HTTPS, e.g. `tailscale serve --bg 8000`.

## Install on iPhone

Open the URL in **Safari**, tap **Share**, then **Add to Home Screen**. Launch it from the Home Screen icon.

## Using it

- **Start** plays a character at 500 Hz. Type it on the on-screen keyboard (switch to the 123 / symbols layer for digits and punctuation).
- **Wrong key**: soft buzzer, then the character plays again with its answer shown. Type the correct key to continue. A wrong key counts one miss, however many tries it takes.
- **Replay** and **Reveal** are buttons on screen. Reveal counts as a miss.
- **Speed** slider (5-40 WPM) is on the main screen. Everything else is in Settings (the sliders icon): characters grouped by length, QSO abbreviations and prosigns, pitch, volume, pause between characters, stats.

### Bluetooth / hardware keyboard

| Key | Action |
| --- | --- |
| Letters, digits, punctuation | Answer |
| Tab | Replay |
| Return | Reveal (or Start when stopped) |
| Esc | Pause |
| Up / Down arrow | Speed +1 / -1 WPM |

Space is deliberately ignored, so it can later mean a word gap.

## Updating

The app caches itself. After you upload new files, bump `CACHE` in `sw.js` (e.g. `morse-trainer-v2`), then open the app twice: the first launch fetches the update, the second runs it.

## Files

`index.html`, `style.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icons/`
