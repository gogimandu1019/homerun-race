// 로컬 미리보기 서버: 이 폴더의 파일을 보여주고, /api/* 조회는 실제 사이트(homerunracegame.com)에서 읽어옵니다.
// 미리보기에서 실제 랭킹에 기록이 쌓이지 않도록 POST(점수 저장)는 막아둡니다.
const http = require('http'), fs = require('fs'), path = require('path'), { execFile } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT || 8770, API = 'https://homerun-race-b3p3.vercel.app';
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.txt':'text/plain; charset=utf-8', '.json':'application/json', '.xml':'application/xml', '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    if (req.method !== 'GET') { res.writeHead(403, {'content-type':'application/json'}); return res.end(JSON.stringify({ error: '미리보기에서는 점수 저장이 꺼져 있어요.' })); }
    // curl로 실제 사이트 랭킹을 읽어옵니다 (환경에 따라 node의 fetch가 막혀 있을 수 있어서)
    return execFile('curl', ['-s', '-m', '10', '-w', '\n%{http_code}', API + u.pathname + u.search], (err, out) => {
      if (err) { res.writeHead(502, {'content-type':'application/json'}); return res.end('{"error":"실제 사이트 API에 연결할 수 없어요."}'); }
      const i = out.lastIndexOf('\n');
      res.writeHead(+out.slice(i + 1) || 502, {'content-type':'application/json'}); res.end(out.slice(0, i));
    });
  }
  const f = path.join(ROOT, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, {'content-type': TYPES[path.extname(f)] || 'application/octet-stream'}); res.end(d); });
}).listen(PORT, () => console.log('preview on http://localhost:' + PORT));
