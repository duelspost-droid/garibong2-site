/**
 * 가리봉2구역 관리자 백엔드 Worker (비밀번호 KV 관리)
 *
 * 비밀번호는 KV(key='pw')에 저장 → 관리자페이지에서 변경 가능.
 * KV에 값이 없으면 최초 1회 env.ADMIN_PW / env.STAFF_PW(Secret)로 부트스트랩.
 *
 * 엔드포인트
 *   POST /api/login    : { password } → { ok, role }
 *   POST /api/password : { target:'admin'|'staff', newPassword }  (슈퍼만, 헤더 X-Admin-Pw)
 *   GET  /api/gh?path= : 파일 읽기 | PUT /api/gh : 파일 쓰기
 *   POST /api/audit    : 로그인 이벤트 기록 | GET /api/audit : 조회(슈퍼)
 *
 * 바인딩: KV=AUDIT, Secret=GH_TOKEN, ADMIN_PW, STAFF_PW / Var=GH_REPO, ALLOWED_ORIGINS
 */

const KV_LOG  = 'log';
const KV_PW   = 'pw';
const KV_PERM = 'perms';
// 감사기록은 영구 보관 (삭제·덮어쓰기 없음). 안전장치로 매우 큰 상한만 둠.
const MAX_ENTRIES = 50000;

// 일반 관리자 권한 (세부) — 기본값 모두 허용
async function getPerms(env) {
  let p = {};
  try { p = JSON.parse((await env.AUDIT.get(KV_PERM)) || '{}'); } catch (e) {}
  const c = p.content || {}, s = p.stats || {};
  return {
    notices: p.notices !== false,
    content: {
      hero:     c.hero     !== false,
      about:    c.about    !== false,
      greeting: c.greeting !== false,
      visual:   c.visual   !== false,
      officers: c.officers !== false,
      contact:  c.contact  !== false
    },
    stats: { visits: s.visits !== false, audit: s.audit !== false }
  };
}
function contentAny(perms) { return Object.values(perms.content).some(Boolean); }

const ALLOW_PATHS = [
  /^notices\.json$/,
  /^content\.json$/,
  /^chairman_[A-Za-z0-9_-]+\.(png|jpe?g)$/,
  /^visual_(map|render)_[A-Za-z0-9_-]+\.(png|jpe?g)$/
];
function pathAllowed(p) { return typeof p === 'string' && ALLOW_PATHS.some(re => re.test(p)); }

// 현재 비밀번호 (KV 우선, 없으면 Secret 부트스트랩)
async function getPasswords(env) {
  let pw = {};
  try { pw = JSON.parse((await env.AUDIT.get(KV_PW)) || '{}'); } catch (e) {}
  return {
    admin: pw.admin || env.ADMIN_PW || '',
    staff: pw.staff || env.STAFF_PW || ''
  };
}
async function roleFor(pw, env) {
  if (!pw) return null;
  const p = await getPasswords(env);
  if (p.admin && pw === p.admin) return 'super';
  if (p.staff && pw === p.staff) return 'staff';
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
      const role = await roleFor(String(body.password || ''), env);
      if (!role) return json({ ok: false }, 401, cors);
      const perms = await getPerms(env);
      return json({ ok: true, role, perms }, 200, cors);
    }

    if (url.pathname === '/api/password' && request.method === 'POST') {
      return changePassword(request, env, cors);
    }

    if (url.pathname === '/api/perms') {
      if (request.method === 'GET')  return permsGet(request, env, cors);
      if (request.method === 'POST') return permsSet(request, env, cors);
      return json({ error: 'method not allowed' }, 405, cors);
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

// 비밀번호 변경 (슈퍼만)
async function changePassword(request, env, cors) {
  const role = await roleFor(request.headers.get('X-Admin-Pw') || '', env);
  if (role !== 'super') return json({ error: 'unauthorized' }, 401, cors);
  let body = {}; try { body = await request.json(); } catch (e) {}
  const target = body.target === 'staff' ? 'staff' : (body.target === 'admin' ? 'admin' : null);
  const np = String(body.newPassword || '');
  if (!target) return json({ error: 'invalid target' }, 400, cors);
  if (np.length < 6) return json({ error: 'too short' }, 400, cors);
  const p = await getPasswords(env);
  p[target] = np;
  await env.AUDIT.put(KV_PW, JSON.stringify(p));
  return json({ ok: true }, 200, cors);
}

// 일반 관리자 권한 조회/설정 (슈퍼만)
async function permsGet(request, env, cors) {
  const role = await roleFor(request.headers.get('X-Admin-Pw') || '', env);
  if (role !== 'super') return json({ error: 'unauthorized' }, 401, cors);
  return json({ perms: await getPerms(env) }, 200, cors);
}
async function permsSet(request, env, cors) {
  const role = await roleFor(request.headers.get('X-Admin-Pw') || '', env);
  if (role !== 'super') return json({ error: 'unauthorized' }, 401, cors);
  let body = {}; try { body = await request.json(); } catch (e) {}
  const c = body.content || {}, s = body.stats || {};
  const perms = {
    notices: !!body.notices,
    content: { hero:!!c.hero, about:!!c.about, greeting:!!c.greeting, visual:!!c.visual, officers:!!c.officers, contact:!!c.contact },
    stats: { visits:!!s.visits, audit:!!s.audit }
  };
  await env.AUDIT.put(KV_PERM, JSON.stringify(perms));
  return json({ ok: true, perms }, 200, cors);
}

async function handleGh(request, env, cors, url) {
  const role = await roleFor(request.headers.get('X-Admin-Pw') || '', env);
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
    // 일반 관리자: 슈퍼가 설정한 권한에 따라 허용
    if (role === 'staff') {
      const perms = await getPerms(env);
      const isNotices = (path === 'notices.json');
      if (isNotices && !perms.notices)      return json({ error: 'no permission (notices)' }, 403, cors);
      if (!isNotices && !contentAny(perms)) return json({ error: 'no permission (content)' }, 403, cors);
    }
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
    action: String(body.action || '로그인').slice(0, 40),
    device: String(body.device || '').slice(0, 80)
  };
  let log = [];
  try { log = JSON.parse((await env.AUDIT.get(KV_LOG)) || '[]'); } catch (e) {}
  log.unshift(entry);
  log = log.slice(0, MAX_ENTRIES);
  await env.AUDIT.put(KV_LOG, JSON.stringify(log));
  return json({ ok: true }, 200, cors);
}

async function auditGet(request, env, cors) {
  const role = await roleFor(request.headers.get('X-Admin-Pw') || '', env);
  if (!role) return json({ error: 'unauthorized' }, 401, cors);
  if (role === 'staff') {
    const perms = await getPerms(env);
    if (!perms.stats.audit) return json({ error: 'unauthorized' }, 401, cors);
  }
  let log = [];
  try { log = JSON.parse((await env.AUDIT.get(KV_LOG)) || '[]'); } catch (e) {}
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
