// POST /api/submit — 참가자 '자기 예측'만 저장. (정답은 절대 여기로 오지 않음)
// 방(room)별로 분리 저장: p/<room>/<이름해시>.json, 재제출 시 덮어쓰기 = 마지막 제출 우선.
import { put } from '@vercel/blob';
import { createHash } from 'node:crypto';

const SALT = 'mbq_s7f3K9pQ2xL8vR4tD1nW6yZ0aH5cJ';
const okRoom = (r) => typeof r === 'string' && /^[a-z0-9_-]{1,32}$/.test(r);
const keyFor = (room, name) =>
  `p/${room}/` + createHash('sha256').update(SALT + '|' + room + '|' + name).digest('hex') + '.json';

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) { try { return JSON.parse(req.body); } catch { return null; } }
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (!chunks.length) return null;
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const body = await readJson(req);
    const room = body && body.room;
    const name = body && typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
    const guessesIn = body && body.guesses && typeof body.guesses === 'object' ? body.guesses : null;
    if (!okRoom(room)) return res.status(400).json({ error: 'bad_room' });
    if (!name || !guessesIn) return res.status(400).json({ error: 'bad_request' });

    const guesses = {};
    for (const k of Object.keys(guessesIn).slice(0, 40)) {
      const v = guessesIn[k];
      if (typeof k === 'string' && typeof v === 'string' && v) guesses[k.slice(0, 40)] = v.slice(0, 40);
    }

    const payload = JSON.stringify({ room, name, guesses, ts: Date.now() });
    await put(keyFor(room, name), payload, {
      access: 'public',
      contentType: 'application/json; charset=utf-8',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
