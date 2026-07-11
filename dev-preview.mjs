/* 로컬 미리보기 서버 — 배포 전 수정 확인용 (Vercel 배포 한도 절약)
   사용: node dev-preview.mjs → http://localhost:5173/okcheon_test
   정적 파일은 이 폴더 것을 그대로, /api/*는 프로덕션(hsdtv.vercel.app)으로 프록시.
   Supabase는 절대 URL이라 로컬에서도 그대로 동작. */
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const PORT = process.env.PORT || 5173;
const PROD = 'https://ambm.vercel.app';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    try {
      const r = await fetch(PROD + req.url, { method: req.method, headers: { 'user-agent': 'dev-preview' } });
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' });
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) { res.writeHead(502); res.end('proxy error: ' + e.message); }
    return;
  }
  let p = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname);
  if (!path.extname(p) && fs.existsSync(path.join(ROOT, p + '.html'))) p += '.html';   // 클린 URL
  const f = path.join(ROOT, p);
  if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(fs.readFileSync(f));
  } else { res.writeHead(404); res.end('not found: ' + p); }
}).listen(PORT, () => console.log(`미리보기: http://localhost:${PORT}`));
