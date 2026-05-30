# 웹 대시보드로 배포하기 (Node 설치 불필요)

CLI(wrangler) 없이 **브라우저 클릭만으로** Worker를 배포하는 방법입니다.

---

## 1) Cloudflare 가입·로그인 (본인만 가능)
- https://dash.cloudflare.com/sign-up → 무료 가입 후 로그인

## 2) Worker 만들기
1. 좌측 메뉴 **Workers & Pages** → **Create application** → **Create Worker**
2. 이름: `garibong2-audit` 입력 → **Deploy**
3. 배포되면 **Edit code** 클릭
4. 편집기의 기존 코드를 **전부 지우고**, `worker.js` 파일 내용을 **통째로 복사해 붙여넣기**
5. 우측 상단 **Deploy**

## 3) KV 저장소 만들기
1. 좌측 메뉴 **Storage & Databases** → **KV** → **Create a namespace**
2. 이름: `AUDIT` → 생성

## 4) Worker에 KV 연결
1. **Workers & Pages** → `garibong2-audit` → **Settings** → **Bindings** (또는 Variables)
2. **Add binding** → **KV namespace**
   - Variable name: `AUDIT`
   - KV namespace: 방금 만든 `AUDIT` 선택
3. 저장

## 5) 변수·비밀키 설정
같은 **Settings → Variables and Secrets** 에서:

1. **일반 변수 추가** (Add variable, Plaintext)
   - 이름: `ALLOWED_ORIGINS`
   - 값: `https://garibong2.kro.kr,http://garibong2.kro.kr,https://duelspost-droid.github.io`

2. **비밀키 추가** (Add variable → **Encrypt** / Secret)
   - 이름: `AUDIT_SECRET`
   - 값: (담당자에게 전달받은 비밀키 문자열)

3. 저장 후, 변경사항이 적용되도록 **Deploy** 한 번 더

## 6) Worker 주소 확인
- `garibong2-audit` 워커 상단/Settings에 표시된 주소:
  `https://garibong2-audit.<당신의계정>.workers.dev`

## 7) 관리자페이지 연동
- 관리자 → **⚙️ 설정 → ☁️ 감사 로그 백엔드**
  - Worker 주소: 위 6) 주소
  - 조회 비밀키: 5)-2의 `AUDIT_SECRET`
  - 저장

→ **📊 통계·기록** 탭에서 모든 기기의 로그인이 **실제 IP·국가**와 함께 표시됩니다.

---

## 동작 확인
- 관리자에서 로그아웃 후 다시 로그인 → 통계·기록 탭에 새 기록이 뜨면 성공
- "비밀키가 올바르지 않습니다" → 5)-2 비밀키와 관리자 입력값이 다른 경우. 다시 확인.
