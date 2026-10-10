export function readSettings(env: NodeJS.ProcessEnv = process.env) {
    const port = Number(env.PORT || 8080);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('PORT must be an integer between 1 and 65535.');
    }
    if (env.USE_GPU && !['true', 'false'].includes(env.USE_GPU)) {
        throw new Error('USE_GPU must be true or false.');
    }
    return {
        host: env.HOST || '127.0.0.1',
        port,
        reaction: env.TRANSCRIPTION_REACTION || '🤖',
        gpu: env.USE_GPU === 'true',
        model: env.WHISPER_MODEL || 'large-v3-turbo',
        modelPath: env.WHISPER_LOCAL_MODEL_PATH?.trim() || undefined,
        language: env.TRANSCRIPTION_LANGUAGE || 'auto',
        ffmpegPath: env.FFMPEG_PATH || 'ffmpeg',
    };
}
