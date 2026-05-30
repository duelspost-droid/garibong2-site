# 가리봉2구역 감사 로그 백엔드 (Cloudflare Worker)

모든 기기의 관리자 로그인을 **한곳에 모아** 보고, **서버에서 실제 IP·국가**를 기록합니다.
무료 플랜으로 충분합니다.

---

## 1. 사전 준비 (직접 하실 부분)

1. **Cloudflare 무료 가입**: https://dash.cloudflare.com/sign-up
2. **Node.js 설치** (이미 있으면 생략): https://nodejs.org

---

## 2. 배포 단계

터미널(PowerShell)에서 이 폴더(`cloudflare-worker`)로 이동 후:

```powershell
# 2-1. Wrangler 설치
npm install -g wrangler

# 2-2. Cloudflare 로그인 (브라우저 인증창이 뜹니다)
wrangler login

# 2-3. KV 네임스페이스 생성 → 출력되는 id 복사
wrangler kv namespace create AUDIT
#  예) id = "abcd1234..."  → wrangler.toml 의 PASTE_KV_NAMESPACE_ID_HERE 에 붙여넣기

# 2-4. 조회용 비밀키 설정 (강력한 임의 문자열 입력)
wrangler secret put AUDIT_SECRET
#  예) garibong-audit-7K9x2p... (이 값을 관리자페이지에 입력하게 됩니다)

# 2-5. 배포
wrangler deploy
```

배포가 끝나면 이런 주소가 출력됩니다:
```
https://garibong2-audit.<당신의계정>.workers.dev
```

---

## 3. 관리자페이지 연동

1. 관리자페이지 → **⚙️ 설정** → **"☁️ 감사 로그 백엔드"** 카드
2. **Worker 주소**: 위에서 받은 `https://....workers.dev` 입력
3. **조회 비밀키**: 2-4에서 설정한 `AUDIT_SECRET` 값 입력
4. 저장

→ 이후 모든 로그인(이 기기·다른 기기·낯선 기기 포함)이 중앙에 기록되고,
   **📊 통계·기록** 탭에서 **실제 IP·국가·기기·시각**을 모두 볼 수 있습니다.

---

## 4. 동작 방식 & 보안

- **POST /api/audit**: 로그인 시 이벤트 전송 → Worker가 **접속자의 실제 공인 IP**(`CF-Connecting-IP`)와 국가를 서버에서 기록 (위조 불가)
- **GET /api/audit**: `AUDIT_SECRET` 을 아는 사람만 조회 가능 → IP 목록이 외부에 노출되지 않음
- 비밀키는 **코드/저장소에 저장되지 않고** Cloudflare Secret + 관리자 브라우저에만 존재
- 기록은 최근 300건 유지

---

## 5. (선택) 더 강력한 보안 — GitHub 토큰 숨기기

다음 단계로, 이 Worker에 **GitHub 토큰을 Secret으로 보관**하고 모든 쓰기를 Worker를 통하게 하면,
브라우저에서 토큰이 완전히 사라져 보안이 크게 강화됩니다. 필요하면 요청해 주세요.
