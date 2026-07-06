// GET  /api/roster?room=X — 해당 방의 명단(참가자 닉네임 목록) + 조 이름 반환. (미등록이면 people=null)
// POST /api/roster  { room, name, people[] } — 방의 명단을 저장/수정. rooms/<room>.json = { name, people, ts }
// 정답과 무관한 '참가자 명단'만 다룬다. 방마다 각 조 운영자가 직접 등록.
import { put, list } from '@vercel/blob';

const okRoom = (r) => typeof r === 'string' && /^[a-z0-9_-]{1,32}$/.test(r);
const keyFor = (room) => `rooms/${room}.json`;

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

async function loadRoster(room) {
  const r = await list({ prefix: keyFor(room), limit: 1 });
  const b = r.blobs && r.blobs[0];
  if (!b) return null;
  const bust = (b.url.includes('?') ? '&' : '?') + 'v=' + Date.now();
  const resp = await fetch(b.url + bust, { cache: 'no-store' });
  if (!resp.ok) return null;
  return resp.json();
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (req.method === 'GET') {
      const room = (req.query && req.query.room) || '';
      if (!okRoom(room)) return res.status(400).json({ error: 'bad_room' });
      const data = await loadRoster(room);
      if (!data) return res.status(200).json({ room, name: '', people: null });
      return res.status(200).json({ room, name: data.name || '', people: data.people || null });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const room = body && body.room;
      const name = body && typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
      const peopleIn = body && Array.isArray(body.people) ? body.people : null;
      if (!okRoom(room)) return res.status(400).json({ error: 'bad_room' });
      if (!peopleIn) return res.status(400).json({ error: 'bad_request' });

      // 정리: 문자열화 + trim + 40자 제한 + 빈값 제거 + 중복 제거(입력 순서 유지) + 최대 40명
      const seen = new Set();
      const people = [];
      for (const p of peopleIn) {
        const s = (typeof p === 'string' ? p : String(p == null ? '' : p)).trim().slice(0, 40);
        if (!s || seen.has(s)) continue;
        seen.add(s);
        people.push(s);
        if (people.length >= 40) break;
      }
      if (people.length < 2) return res.status(400).json({ error: 'need_at_least_2' });

      const payload = JSON.stringify({ name, people, ts: Date.now() });
      await put(keyFor(room), payload, {
        access: 'public',
        contentType: 'application/json; charset=utf-8',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
      });
      return res.status(200).json({ ok: true, room, name, people });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
