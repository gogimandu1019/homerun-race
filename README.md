# ⚾ 홈런레이스

타이밍 맞춰 클릭해서 홈런을 치는 게임입니다. 대구 삼성 라이온즈파크 규격을 쓰고,
15구 중 5구는 점수 2배 이벤트입니다. 이름과 점수는 Supabase에 저장되고 랭킹으로 보여요.

```
index.html          게임 (정적 페이지)
api/scores.js       Vercel 서버리스 함수: GET 랭킹 조회 / POST 점수 저장
supabase/schema.sql 랭킹 테이블 생성 SQL
.env.example        필요한 환경변수 목록
```

## 1. Supabase 준비
1. https://supabase.com 에서 새 프로젝트를 만듭니다.
2. **SQL Editor**에 `supabase/schema.sql` 내용을 붙여넣고 **Run**.
3. **Project Settings → API**에서 두 값을 복사해 둡니다.
   - Project URL → `SUPABASE_URL`
   - `service_role` 키 → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ 절대 브라우저 코드나 깃에 넣지 마세요)

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

## 로컬 실행
`.env.example`을 `.env.local`로 복사해 값을 채운 뒤:
```bash
vercel dev
```

## 보안 메모
- 테이블은 RLS가 켜져 있고 정책이 없어서, 브라우저에서 Supabase로 직접 접근할 수 없습니다. 오직 `/api/scores`만 service_role 키로 읽고 씁니다.
- API는 이름 길이(1~12자), 점수 범위(0~320,000), 홈런 수(0~15)를 검사합니다. 점수 계산이 브라우저에서 이뤄지므로 마음먹고 조작하는 것까지 완전히 막지는 못합니다.
