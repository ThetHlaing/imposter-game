import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';

const port = 43000 + Math.floor(Math.random() * 1000);
const origin = `http://127.0.0.1:${port}`;
let server;

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(origin);

      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error('Local server did not start');
}

test.before(async () => {
  server = spawn(process.execPath, ['server.mjs'], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore'
  });

  await waitForServer();
});

test.after(async () => {
  server.kill('SIGTERM');
  await once(server, 'exit');
});

test('serves the app shell and client-side routes', async () => {
  const [home, onboarding, gameStart] = await Promise.all([
    fetch(`${origin}/`),
    fetch(`${origin}/onboarding`),
    fetch(`${origin}/game-start`)
  ]);

  assert.equal(home.status, 200);
  assert.equal(onboarding.status, 200);
  assert.equal(gameStart.status, 200);
  assert.match(await home.text(), /Wasaner Lingara/);
  assert.match(await onboarding.text(), /id="root"/);
  assert.match(await gameStart.text(), /index-DdOQBGbF\.js/);
});

test('serves the bundled font, artwork, audio, and manifest', async () => {
  const responses = await Promise.all([
    fetch(`${origin}/assets/handwrittenFont-DtlvqAUG.ttf`),
    fetch(`${origin}/assets/onboarding-Illustration-1-DBJJ5kia.svg`),
    fetch(`${origin}/assets/background_sound-DvNttxtF.mp3`),
    fetch(`${origin}/manifest.webmanifest`)
  ]);

  for (const response of responses) {
    assert.equal(response.status, 200);
  }

  assert.match(responses[0].headers.get('content-type'), /font\/ttf/);
  assert.match(responses[1].headers.get('content-type'), /image\/svg\+xml/);
  assert.match(responses[2].headers.get('content-type'), /audio\/mpeg/);
  assert.match(responses[3].headers.get('content-type'), /application\/manifest\+json/);
});
