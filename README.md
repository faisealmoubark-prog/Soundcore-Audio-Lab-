# Soundcore Audio Lab

Arabic RTL, mobile-first browser audio laboratory reconstructed from the currently published application at https://soundcore-audio-lab-rebuilt.vercel.app.

## Included application
- Local audio file selection and playback (MP3, M4A, AAC, WAV, OGG, FLAC where supported by the browser).
- Live five-band EQ using the Web Audio API.
- Flat, Bass Boost, Vocal Clarity, and Soundcore A20i presets.
- Additional bass gain and dynamics-compressor clipping protection.
- Export of processed audio as WAV using OfflineAudioContext.
- Local IndexedDB libraries for original and processed files.
- JSON backup export/import for the local libraries.
- Arabic RTL responsive interface with iPhone safe-area support.

## Run
This is a static browser application. Open `index.html` from a local static server or deploy the repository to Vercel with the project root set to the repository root. No build step or server-side API is required.

## Browser and device limitations
- Audio processing applies to the audio element played by this page, not other apps or system audio.
- Actual output loudness remains subject to iOS, browser, Bluetooth, and device volume limits.
- Supported input codecs depend on the browser's media decoder.
- Local library data is stored in the browser's IndexedDB and may be removed by browser storage cleanup. Export backups for important files.
- WAV export depends on browser Web Audio API support and available device memory; large files can fail on mobile devices.

## Privacy
The application processes selected audio locally in the browser. This source does not upload audio files to a server. No API keys or server secrets are required.

## Source provenance
The initial `index.html` was copied from the live public deployment response and checked for the app title, IndexedDB storage, and WAV export implementation before being committed. This is a reconstruction of the published web artifact, not a recovery of the original ProductOS/Expo source project.
