// Cloudflare Pages Functions ↔ Vercel 함수 형식 변환기
// api/*.js 는 Vercel 형식(req, res)으로 작성돼 있어서, 같은 코드를 Cloudflare에서도 그대로 쓰려고 감쌉니다.
// Vercel은 이 functions/ 폴더를 무시하고, Cloudflare는 api/ 대신 이 폴더를 함수로 씁니다.

export function vercelHandler(handler) {
  return async ({ request, env }) => {
    // Cloudflare 환경변수(대시보드에서 입력)를 Vercel처럼 process.env 로 넘겨줌
    globalThis.process = globalThis.process || { env: {} };
    process.env = process.env || {};
    for (const [k, v] of Object.entries(env || {})) if (typeof v === 'string') process.env[k] = v;

    const url = new URL(request.url);
    const headers = {};
    request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    // 실제 접속자 IP: Cloudflare가 넣어 주는 값을 우선 사용 (사용자가 조작할 수 없음)
    if (headers['cf-connecting-ip']) headers['x-forwarded-for'] = headers['cf-connecting-ip'];

    let body;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const text = await request.text();
      if (text) { try { body = JSON.parse(text); } catch (e) { body = text; } }
    }
    const req = { method: request.method, headers, query: Object.fromEntries(url.searchParams), body, url: url.pathname + url.search };

    let status = 200, payload = null;
    const out = new Headers();
    const res = {
      setHeader(k, v) { out.set(k, String(v)); return res; },
      status(c) { status = c; return res; },
      json(obj) { out.set('content-type', 'application/json; charset=utf-8'); payload = JSON.stringify(obj); return res; },
      end(s) { if (s !== undefined) payload = s; return res; },
    };
    await handler(req, res);
    return new Response(status === 204 || status === 304 ? null : payload, { status, headers: out });
  };
}
