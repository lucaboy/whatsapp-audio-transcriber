import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { decode } from 'node-wav';

const run = promisify(execFile);

export interface ReactionEvent {
    id: { fromMe: boolean };
    reaction: string;
    timestamp: number;
}

export function shouldTranscribe(event: ReactionEvent, emoji: string, now = Date.now()): boolean {
    const age = now - event.timestamp * 1000;
    return event.id.fromMe && event.reaction === emoji && age >= 0 && age <= 120_000;
}

// One inference at a time; repeated events for the same message share the active job.
export class TranscriptionQueue {
    private tail: Promise<void> = Promise.resolve();
    private jobs = new Map<string, Promise<void>>();

    enqueue(key: string, task: () => Promise<void>): Promise<void> {
        const existing = this.jobs.get(key);
        if (existing) return existing;
        if (this.jobs.size >= 20) return Promise.reject(new Error('Transcription queue is full. Try again later.'));
        const job = this.tail.then(task).finally(() => this.jobs.delete(key));
        this.jobs.set(key, job);
        this.tail = job.catch(() => undefined);
        return job;
    }
}

export async function decodeVoiceNote(
    base64: string,
    ffmpegPath = 'ffmpeg',
    audioDirectory = path.resolve('tmp/audio'),
): Promise<Float32Array> {
    await mkdir(audioDirectory, { recursive: true });
    const directory = await mkdtemp(path.join(audioDirectory, 'voice-'));
    const input = path.join(directory, 'input.ogg');
    const output = path.join(directory, 'output.wav');
    try {
        await writeFile(input, Buffer.from(base64, 'base64'));
        await run(ffmpegPath, [
            '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
            '-i', input, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', output,
        ], { timeout: 120_000, maxBuffer: 1024 * 1024 });
        const audio = decode(await readFile(output));
        if (audio.sampleRate !== 16000 || !audio.channelData[0]?.length) {
            throw new Error('Audio conversion did not produce valid 16 kHz PCM.');
        }
        return audio.channelData[0];
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}
