/**
 * 가리봉2구역 관리자 감사 로그 Worker
 * - POST /api/audit : 로그인 이벤트 기록 (서버가 실제 IP·국가 자동 기록)
 * - GET  /api/audit : 기록 조회 (AUDIT_SECRET 필요)
 *
 * 바인딩:
 *   KV namespace : AUDIT
 *   Secret       : AUDIT_SECRET   (조회용 비밀키)
 *   Var          : ALLOWED_ORIGINS (쉼표구분 허용 출처)
 */

const KV_KEY = 'log';
const MAX_ENTRIES = 300;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/api/audit') {
      return json({ error: 'not found' }, 404, cors);
    }

    if (request.method === 'POST') return handlePost(request, env, cors);
    if (request.method === 'GET')  return handleGet(request, env, cors);
    return json({ error: 'method not allowed' }, 405, cors);
  }
};

// 로그인 이벤트 기록
async function handlePost(request, env, cors) {
  let body = {};
  try { body = await request.json(); } catch (e) {}

  const entry = {
    ts: Date.now(),
    ip: request.headers.get('CF-Connecting-IP') || '알 수 없음',
    country: (request.cf && request.cf.country) || '',
    city: (request.cf && request.cf.city) || '',
    role: String(body.role || '-').slice(0, 16),
    ok: !!body.ok,
    device: String(body.device || '').slice(0, 80)
  };

  let log = [];
  try { log = JSON.parse((await env.AUDIT.get(KV_KEY)) || '[]'); } catch (e) {}
  log.unshift(entry);
  log = log.slice(0, MAX_ENTRIES);
  await env.AUDIT.put(KV_KEY, JSON.stringify(log));

  return json({ ok: true }, 200, cors);
}

// 기록 조회 (비밀키 필요)
async function handleGet(request, env, cors) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!env.AUDIT_SECRET || token !== env.AUDIT_SECRET) {
    return json({ error: 'unauthorized' }, 401, cors);
  }
  let log = [];
  try { log = JSON.parse((await env.AUDIT.get(KV_KEY)) || '[]'); } catch (e) {}
  return json({ log }, 200, cors);
}

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const allow = allowed.includes(origin) ? origin : (allowed[0] || '*');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
  });
}
