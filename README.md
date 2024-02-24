# whatsapp-audio-transcriber

A Node.js WhatsApp Bot to automatically transcribe voice messages using whisper.cpp.

## Overview

This project utilizes the following components:

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js): A WhatsApp API client that connects through the WhatsApp Web browser app using [Puppeteer](https://github.com/puppeteer/puppeteer).

- [smart-whisper](https://github.com/JacobLinCool/smart-whisper): A Node.js wrapper for [whisper.cpp](https://github.com/ggerganov/whisper.cpp).

## Usage

1. Clone this repository.

2. Download the OpenAI's Whisper model converted to ggml format from [here](https://huggingface.co/ggerganov/whisper.cpp).

3. Rename the `.env.example` file to `.env` and edit it with your configuration (make sure to edit the `WHISPER_LOCAL_MODEL_PATH` parameter with the path of the downloaded Whisper model).

4. Build and start the application: `npm install && npm run build && npm start`.

5. Open the following URL in your browser: http://localhost:8080.

6. Scan the QR code using the WhatsApp mobile app to authenticate.

7. Test the application by sending a voice message and check the transcribed text.