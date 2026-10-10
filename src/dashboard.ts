import express from 'express';

export interface DashboardState {
    status: 'starting' | 'qr' | 'authenticated' | 'ready' | 'disconnected' | 'error';
    qr?: string;
}

export function createDashboard(getState: () => DashboardState) {
    const app = express();
    app.disable('x-powered-by');
    app.use((_req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });
    app.get('/status', (_req, res) => res.json(getState()));
    app.get('/', (_req, res) => res.type('html').send(page));
    return app;
}

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WhatsApp Audio Transcriber</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,sans-serif;background:#0b1220;color:#e8eef8}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at top,#173245,transparent 65%)}main{width:min(100%,520px);padding:40px;border:1px solid #2b3c50;border-radius:24px;background:#111c2c;box-shadow:0 24px 80px #0005}.tag{color:#70e3c0;font-size:12px;letter-spacing:2px;font-weight:700}h1{font-size:34px;line-height:1.15;letter-spacing:-1px;margin:18px 0}p{line-height:1.6;color:#aebece}#qr{display:block;width:min(100%,280px);height:auto;border-radius:14px;margin:24px auto;background:white}#qr[hidden]{display:none}.status{display:inline-block;padding:7px 12px;background:#213849;border-radius:100px;color:#bdeedb;font-size:13px}footer{border-top:1px solid #2b3c50;margin-top:28px;padding-top:20px;font-size:13px;color:#8fa4b8}
</style></head><body><main>
<div class="tag">VOICE TO TEXT · LOCAL INFERENCE</div>
<h1>WhatsApp Audio<br>Transcriber</h1>
<span id="status" class="status" role="status" aria-live="polite">Starting</span>
<p id="help">Preparing your transcription model and WhatsApp connection.</p>
<img id="qr" alt="Scan this QR code from WhatsApp Linked devices" hidden>
<footer>Your voice notes are transcribed on this computer. Replies are sent to the original WhatsApp chat.</footer>
</main><script>
const messages={starting:['Starting','Preparing your transcription model and WhatsApp connection.'],qr:['Link your account','In WhatsApp, open Settings → Linked devices → Link a device, then scan this code.'],authenticated:['Connecting','Account linked. Waiting for WhatsApp to finish loading.'],ready:['Connected','Ready. React to a voice note with your configured emoji (🤖 by default). You can close this page.'],disconnected:['Disconnected','The WhatsApp session has ended. Restart the app to connect again.'],error:['Something went wrong','Check the terminal for details, then restart the app.']};
async function refresh(){try{const response=await fetch('/status',{cache:'no-store'});if(!response.ok)throw new Error('Unavailable');const state=await response.json();const message=messages[state.status]||messages.starting;document.getElementById('status').textContent=message[0];document.getElementById('help').textContent=message[1];const qr=document.getElementById('qr');qr.hidden=!state.qr;if(state.qr)qr.src=state.qr;else qr.removeAttribute('src');}catch{document.getElementById('status').textContent='App unavailable';document.getElementById('help').textContent='Make sure the app is running, then keep this page open to reconnect.';document.getElementById('qr').hidden=true;}finally{setTimeout(refresh,2000);}}refresh();
</script></body></html>`;
