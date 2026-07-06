// GET /api/data?room=X — 해당 방의 저장된 '예측'을 모두 반환. (채점은 운영자 브라우저에서 수행)
// 정답은 이 서버에 존재하지 않으며 여기서 어떤 대조도 하지 않는다.
import { list } from '@vercel/blob';

const okRoom = (r) => typeof r === 'string' && /^[a-z0-9_-]{1,32}$/.test(r);

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const room = (req.query && req.query.room) || '';
  if (!okRoom(room)) return res.status(400).json({ error: 'bad_room' });
  try {
    const out = [];
    let cursor;
    do {
      const r = await list({ prefix: `p/${room}/`, limit: 1000, cursor });
      for (const b of r.blobs) {
        try {
          const bust = (b.url.includes('?') ? '&' : '?') + 'v=' + Date.now();
          const resp = await fetch(b.url + bust, { cache: 'no-store' });
          if (resp.ok) {
            const j = await resp.json();
            if (j && j.name) out.push(j);
          }
        } catch { /* skip broken blob */ }
      }
      cursor = r.cursor;
    } while (cursor);

    // 혹시 모를 중복은 이름 기준 마지막 제출만 유지
    const byName = {};
    for (const s of out) {
      if (!byName[s.name] || (s.ts || 0) > (byName[s.name].ts || 0)) byName[s.name] = s;
    }
    const submissions = Object.values(byName);
    return res.status(200).json({ room, count: submissions.length, submissions });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
