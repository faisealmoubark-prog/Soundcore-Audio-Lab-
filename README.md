# Soundcore Audio Lab

Arabic RTL, mobile-first browser audio laboratory. This branch contains the expanded DSP implementation while preserving the existing local-file workflow and IndexedDB library.

## Audio features
- Local audio selection and playback in the browser (codec support depends on Safari/browser).
- Eight-band parametric EQ with editable center frequency, gain and global Q.
- Live DSP using the Web Audio API: low-shelf bass enhancement, dynamic bass control, compressor, clipping limiter, de-esser, master gain and stereo-width matrix.
- Starting DSP profiles for Soundcore A20i, R50i NC, P20i, Life 2 Neo and K20i. These are editable starting points, not official Soundcore calibration or firmware changes.
- Offline WAV rendering with the EQ and supported DSP chain.
- Separate local IndexedDB libraries for original and processed files, plus JSON backup export/import.
- Local-only processing: selected audio is not uploaded to an application server.

## Run
Static browser app. Deploy the repository root to Vercel; no build step or server-side API is required.

## Browser and device limitations
- DSP applies only to audio played by this page, not Spotify, YouTube or system-wide audio.
- iOS, Safari, Bluetooth devices and the device volume control the final output level.
- Browser codec support varies. If a file cannot be decoded, try MP3, M4A or WAV.
- WAV rendering uses device memory and may fail for long/high-resolution tracks on mobile.
- Background playback depends on iOS/Safari lifecycle behavior and cannot be guaranteed after the browser suspends the page.
- Local IndexedDB data may be removed by browser storage cleanup. Export backups for important work.

## Source provenance
The starting HTML was reconstructed from the published Soundcore Audio Lab page and checked before committing. This repository is a reconstruction of the browser artifact, not a recovery of the original ProductOS/Expo source project.
