const CACHE = 'ambm-v3';
const STATIC = [
  '/',
  '/index.html',
  '/app.css',
  '/core.js',
  '/dashboard.js',
  '/feed.js',
  '/register.js',
  '/admin.js',
  '/community.js',
  '/tournament.js',
  '/balance.js',
  '/settings.js',
  '/utils.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];
const API_CACHE = 'ambm-api-v1';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC.map(u => new Request(u, {cache: 'reload'}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE && k !== API_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isLocal = url.hostname === location.hostname;
  const isSupabase = url.hostname.includes('supabase.co');
  const isNavigation = e.request.mode === 'navigate';

  if (isNavigation || (isLocal && (url.pathname === '/' || url.pathname.endsWith('.html')))) {
    e.respondWith(
      fetch(e.request)
        .then(res => { const clone=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,clone)); return res; })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  if (isLocal && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
    e.respondWith(
      fetch(e.request)
        .then(res => { const clone=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,clone)); return res; })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  const isImg = isLocal && /\.(png|webp|jpg|jpeg|gif|svg)$/.test(url.pathname);
  const isExternalImg = url.hostname.includes('supabase.co') && url.pathname.includes('/storage/');
  if (isImg || isExternalImg) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) { const clone=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,clone)); }
          return res;
        }).catch(() => new Response('', {status:404}));
      })
    );
    return;
  }

  if (isSupabase && e.request.method === 'GET') {
    e.respondWith(
      fetch(e.request)
        .then(res => { if(res.ok){const clone=res.clone();caches.open(API_CACHE).then(c=>c.put(e.request,clone));} return res; })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(fetch(e.request).catch(() => new Response('', {status:503})));
});
