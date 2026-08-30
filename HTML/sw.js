/* Service Worker — 本地导航页离线缓存
 *
 * 策略：
 *  - HTML 导航请求：网络优先，失败回退缓存（保证入口最新）
 *  - data/links.json：网络优先，失败回退缓存（数据尽量新鲜，离线可用）
 *  - 其余同源 GET（CSS/JS/字体/图标，均带 ?v= 版本参数）：
 *    缓存优先 + 后台更新（stale-while-revalidate）
 *  - 跨域请求（缩略图、favicon、状态探测）一律不拦截
 *
 * 发版时同步修改 CACHE_VERSION，激活时会自动清理旧缓存。
 */
const CACHE_VERSION = 'lnp-v1.5.2';
const APP_SHELL = [
    './',
    './index.html',
    './CSS/fonts.css?v=1.5.2',
    './CSS/remixicon.css?v=1.5.2',
    './CSS/tokens.css?v=1.5.2',
    './CSS/styles.css?v=1.5.2',
    './CSS/search_input.css?v=1.5.2',
    './CSS/settings_box.css?v=1.5.2',
    './assets/fonts/remixicon.woff2',
    './assets/fonts/inter-var-latin.woff2'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return; // 跨域（缩略图/favicon/探测）不拦截

    // HTML 导航与数据文件：网络优先
    if (request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname === '/' ||
        url.pathname.endsWith('/data/links.json')) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_VERSION).then(cache => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(request, { ignoreSearch: request.mode === 'navigate' })
                    .then(cached => cached || (request.mode === 'navigate'
                        ? caches.match('./index.html')
                        : undefined)))
        );
        return;
    }

    // 其余同源静态资源：缓存优先 + 后台更新
    event.respondWith(
        caches.match(request).then(cached => {
            const network = fetch(request)
                .then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_VERSION).then(cache => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(() => cached);
            return cached || network;
        })
    );
});
