import 'dotenv/config';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import WAWebJS, { Client, LocalAuth } from 'whatsapp-web.js';
import QRCode from 'qrcode';
import { Whisper, manager } from 'smart-whisper';
import { createDashboard, DashboardState } from './dashboard';
import { readSettings } from './settings';
import { decodeVoiceNote, shouldTranscribe, TranscriptionQueue } from './transcription';

async function main() {
    const settings = readSettings();
    let state: DashboardState = { status: 'starting' };
    const app = createDashboard(() => state);
    const server = app.listen(settings.port, settings.host, () => {
        console.log(`Open http://${settings.host}:${settings.port} to link WhatsApp.`);
    });
    server.on('error', (error) => {
        console.error('Dashboard could not start:', error.message);
        process.exit(1);
    });

    const client = new Client({ authStrategy: new LocalAuth() });
    try {
        let modelPath = settings.modelPath;
        if (modelPath) {
            await access(modelPath, constants.R_OK);
        } else {
            if (!manager.check(settings.model)) {
                console.log(`Downloading Whisper model: ${settings.model}`);
                await manager.download(settings.model);
            }
            modelPath = manager.resolve(settings.model);
        }
        const whisper = new Whisper(modelPath, { gpu: settings.gpu });
        await whisper.load();
        const queue = new TranscriptionQueue();

        client.on('qr', (value) => {
            state = { status: 'qr' };
            void QRCode.toDataURL(value).then(qr => {
                if (state.status === 'qr') state = { status: 'qr', qr };
            }).catch(error => console.error('QR generation failed:', error.message));
        });
        client.on('authenticated', () => { state = { status: 'authenticated' }; });
        client.on('ready', () => {
            state = { status: 'ready' };
            console.log(`Ready. React to a voice note with ${settings.reaction}.`);
        });
        client.on('auth_failure', () => {
            state = { status: 'error' };
            console.error('WhatsApp authentication failed. Restart the app to link again.');
        });
        client.on('disconnected', () => {
            state = { status: 'disconnected' };
            console.log('WhatsApp disconnected. Restart the app to reconnect.');
        });
        client.on('message_reaction', reaction => {
            if (!shouldTranscribe(reaction, settings.reaction)) return;
            const id = reaction.msgId._serialized;
            void queue.enqueue(id, async () => {
                const message = await findMessage(client, id);
                if (message.type !== 'ptt') return;
                const media = await message.downloadMedia();
                if (!media?.data) throw new Error('Voice note is unavailable. Try a recent message.');
                const pcm = await decodeVoiceNote(media.data, settings.ffmpegPath);
                const task = await whisper.transcribe(pcm, { language: settings.language });
                const text = (await task.result).map(segment => segment.text.trim()).filter(Boolean).join(' ');
                if (text) await message.reply(`[WA-TRANSCRIBER-BOT] ${text}`);
                else console.log('No speech detected in the voice note.');
            }).catch(error => console.error('Transcription failed:', error.message));
        });

        await client.initialize();
    } catch (error) {
        state = { status: 'error' };
        await client.destroy().catch(() => undefined);
        server.close();
        throw error;
    }
}

async function findMessage(client: Client, id: string): Promise<WAWebJS.Message> {
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const message = await client.getMessageById(id);
            if (message) return message;
        } catch {
            // WhatsApp may deliver the reaction before the message is available locally.
        }
        if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error('Could not retrieve the voice note after five attempts.');
}

void main().catch(error => {
    console.error('Startup failed:', error.message);
    process.exitCode = 1;
});
