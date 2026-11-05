# ⚾ 홈런레이스

타이밍 맞춰 클릭해서 홈런을 치는 게임입니다. 외야는 파울라인 100m · 중앙 122m의 둥근 펜스(높이 3.6m)이고,
15구 중 5구는 점수 2배 이벤트입니다. 이름과 점수는 Supabase에 저장되고 랭킹으로 보여요.

```
index.html          게임 (정적 페이지)
api/scores.js       Vercel 서버리스 함수: GET 랭킹 조회 / POST 점수 저장
supabase/schema.sql 랭킹 테이블 생성 SQL (처음 만들 때)
supabase/002_add_mode.sql  이지/하드 모드 컬럼 추가 (이미 테이블이 있을 때)
supabase/003_add_team.sql  팀 컬럼 + 비거리 랭킹 인덱스 추가 (이미 테이블이 있을 때)
supabase/004_team_standings.sql  팀별 순위 뷰 (+ 팀 없는 기존 기록을 한화로 합산)
.env.example        필요한 환경변수 목록
```

## 1. Supabase 준비
1. https://supabase.com 에서 새 프로젝트를 만듭니다.
2. **SQL Editor**에 `supabase/schema.sql` 내용을 붙여넣고 **Run**.
3. 두 값을 복사해 둡니다.
   - **Project Settings → Data API**의 Project URL (`https://xxxx.supabase.co`) → `SUPABASE_URL`
   - **Project Settings → API Keys**의 **secret** 키(`sb_secret_…`) 또는 Legacy 탭의 `service_role` 키 → `SUPABASE_SERVICE_ROLE_KEY`
     (⚠️ `sb_publishable_…`/`anon` 키는 안 됩니다. 비밀 키는 절대 브라우저 코드나 깃에 넣지 마세요)
4. Vercel에서 환경변수를 추가·수정했다면 **Redeploy** 해야 반영됩니다.

## 2. Vercel 배포
**방법 A — GitHub 연동 (추천)**
1. 이 폴더를 GitHub 저장소에 올립니다.
2. https://vercel.com/new 에서 저장소를 Import (Framework Preset: **Other**, 빌드 설정은 비워둠).
3. **Environment Variables**에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 추가하고 Deploy.

**방법 B — CLI**
```bash
npm i -g vercel
vercel            # 로그인 후 프로젝트 연결
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel --prod
```

## 이미 테이블을 만들었다면 (이지/하드 모드 업데이트)
Supabase **SQL Editor**에서 `supabase/002_add_mode.sql`, `003_add_team.sql`, `004_team_standings.sql`을 순서대로 한 번씩 실행하세요. 기존 기록은 이지 모드·팀 없음으로 들어갑니다.

## 광고 (구글 애드센스)
1. 내 도메인을 Vercel에 연결하고 애드센스 승인을 받습니다.
2. `index.html`에서 `const ADSENSE = { client: '', slot: '' };`에 게시자 ID(`ca-pub-…`)와 광고 단위 ID를 넣습니다.
3. 프로젝트 루트에 `ads.txt`를 만들고 애드센스가 알려주는 한 줄을 넣습니다.
   예: `google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0`
4. 광고는 게임 화면 아래에만 표시됩니다 (게임 중 실수 클릭 방지). ID를 비워두면 광고가 나오지 않습니다.

## 로컬 실행
`.env.example`을 `.env.local`로 복사해 값을 채운 뒤:
```bash
vercel dev
```

## 보안 메모
- 테이블은 RLS가 켜져 있고 정책이 없어서, 브라우저에서 Supabase로 직접 접근할 수 없습니다. 오직 `/api/scores`만 service_role 키로 읽고 씁니다.
- API는 이름 길이(1~12자), 점수 범위(0~320,000), 홈런 수(0~15)를 검사합니다. 점수 계산이 브라우저에서 이뤄지므로 마음먹고 조작하는 것까지 완전히 막지는 못합니다.
