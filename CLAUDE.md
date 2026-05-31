# 가리봉2구역재개발정비사업조합 홈페이지 — 프로젝트 가이드

> 이 문서는 향후 작업 시 빠르게 맥락을 잡기 위한 현재 상태 요약입니다.

## 개요
- **목적**: 가리봉2구역재개발정비사업조합 공식 홈페이지 + 관리자 시스템(CMS)
- **호스팅**: GitHub Pages (저장소 `duelspost-droid/garibong2-site`, 브랜치 `master`)
- **배포 방식**: `master`에 push → GitHub Pages 자동 빌드 (보통 1~2분)
- **라이브 주소**
  - 홈페이지: https://garibong2.kro.kr
  - CI 소개: https://garibong2.kro.kr/ci.html
  - 임원소개: https://garibong2.kro.kr/officers.html
  - 관리자: https://garibong2.kro.kr/gb2r-manage-7x9k.html (난독화 URL, robots 차단)

## 기술 스택
- 순수 HTML/CSS/JS (프레임워크 없음), 반응형
- 폰트: **Jua**(브랜드/제목) + **Noto Sans KR**(본문) — Google Fonts
- 콘텐츠는 JSON 파일에 저장하고 JS `fetch`로 동적 로드
- 관리자 백엔드: **Cloudflare Worker** (토큰 은닉 프록시 + 인증 + 감사로그)

---

## 주요 파일
| 파일 | 설명 |
|------|------|
| `index.html` | 홈페이지 (히어로/조합소개/인사말/위치·조감도/공지/사업현황/문의) + 첫 접속 인트로 애니메이션 |
| `officers.html` | 임원 소개 (조합장·감사·이사), content.json 연동 |
| `ci.html` | CI 소개 (의미·레터마크·시그니처·서체·명함·다운로드) |
| `style.css` | 홈페이지 공통 스타일 (반응형, 인트로 애니메이션 포함). 캐시버스트 `?v=` 사용 |
| `content.json` | 홈페이지 모든 텍스트/이미지 경로/임원명단 (관리자에서 편집) |
| `notices.json` | 공지사항 배열 (관리자에서 편집) |
| `gb2r-manage-7x9k.html` | **관리자 페이지** (단일 파일, 인증·CMS·통계·감사로그 전부 포함) |
| `symbol.svg` | CI 심볼 (태양+건물, 원형 엠블럼) |
| `logo-horizontal.svg` / `logo-vertical.svg` | 레터마크 |
| `signature-full.svg` / `signature-compact.svg` | 시그니처 |
| `cards.html` | 명함 미리보기 (앞면 7인 + 뒷면 풀시그니처) |
| `card_files/` | 명함 산출물 (SVG 편집용 / PDF 인쇄용 / JPG) — **PR #2 브랜치에 있음** |
| `cloudflare-worker/` | Worker 코드(`worker.js`) + 배포 가이드(README, DASHBOARD-GUIDE) |
| `robots.txt` | 관리자·unlock 페이지 검색 차단 |
| `unlock.html` | 로그인 잠금(localStorage) 해제용 보조 페이지 |

### 이미지
- `chairman.png`(조합장), `map.png`(위치도), `render.png`(조감도) — 관리자에서 교체 시 `chairman_<ts>.png`, `visual_map_<ts>.png`, `visual_render_<ts>.png` 형태로 새로 업로드되고 content.json이 파일명을 가리킴

---

## 콘텐츠 데이터 구조
- `content.json`: `hero`, `about`, `greeting`(+photo), `visual`(map/render + 텍스트), `officers`(intro/chair_quote/auditors/directors/note), `contact`, `footer`
- `notices.json`: `[{id, badge(new|notice|guide), title, sub, content, date}]`
- 홈페이지 JS가 `?t=` 캐시버스트로 fetch하여 id 기반으로 DOM에 주입. 모든 출력은 `esc()`로 HTML 이스케이프(XSS 방어).

---

## 관리자 시스템 (`gb2r-manage-7x9k.html`)

### 인증 (서버 기반)
- **비밀번호만으로 어느 기기서든 로그인** — Worker `/api/login`이 검증
- 비밀번호는 **Worker KV에 저장**(관리자 페이지에서 변경 가능), 부트스트랩은 Worker Secret `ADMIN_PW`/`STAFF_PW`
- 로그인 비밀번호 = 역할: `ADMIN_PW`→슈퍼, `STAFF_PW`→일반
- 세션: `sessionStorage`(2시간 만료), 로그인 잠금(5회 실패 15분, localStorage)
- **GitHub 토큰은 브라우저에 없음** — Worker `GH_TOKEN` Secret에만 존재

### 탭 구성
1. **공지사항** — 등록/수정/삭제
2. **홈페이지 내용** — 6개 섹션(히어로/조합소개/인사말/위치·조감도/임원소개/문의) + 이미지 업로드
3. **통계·기록** (슈퍼/권한자) — 방문통계(7일/30일/1년/전체) + 관리자 감사기록
4. **설정** (슈퍼) — 비밀번호 변경, 일반 관리자 권한(세부) 설정

### 권한 (슈퍼가 일반 관리자에게 세부 부여)
- 공지사항 / 홈페이지 내용(섹션별 6개) / 통계 보기 / 감사기록 보기
- 서버(Worker)가 강제 — UI 우회 불가

### 감사기록 (관리자 감사기록)
- **모든 작업** 기록: 로그인(성공/실패), 공지 등록·수정·삭제, 홈페이지 내용 저장, 이미지 업로드, 비밀번호·권한 변경
- 각 기록: 일시·계정·작업·**상세 변경내용(detail)**·결과·기기·실제 IP·국가/도시
- **영구 보관**(최대 5만건), 앱에서 삭제 불가
- 검색·필터(성공/실패/슈퍼/일반)·통계요약·페이지네이션
- 작업에 마우스 hover → 상세 툴팁, 클릭 → 상세 모달
- IPv6는 축약 표시(hover로 전체), 해외 IP는 빨강 강조

---

## Cloudflare Worker 백엔드
- 이름: `garibong2-audit`
- 주소: `https://garibong2-audit.duels.workers.dev` (관리자 페이지에 `WORKER_URL` 상수로 하드코딩)
- 코드: `cloudflare-worker/worker.js` (대시보드 Edit code에 붙여넣어 배포)

### 바인딩 (Cloudflare 대시보드에서 설정)
- **KV**: `AUDIT` — keys: `log`(감사로그), `pw`(비밀번호), `perms`(일반관리자 권한)
- **Secret**: `GH_TOKEN`(GitHub PAT), `ADMIN_PW`, `STAFF_PW`
- **Var**: `GH_REPO`=`duelspost-droid/garibong2-site`, `ALLOWED_ORIGINS`=`https://garibong2.kro.kr,http://garibong2.kro.kr,https://duelspost-droid.github.io`

### 엔드포인트
- `POST /api/login` `{password}` → `{ok, role, perms}`
- `POST /api/password` `{target, newPassword}` (슈퍼)
- `GET|POST /api/perms` (슈퍼)
- `GET|PUT /api/gh?path=` — GitHub 파일 읽기/쓰기 (X-Admin-Pw 인증, 경로 화이트리스트, 일반관리자 권한 강제)
- `POST /api/audit`(이벤트 기록, 서버가 실제 IP) / `GET /api/audit`(슈퍼 또는 감사권한)

### 방문 통계
- 무료 카운터 API **Abacus**(`abacus.jasoncameron.dev`), 네임스페이스 `garibong2-9x7k2p`
- 홈페이지 방문 시 세션당 1회 `total` + `d<YYYYMMDD>` + `m<YYYYMM>` 증가

### ⚠️ 비밀값(저장소에 두지 않음 — 운영자만 보유)
- `GH_TOKEN`(GitHub PAT, fine-grained·이 저장소 Contents 권장)
- `ADMIN_PW`/`STAFF_PW`(관리자 비밀번호)
- (이전 단계의 `AUDIT_SECRET`/`PROXY_KEY`는 현재 비밀번호 인증으로 대체됨)

---

## CI / 브랜드
- 슬로건: "새벽이 밝아오는 가리봉, 함께 만드는 내일"
- 컬러: Navy `#0d2461`, Blue `#1e40af`/`#2563eb`, Amber `#f59e0b`(새벽빛), Gray `#4b5563`
- 서체: Jua(제목/심볼) + Noto Sans KR(본문)
- 심볼 의미: 태양(새 시작)+건물(주거환경)+원(공동체)

---

## 보안 요약
- GitHub 토큰 브라우저 비노출(Worker 내부만), 탈취 시 피해는 프록시 허용 파일로 한정
- 비밀번호 서버 검증(소스 노출 무의미), KV 저장·관리자에서 변경
- 슈퍼/일반 권한 서버 강제(세부 권한)
- 감사기록 영구·삭제불가·실제IP
- CSP 메타태그(전 페이지), XSS 이스케이프, 관리자 noindex, 로그인 잠금·세션 만료

---

## 작업 시 주의
- 콘텐츠/공지 변경은 **관리자 페이지에서** 하는 게 정석 (직접 JSON 편집 시 관리자 동시편집과 충돌 가능 → GitHub API가 source of truth)
- CSS/HTML 변경 후 모바일 캐시 때문에 안 보이면 `style.css?v=` 버전 올리기
- Worker 로직 변경 시 `cloudflare-worker/worker.js` 수정 후 **Cloudflare 대시보드에 직접 붙여넣어 Deploy** (CLI/Node 미설치)
- 한글이 들어간 정규식/문자열을 PowerShell로 다룰 때 인코딩 주의 (UTF-8)
