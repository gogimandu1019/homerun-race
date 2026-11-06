# Cloudflare Pages 이사 안내

Vercel Pro(월 $20)를 끊고 **무료**인 Cloudflare Pages로 옮기는 순서입니다.
코드는 이미 양쪽에서 돌아가게 준비돼 있어서(2026-11-06), 아래는 **대시보드에서 클릭하는 일**만 남았습니다.

- 주소(homerunracegame.com), 랭킹 DB(Supabase), 애드센스, 검색 등록은 **그대로**입니다.
- 이사하는 동안에도 사이트는 멈추지 않습니다. Vercel은 마지막 단계에서 끕니다.
- 🗓 **언제**: Vercel 다음 결제일(Settings → Billing → Next invoice) **일주일 전**쯤 시작하세요.

---

## 1단계. Cloudflare에 사이트 올리기 (20~30분)

1. https://dash.cloudflare.com 가입 (무료)
2. 왼쪽 메뉴 **Workers & Pages** → **Create** → **Pages** 탭 → **Connect to Git**
3. GitHub 연결 → 저장소 `gogimandu1019/homerun-race` 선택
4. 빌드 설정
   - Project name: `homerun-race` (→ 임시 주소 `homerun-race.pages.dev`)
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: **비워 둠**
   - Build output directory: **비워 둠** (저장소의 `wrangler.toml`이 알아서 정함)
5. **Environment variables**에 아래 2개 추가 (각각 **Encrypt** 체크)

   | 이름 | 값을 어디서 가져오나 |
   |---|---|
   | `SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → secret 키 (`sb_secret_…`) |

   ⚠️ 키는 Claude 대화나 문서에 붙여넣지 말고 대시보드에만 입력하세요.
6. **Save and Deploy** → 1~2분 뒤 완료

## 2단계. 임시 주소에서 확인 (10분)

`https://homerun-race.pages.dev` 에서 아래가 되는지 확인합니다. (Claude에게 "pages.dev 확인해 줘"라고 하면 같이 봅니다)

- [ ] 게임 화면이 뜨고 한 판 플레이 가능
- [ ] 랭킹(점수·비거리·팀)이 실제 기록으로 보임
- [ ] `/api/mcp` 가 응답함 (Claude에게 "pages.dev 확인해 줘"라고 하면 같이 확인)
- [ ] `/guide`, `/privacy` 페이지가 열림

여기까지 문제가 없으면 실제 주소를 옮깁니다. 문제가 있으면 여기서 멈춰도 사이트는 Vercel에서 그대로 돌아갑니다.

## 3단계. 주소(도메인) 옮기기 (클릭 10분 + 대기 몇 시간~하루)

1. Cloudflare 대시보드 → **Add a domain** (또는 Websites → Add a site) → `homerunracegame.com` 입력 → **Free** 플랜
2. Cloudflare가 지금 DNS 기록을 읽어 옵니다. 그대로 **Continue**
3. 화면에 나오는 **네임서버 2개**(예: `xxx.ns.cloudflare.com`)를 메모
4. **가비아** → My가비아 → 도메인 관리 → `homerunracegame.com` → **네임서버 설정** → 가비아 기본값 대신 Cloudflare 네임서버 2개로 바꾸고 저장
5. Cloudflare에서 "Active"로 바뀔 때까지 기다림 (보통 몇 시간, 길면 하루. 메일로 알려줌)
6. Active가 되면 **Workers & Pages → homerun-race → Custom domains → Set up a custom domain**
   - `homerunracegame.com` 추가
   - `www.homerunracegame.com` 추가
   - "기존 DNS 기록을 바꿀까요?"라고 물으면 **예** (Vercel을 가리키던 기록이 Cloudflare로 바뀜)
7. 몇 분 뒤 https://homerunracegame.com 이 Cloudflare에서 열립니다. HTTPS 인증서는 자동입니다.

## 4단계. 최종 확인 후 Vercel 끄기 (5분)

1. https://homerunracegame.com 에서 2단계 체크리스트를 다시 확인
   - MCP: `https://homerunracegame.com/api/mcp` 도 Claude에서 그대로 동작해야 함
   - 애드센스 `https://homerunracegame.com/ads.txt` 가 열리는지
2. 이상 없으면 Vercel → 프로젝트 → Settings → **Domains**에서 `homerunracegame.com`, `www` 제거
3. Vercel → 팀 Settings → **Billing** → Pro 해지(Downgrade to Hobby)
4. 일주일쯤 문제없으면 Vercel 프로젝트는 지워도 됩니다

## 되돌리기 (문제가 생기면)

- **3단계 전**: 아무것도 안 바뀐 상태입니다. Cloudflare 프로젝트만 지우면 끝.
- **3단계 후**: 가비아 네임서버 설정을 **가비아 기본 네임서버**로 되돌리면, 가비아 DNS에 남아 있는 예전 Vercel 기록으로 다시 연결됩니다. Vercel을 아직 해지하지 않았다면 그대로 다시 열립니다.
- 📸 **3단계 시작 전에** 가비아 DNS 관리 화면(A 레코드, www CNAME)을 캡처해 두세요. 되돌릴 때 이 값과 같은지 확인하면 됩니다.

---

## 참고: 무엇이 바뀌었나 (개발자용)

| 파일 | 역할 |
|---|---|
| `functions/api/*.js` | Cloudflare용 함수 입구. 실제 코드는 `api/*.js`를 그대로 불러씀 |
| `functions/_adapter.js` | Cloudflare 요청 ↔ Vercel `req/res` 형식 변환, 환경변수를 `process.env`로 전달, 접속자 IP는 `cf-connecting-ip` 사용 |
| `wrangler.toml` | Pages 설정 (`nodejs_compat`, 출력 폴더 = 저장소 루트) |
| `_routes.json` | `/api/*`만 함수로 처리 (정적 파일은 함수 호출 횟수에 안 잡힘) |
| `vercel.json` | `cleanUrls` — Vercel도 Cloudflare처럼 `/guide.html` → `/guide` |

- 무료 한도: 함수 호출 하루 10만 회 (페이지·이미지 같은 정적 파일은 무제한)
- 로컬 테스트: `npx wrangler pages dev .` (환경변수는 `--binding KEY=값`)
