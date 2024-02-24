import express from 'express';
import { config } from 'dotenv';
import { Client, LocalAuth } from 'whatsapp-web.js';
import QRCode from 'qrcode';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import { decode } from 'node-wav';
import { Whisper, manager } from "smart-whisper";

config();
const port = process.env.PORT || 8080;
const transcribeSentVoiceMessages = process.env.TRANSCRIBE_SENT_VOICE_MESSAGES === 'true';
const useGPU = process.env.USE_GPU === 'true';
const whisperModel = process.env.WHISPER_MODEL || 'medium';
const whisperLocalModelPath = process.env.WHISPER_LOCAL_MODEL_PATH;
const transcriptionLanguage = process.env.TRANSCRIPTION_LANGUAGE || 'auto';

const whisperOptions = {
    gpu: useGPU
};

var whisper: Whisper;
if (whisperLocalModelPath && fs.existsSync(whisperLocalModelPath)) {
    whisper = new Whisper(whisperLocalModelPath, whisperOptions);
} else if (manager.check(whisperModel)) {
    whisper = new Whisper(manager.resolve(whisperModel), whisperOptions);
} else {
    manager.download(whisperModel).then(() => {
        whisper = new Whisper(manager.resolve(whisperModel), whisperOptions);
    });
}

fs.mkdirSync('./tmp/audio', { recursive: true });

var qrCode: string;

const app = express();

app.get('/', async (req, res) => {
    const clientState = await client.getState();
    if (clientState === "CONNECTED") {
        return res.send('Connected');
    }  else if (qrCode) {
        return res.send(`<img src="${qrCode}" />`);
    }
    res.send(clientState);
});

app.listen(port);

const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', async (qrCodeData) => {
    qrCode = await QRCode.toDataURL(qrCodeData);
});

client.on(transcribeSentVoiceMessages ? 'message_create' : 'message', async message => {
    if (whisper && message.type === 'ptt') {
        const audio = await message.downloadMedia();
        const filePathWithoutExtension = `./tmp/audio/${Date.now()}`;
        fs.writeFileSync(`${filePathWithoutExtension}.ogg`, audio.data, 'base64');
        ffmpeg(`${filePathWithoutExtension}.ogg`)
            .audioFrequency(16000)
            .toFormat('wav')
            .save(`${filePathWithoutExtension}.wav`)
            .on('end', async () => {
                const { channelData } = decode(fs.readFileSync(`${filePathWithoutExtension}.wav`));
                const pcm = channelData[0];
                fs.unlinkSync(`${filePathWithoutExtension}.ogg`);
                fs.unlinkSync(`${filePathWithoutExtension}.wav`);

                const task = await whisper.transcribe(pcm, { language: transcriptionLanguage });
                const transcription = (await task.result).map((result) => result.text).join(' ');
                if (transcription) {
                    message.reply(`[WA-BOT] Trascrizione: ${transcription}`);
                }
            });
    }
});

client.initialize();