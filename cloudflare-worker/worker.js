/**
 * 가리봉2구역 관리자 백엔드 Worker (비밀번호 인증 방식)
 *
 * 인증: 요청 헤더 X-Admin-Pw (또는 /api/login 의 body.password) 를
 *       Worker Secret(ADMIN_PW / STAFF_PW) 과 비교 → 역할 결정
 *
 * 엔드포인트
 *   POST /api/login : { password } → { ok, role }  (비밀번호 검증)
 *   GET  /api/gh?path=<file>       : 저장소 파일 읽기
 *   PUT  /api/gh                    : 저장소 파일 쓰기 {path, content(b64), message, sha?}
 *   POST /api/audit                 : 로그인 이벤트 기록 (서버가 실제 IP 기록)
 *   GET  /api/audit                 : 기록 조회 (슈퍼만)
 *
 * 바인딩
 *   KV    : AUDIT
 *   Secret: GH_TOKEN, ADMIN_PW, STAFF_PW
 *   Var   : GH_REPO, ALLOWED_ORIGINS
 */

const KV_KEY = 'log';
const MAX_ENTRIES = 300;

const ALLOW_PATHS = [
  /^notices\.json$/,
  /^content\.json$/,
  /^chairman_[A-Za-z0-9_-]+\.(png|jpe?g)$/,
  /^visual_(map|render)_[A-Za-z0-9_-]+\.(png|jpe?g)$/
];
function pathAllowed(p) { return typeof p === 'string' && ALLOW_PATHS.some(re => re.test(p)); }

// 비밀번호 → 역할
function roleFor(pw, env) {
  if (env.ADMIN_PW && pw === env.ADMIN_PW) return 'super';
  if (env.STAFF_PW && pw === env.STAFF_PW) return 'staff';
  return null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);

    if (url.pathname === '/api/login' && request.method === 'POST') {
      let body = {}; try { body = await request.json(); } catch (e) {}
      const role = roleFor(String(body.password || ''), env);
      if (!role) return json({ ok: false }, 401, cors);
      return json({ ok: true, role }, 200, cors);
    }

    if (url.pathname === '/api/gh') return handleGh(request, env, cors, url);

    if (url.pathname === '/api/audit') {
      if (request.method === 'POST') return auditPost(request, env, cors);
      if (request.method === 'GET')  return auditGet(request, env, cors);
      return json({ error: 'method not allowed' }, 405, cors);
    }

    return json({ error: 'not found' }, 404, cors);
  }
};

async function handleGh(request, env, cors, url) {
  const role = roleFor(request.headers.get('X-Admin-Pw') || '', env);
  if (!role) return json({ error: 'unauthorized' }, 401, cors);
  if (!env.GH_TOKEN || !env.GH_REPO) return json({ error: 'server not configured' }, 500, cors);

  const gh = {
    'Authorization': `Bearer ${env.GH_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'garibong2-admin-worker',
    'Content-Type': 'application/json'
  };
  const api = (p) => `https://api.github.com/repos/${env.GH_REPO}/contents/${p}`;

  if (request.method === 'GET') {
    const path = url.searchParams.get('path') || '';
    if (!pathAllowed(path)) return json({ error: 'path not allowed' }, 403, cors);
    const r = await fetch(api(path), { headers: gh });
    return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  if (request.method === 'PUT') {
    let body = {}; try { body = await request.json(); } catch (e) {}
    const { path, content, message, sha } = body;
    if (!pathAllowed(path)) return json({ error: 'path not allowed' }, 403, cors);
    // 일반 관리자(staff)는 공지(notices.json)만 쓰기 가능 — 서버에서 강제
    if (role === 'staff' && path !== 'notices.json') return json({ error: 'staff cannot edit this file' }, 403, cors);
    if (typeof content !== 'string') return json({ error: 'content required' }, 400, cors);
    const payload = { message: message || 'update via admin', content };
    if (sha) payload.sha = sha;
    const r = await fetch(api(path), { method: 'PUT', headers: gh, body: JSON.stringify(payload) });
    return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json', ...cors } });
  }
  return json({ error: 'method not allowed' }, 405, cors);
}

async function auditPost(request, env, cors) {
  let body = {}; try { body = await request.json(); } catch (e) {}
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

async function auditGet(request, env, cors) {
  const role = roleFor(request.headers.get('X-Admin-Pw') || '', env);
  if (role !== 'super') return json({ error: 'unauthorized' }, 401, cors);
  let log = [];
  try { log = JSON.parse((await env.AUDIT.get(KV_KEY)) || '[]'); } catch (e) {}
  return json({ log }, 200, cors);
}

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const allow = allowed.includes(origin) ? origin : (allowed[0] || '*');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Pw',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}
