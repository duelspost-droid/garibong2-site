/**
 * 가리봉2구역 관리자 백엔드 Worker
 *
 * [감사 로그]
 *   POST /api/audit : 로그인 이벤트 기록 (서버가 실제 IP·국가 자동 기록)
 *   GET  /api/audit : 기록 조회 (AUDIT_SECRET 필요)
 *
 * [GitHub 토큰 프록시 — 토큰 숨기기]
 *   GET  /api/gh?path=<file> : 저장소 파일 읽기
 *   PUT  /api/gh             : 저장소 파일 쓰기 {path, content(base64), message, sha?}
 *   (요청 헤더 X-Proxy-Key 가 PROXY_KEY 와 일치해야 함)
 *
 * 바인딩:
 *   KV namespace : AUDIT
 *   Secret       : AUDIT_SECRET   (감사 조회용)
 *   Secret       : GH_TOKEN       (GitHub PAT — 브라우저에 노출 안 됨)
 *   Secret       : PROXY_KEY      (관리자 앱이 프록시 호출 시 사용)
 *   Var          : GH_REPO        (예: duelspost-droid/garibong2-site)
 *   Var          : ALLOWED_ORIGINS
 */

const KV_KEY = 'log';
const MAX_ENTRIES = 300;

// 프록시로 읽기/쓰기 허용할 경로 (화이트리스트)
const ALLOW_PATHS = [
  /^notices\.json$/,
  /^content\.json$/,
  /^chairman_[A-Za-z0-9_-]+\.(png|jpe?g)$/,
  /^visual_(map|render)_[A-Za-z0-9_-]+\.(png|jpe?g)$/
];
function pathAllowed(p) { return typeof p === 'string' && ALLOW_PATHS.some(re => re.test(p)); }

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);

    if (url.pathname === '/api/audit') {
      if (request.method === 'POST') return handlePost(request, env, cors);
      if (request.method === 'GET')  return handleGet(request, env, cors);
      return json({ error: 'method not allowed' }, 405, cors);
    }

    if (url.pathname === '/api/gh') {
      return handleGh(request, env, cors, url);
    }

    return json({ error: 'not found' }, 404, cors);
  }
};

/* ───────── 감사 로그 ───────── */
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

async function handleGet(request, env, cors) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.AUDIT_SECRET || token !== env.AUDIT_SECRET) return json({ error: 'unauthorized' }, 401, cors);
  let log = [];
  try { log = JSON.parse((await env.AUDIT.get(KV_KEY)) || '[]'); } catch (e) {}
  return json({ log }, 200, cors);
}

/* ───────── GitHub 토큰 프록시 ───────── */
async function handleGh(request, env, cors, url) {
  // 프록시 키 검증
  const key = request.headers.get('X-Proxy-Key') || '';
  if (!env.PROXY_KEY || key !== env.PROXY_KEY) return json({ error: 'unauthorized' }, 401, cors);
  if (!env.GH_TOKEN || !env.GH_REPO) return json({ error: 'server not configured' }, 500, cors);

  const ghHeaders = {
    'Authorization': `Bearer ${env.GH_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'garibong2-admin-worker',
    'Content-Type': 'application/json'
  };
  const api = (p) => `https://api.github.com/repos/${env.GH_REPO}/contents/${p}`;

  if (request.method === 'GET') {
    const path = url.searchParams.get('path') || '';
    if (!pathAllowed(path)) return json({ error: 'path not allowed' }, 403, cors);
    const r = await fetch(api(path), { headers: ghHeaders });
    const data = await r.text();
    return new Response(data, { status: r.status, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  if (request.method === 'PUT') {
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const { path, content, message, sha } = body;
    if (!pathAllowed(path)) return json({ error: 'path not allowed' }, 403, cors);
    if (typeof content !== 'string') return json({ error: 'content required' }, 400, cors);
    const payload = { message: message || 'update via admin', content };
    if (sha) payload.sha = sha;
    const r = await fetch(api(path), { method: 'PUT', headers: ghHeaders, body: JSON.stringify(payload) });
    const data = await r.text();
    return new Response(data, { status: r.status, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  return json({ error: 'method not allowed' }, 405, cors);
}

/* ───────── 공통 ───────── */
function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const allow = allowed.includes(origin) ? origin : (allowed[0] || '*');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Proxy-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}
