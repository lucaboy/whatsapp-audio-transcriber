<div align="center">

# WhatsApp Audio Transcriber

**Your voice notes, in text. One reaction away.**

On-demand transcription with TypeScript, WhatsApp Web and local Whisper inference.

[Quick start](#quick-start) · [Configuration](#configuration) · [How it works](#how-it-works) · [Troubleshooting](#troubleshooting)

</div>

---

React with **🤖** to a WhatsApp voice note from your linked account. The bot transcribes it on your computer and replies with the text in the original chat.

- **Local inference:** audio is processed with `whisper.cpp` through `smart-whisper`; no speech API key is required.
- **On demand:** only your configured reaction triggers a transcription, for sent or received voice notes.
- **Simple pairing:** a local page shows the current QR code and connection status automatically.
- **Predictable processing:** a bounded queue runs one transcription at a time and deduplicates pending requests.
- **Clean temporary storage:** audio files are removed after conversion, including when conversion fails.

## Quick start

### Requirements

- **Node.js 22 or newer** and npm. Use `nvm use` if you have nvm installed.
- **FFmpeg** available on your `PATH` (`ffmpeg -version` should succeed).
- A C++ build toolchain and Python for the native `smart-whisper` addon: Xcode Command Line Tools on macOS, or equivalent build tools on Linux/Windows.
- Internet access for WhatsApp, the initial model download and Puppeteer's browser download during installation.

```bash
git clone https://github.com/lucaboy/whatsapp-audio-transcriber.git
cd whatsapp-audio-transcriber
npm ci
cp .env.example .env
npm run build
npm start
```

Open **http://127.0.0.1:8080**. The first launch downloads the multilingual `large-v3-turbo` model (about 1.62 GB), then shows a QR code. In WhatsApp, open **Settings → Linked devices → Link a device** and scan it.

Once the page says **Connected**, react with 🤖 to a voice note. The transcript appears as a reply prefixed with `[WA-TRANSCRIBER-BOT]`. In a group chat, that reply is visible to the group.

Your linked session is saved locally in `.wwebjs_auth/`, so subsequent launches normally do not need a new QR code.

## Configuration

Edit `.env` before starting the app. Existing custom model paths are supported; an invalid explicit path produces a startup error instead of silently downloading a different model.

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `HOST` | `127.0.0.1` | Interface used by the pairing page. Keep it local unless you provide access controls. |
| `PORT` | `8080` | Pairing page port. |
| `TRANSCRIPTION_REACTION` | `🤖` | Reaction that requests a transcription. |
| `TRANSCRIPTION_LANGUAGE` | `auto` | Automatic language detection, or a Whisper language code such as `it` or `en`. |
| `WHISPER_MODEL` | `large-v3-turbo` | Model downloaded automatically when no local path is set. |
| `WHISPER_LOCAL_MODEL_PATH` | empty | Path to an existing compatible GGML model; takes priority over `WHISPER_MODEL`. |
| `USE_GPU` | `false` | Enable GPU acceleration when supported by your native build. |
| `FFMPEG_PATH` | `ffmpeg` | FFmpeg executable name or absolute path. |

The default is **Whisper large-v3-turbo**, the latest Whisper model listed in the [official OpenAI repository](https://github.com/openai/whisper#available-models-and-languages), checked on 10 October 2026. It is multilingual and optimized for transcription. The [GGML weights](https://huggingface.co/ggerganov/whisper.cpp/blob/main/ggml-large-v3-turbo.bin) take about **1.62 GB** of disk space; memory use and speed depend on your hardware and acceleration. For a lighter setup, explicitly select `base` or `small`.

**Upgrading an existing installation:** update `WHISPER_MODEL` in your `.env` to `large-v3-turbo` and clear `WHISPER_LOCAL_MODEL_PATH`, unless that path already points to the turbo model. An existing `.env` is never overwritten automatically. Automatically downloaded models are managed by `smart-whisper` in `~/.smart-whisper/models/`.

## How it works

```mermaid
flowchart LR
    A[Your reaction] --> B[Voice note]
    B --> C[FFmpeg: mono, 16 kHz]
    C --> D[Local Whisper model]
    D --> E[Reply in the original chat]
```

Only voice notes (`ptt`) are handled. Reactions from other people, other emoji, and events older than two minutes are ignored. Up to 20 jobs can be active or waiting; repeated events for a pending message share the same job. Failures are reported in the terminal and do not block later jobs.

Audio inference runs locally, but the app still connects to WhatsApp to retrieve messages and send transcript replies. Temporary audio is deleted after conversion; WhatsApp session data and downloaded models persist locally. Do not share `.env` or `.wwebjs_auth/`.

## Development

```bash
npm run dev    # Run TypeScript with automatic restart
npm run build  # Type-check and compile to dist/
npm test      # Build and run the regression tests (requires FFmpeg)
```

Tests cover reaction filtering, queue ordering and deduplication, recovery after errors, configuration, real FFmpeg conversion, temporary-file cleanup and the pairing page API. They do not link a WhatsApp account or send messages. GitHub Actions runs the suite on Node.js 22 and 24.

Commit `package-lock.json` when changing dependencies. Use `npm ci` for reproducible installs.

## Troubleshooting

| Symptom | What to check |
| :--- | :--- |
| QR code is not shown yet | Check the terminal: the initial model download and load must complete first. The page refreshes its state automatically. |
| FFmpeg fails or cannot be found | Run `ffmpeg -version`; repair your FFmpeg installation or set `FFMPEG_PATH` to a working executable. |
| A voice note is ignored | React from the linked account using the configured emoji. Older replayed reactions and ordinary audio attachments are ignored. |
| Model fails to load | Check `WHISPER_LOCAL_MODEL_PATH`, file readability, available RAM and compatibility with the bundled whisper.cpp version. |
| Browser cannot launch | Ensure Puppeteer's browser was downloaded during `npm ci`, and install the platform dependencies described in [Puppeteer's troubleshooting guide](https://pptr.dev/troubleshooting). |
| Session disconnects | Restart the app. If pairing fails repeatedly, unlink the device in WhatsApp and remove the local `.wwebjs_auth/` folder before pairing again. |

## Maintenance notes

This project uses the unofficial [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) client. WhatsApp changes can affect compatibility, and use of unofficial clients can lead to account restrictions. This is a personal tool, not a production service or an official WhatsApp integration.

The current dependency tree has upstream npm audit findings in Puppeteer's browser-download/proxy dependencies (`extract-zip` and `basic-ftp`). `whatsapp-web.js` also retains deprecated `fluent-ffmpeg` transitively; this app calls FFmpeg directly. These upstream constraints remain despite updating the direct dependencies. A forced major Puppeteer override has not been applied without WhatsApp integration testing.

## License

[GPL-3.0](LICENSE) · Created by [Luca Chianese](https://github.com/lucaboy).
