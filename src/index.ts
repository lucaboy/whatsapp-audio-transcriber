import express from 'express';
import { config } from 'dotenv';
import WAWebJS, { Client, LocalAuth } from 'whatsapp-web.js';
import QRCode from 'qrcode';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import { decode } from 'node-wav';
import { Whisper, manager } from "smart-whisper";
import moment from 'moment';

config();
const port = process.env.PORT || 8080;
const transcriptionReaction = process.env.TRANSCRIPTION_REACTION || '🤖';
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

// TODO: Use Server-Sent Events (SSE) to update the QR code in real-time
app.get('/', async (req, res) => {
    return client.getState().then((state) => {
        if (state === 'CONNECTED') {
            return res.send('Connected. You can close this page.');
        }  else if (qrCode) {
            return res.send(`<img src="${qrCode}" />`);
        }
        return res.send('QR code not available yet. Refresh the page.');
    }).catch((error) => {
        console.error(error);
        return res.send('QR code not available yet. Refresh the page.');
    });
});

app.listen(port);

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: [
            '--no-sandbox'
        ],
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2407.1.html'
    }
});

client.on('qr', async (qrCodeData) => {
    qrCode = await QRCode.toDataURL(qrCodeData);
});

client.on('message_reaction', async reaction => {
    if (
        !reaction.id.fromMe || 
        reaction.reaction !== transcriptionReaction || 
        moment.unix(reaction.timestamp).isBefore(moment().subtract(2, 'minutes'))
    ) {
        return;
    }

    var message: WAWebJS.Message | undefined;

    var numberOfTries = 0;

    while (numberOfTries < 30) {
        try {
            message = await client.getMessageById(reaction.msgId._serialized);
            break;
        } catch (error) {
            console.log(error);
            numberOfTries++;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    if (whisper && message?.type === 'ptt') {
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
                    message!.reply(`[WA-TRANSCRIBER-BOT] ${transcription}`);
                }
            });
    }
});

client.initialize();