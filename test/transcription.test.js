const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readdir, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { shouldTranscribe, TranscriptionQueue, decodeVoiceNote } = require('../dist/transcription');
const { readSettings } = require('../dist/settings');
const { createDashboard } = require('../dist/dashboard');
const run = promisify(execFile);
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';

test('accepts only a recent matching reaction from the linked account', () => {
    const event = { id: { fromMe: true }, reaction: '🤖', timestamp: 1000 };
    assert.equal(shouldTranscribe(event, '🤖', 1_030_000), true);
    assert.equal(shouldTranscribe({ ...event, id: { fromMe: false } }, '🤖', 1_030_000), false);
    assert.equal(shouldTranscribe({ ...event, reaction: '👍' }, '🤖', 1_030_000), false);
    assert.equal(shouldTranscribe(event, '🤖', 1_121_000), false);
    assert.equal(shouldTranscribe(event, '🤖', 999_000), false);
});

test('serializes inference and deduplicates pending events', async () => {
    const queue = new TranscriptionQueue();
    const calls = [];
    let finish;
    const gate = new Promise(resolve => { finish = resolve; });
    const first = queue.enqueue('one', async () => { calls.push('start'); await gate; calls.push('end'); });
    const duplicate = queue.enqueue('one', async () => { calls.push('duplicate'); });
    const second = queue.enqueue('two', async () => { calls.push('second'); });
    assert.equal(first, duplicate);
    await Promise.resolve();
    assert.deepEqual(calls, ['start']);
    finish();
    await Promise.all([first, second]);
    assert.deepEqual(calls, ['start', 'end', 'second']);
});

test('a failed job does not block later jobs or a retry of the same message', async () => {
    const queue = new TranscriptionQueue();
    const failed = queue.enqueue('one', async () => { throw new Error('conversion failed'); });
    let completed = false;
    const next = queue.enqueue('two', async () => { completed = true; });
    await assert.rejects(failed, /conversion failed/);
    await next;
    assert.equal(completed, true);
    await queue.enqueue('one', async () => {});
});

test('bounds queued work while an inference is running', async () => {
    const queue = new TranscriptionQueue();
    let finish;
    const gate = new Promise(resolve => { finish = resolve; });
    const jobs = Array.from({ length: 20 }, (_, i) => queue.enqueue(String(i), () => gate));
    await assert.rejects(queue.enqueue('overflow', async () => {}), /queue is full/);
    finish();
    await Promise.all(jobs);
});

test('validates configuration and defaults to a local dashboard and automatic model download', () => {
    const settings = readSettings({});
    assert.equal(settings.host, '127.0.0.1');
    assert.equal(settings.model, 'large-v3-turbo');
    assert.equal(settings.modelPath, undefined);
    assert.equal(readSettings({ WHISPER_LOCAL_MODEL_PATH: ' ' }).modelPath, undefined);
    assert.throws(() => readSettings({ PORT: 'oops' }), /PORT/);
    assert.throws(() => readSettings({ PORT: '65536' }), /PORT/);
    assert.throws(() => readSettings({ USE_GPU: 'yes' }), /USE_GPU/);
});

test('FFmpeg normalizes stereo Opus into mono 16 kHz PCM and cleans temporary files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wa-transcriber-test-'));
    try {
        const input = path.join(root, 'sample.ogg');
        await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', '-ac', '2', '-ar', '48000', '-c:a', 'libopus', input]);
        const audioRoot = path.join(root, 'audio');
        const pcm = await decodeVoiceNote((await readFile(input)).toString('base64'), ffmpeg, audioRoot);
        assert.ok(pcm instanceof Float32Array);
        assert.ok(pcm.length >= 3000 && pcm.length <= 3400);
        assert.ok(pcm.some(sample => sample !== 0));
        assert.deepEqual(await readdir(audioRoot), []);
    } finally { await rm(root, { recursive: true, force: true }); }
});

test('conversion failures remove temporary audio and reject without hanging', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wa-transcriber-error-'));
    try {
        await assert.rejects(decodeVoiceNote(Buffer.from('not audio').toString('base64'), ffmpeg, root));
        assert.deepEqual(await readdir(root), []);
        await assert.rejects(decodeVoiceNote('AA==', path.join(root, 'missing-ffmpeg'), root), /ENOENT/);
        assert.deepEqual(await readdir(root), []);
    } finally { await rm(root, { recursive: true, force: true }); }
});

test('dashboard serves live state without caching QR credentials', async () => {
    let state = { status: 'qr', qr: 'data:image/png;base64,example' };
    const server = createDashboard(() => state).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    try {
        const response = await fetch(`${url}/status`);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(await response.json(), state);
        state = { status: 'ready' };
        assert.deepEqual(await (await fetch(`${url}/status`)).json(), { status: 'ready' });
        assert.match(await (await fetch(url)).text(), /WhatsApp Audio Transcriber/);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
