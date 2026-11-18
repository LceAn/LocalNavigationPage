/* ambient-particles.js — 常驻漂浮物层（流星 / 萤火虫 / 落叶 / 樱花 / 尘埃）
 * 与天气特效相互独立：天气决定雨雪雾光，这里决定画面里还有哪些小东西在动。
 * 参数来自 displaySettings：ambientParticle / ambientParticleDensity / ambientParticleSpeed。 */
(() => {
    const canvas = document.getElementById('ambient-particles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const DEFAULTS = { kind: 'none', density: 55, speed: 50 };
    let kind = DEFAULTS.kind;
    let density = DEFAULTS.density;
    let speed = DEFAULTS.speed;
    let particles = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;
    let isDark = document.body.classList.contains('dark-mode');

    function readSettings() {
        const settings = typeof loadDisplaySettings === 'function' ? loadDisplaySettings() : {};
        kind = settings.ambientParticle || 'none';
        density = Number.isFinite(settings.ambientParticleDensity) ? settings.ambientParticleDensity : DEFAULTS.density;
        speed = Number.isFinite(settings.ambientParticleSpeed) ? settings.ambientParticleSpeed : DEFAULTS.speed;
    }

    const rand = (min, max) => min + Math.random() * (max - min);

    function scaleFactor() {
        return Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2000000 / Math.max(1, width * height)));
    }

    const AREA_REF = 1920 * 1080;
    // 以 1080p 为基准换算数量，避免大屏粒子爆量
    function countFor(base, area) {
        const factor = (area / AREA_REF) * (density / 55);
        return Math.max(2, Math.min(170, Math.round(base * factor)));
    }

    function makeMeteor() {
        return {
            x: rand(width * .15, width * 1.15), y: rand(-height * .35, height * .35),
            len: rand(130, 260), vx: -rand(360, 620), vy: rand(200, 380),
            wait: rand(0, 3), alpha: rand(.55, .95), size: rand(1, 1.8)
        };
    }

    function makeFirefly() {
        return {
            x: Math.random() * width, y: Math.random() * height,
            vx: rand(-8, 8), vy: rand(-6, 6), phase: Math.random() * Math.PI * 2,
            size: rand(1.4, 2.8), warm: Math.random() > .35
        };
    }

    function makeLeaf() {
        return {
            x: Math.random() * width, y: rand(-height, height),
            vx: rand(-16, 26), vy: rand(22, 46), rot: Math.random() * Math.PI * 2,
            vr: rand(-1.6, 1.6), size: rand(6, 12), phase: Math.random() * Math.PI * 2,
            hue: Math.random() > .5 ? 28 : 16, sat: rand(45, 70)
        };
    }

    function makeSakura() {
        return {
            x: Math.random() * width, y: rand(-height, height),
            vx: rand(-22, 30), vy: rand(18, 38), rot: Math.random() * Math.PI * 2,
            vr: rand(-2.2, 2.2), size: rand(4, 9), phase: Math.random() * Math.PI * 2,
            hue: rand(330, 350)
        };
    }

    function makeDust() {
        return {
            x: Math.random() * width, y: Math.random() * height,
            vx: rand(-5, 5), vy: rand(-9, -2), size: rand(.6, 1.9),
            alpha: rand(.15, .5), phase: Math.random() * Math.PI * 2
        };
    }

    function spawn(kindName) {
        const area = width * height;
        if (kindName === 'meteor') return Array.from({ length: Math.max(3, countFor(11, area)) }, makeMeteor);
        if (kindName === 'firefly') return Array.from({ length: countFor(26, area) }, makeFirefly);
        if (kindName === 'leaf') return Array.from({ length: countFor(22, area) }, makeLeaf);
        if (kindName === 'sakura') return Array.from({ length: countFor(30, area) }, makeSakura);
        if (kindName === 'dust') return Array.from({ length: countFor(48, area) }, makeDust);
        return [];
    }

    function resize() {
        width = Math.max(1, window.innerWidth);
        height = Math.max(1, window.innerHeight);
        const scale = scaleFactor();
        canvas.width = Math.max(1, Math.floor(width * scale));
        canvas.height = Math.max(1, Math.floor(height * scale));
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        particles = spawn(kind);
    }

    function speedFactor() {
        return 0.55 + (speed / 100) * 0.9; // 0.64 ~ 1.45
    }

    function drawMeteor(p, dt, t) {
        if (p.wait > 0) { p.wait -= dt; return; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y > height + p.len || p.x < -p.len * 2) Object.assign(p, makeMeteor(), { wait: rand(.6, 5) });
        const angle = Math.atan2(p.vy, p.vx);
        const tailX = p.x - Math.cos(angle) * p.len;
        const tailY = p.y - Math.sin(angle) * p.len;
        const grad = ctx.createLinearGradient(p.x, p.y, tailX, tailY);
        if (isDark) {
            grad.addColorStop(0, `rgb(240 248 255 / ${p.alpha})`);
            grad.addColorStop(.45, `rgb(178 208 255 / ${p.alpha * .4})`);
        } else {
            // 浅色背景上白线看不见，改用「白芯 + 深板岩拖尾」
            grad.addColorStop(0, `rgb(255 255 255 / ${p.alpha})`);
            grad.addColorStop(.35, `rgb(74 94 138 / ${p.alpha * .75})`);
        }
        grad.addColorStop(1, 'rgb(255 255 255 / 0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = isDark ? p.size : p.size * 1.5;
        ctx.lineCap = 'round';
        ctx.shadowColor = isDark ? 'rgb(190 220 255 / .55)' : 'rgb(104 128 172 / .45)';
        ctx.shadowBlur = 7;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = isDark ? 'rgb(248 252 255 / .95)' : 'rgb(255 255 255 / .95)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 1.2, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawFirefly(p, dt, t) {
        p.x += p.vx * dt + Math.sin(t / 1600 + p.phase) * .22;
        p.y += p.vy * dt + Math.cos(t / 2100 + p.phase) * .18;
        if (p.x < -20) p.x = width + 20; else if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20; else if (p.y > height + 20) p.y = -20;
        const pulse = .35 + .65 * Math.pow(Math.abs(Math.sin(t / 900 + p.phase)), 1.6);
        // 深色用亮黄绿，浅色背景改用更实的琥珀色，否则会和粉蓝底糊在一起
        const core = isDark ? (p.warm ? '255 226 130' : '198 255 190') : (p.warm ? '232 150 26' : '86 168 96');
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 7);
        glow.addColorStop(0, `rgb(${core} / ${(isDark ? .85 : .55) * pulse})`);
        glow.addColorStop(.32, `rgb(${core} / ${(isDark ? .3 : .18) * pulse})`);
        glow.addColorStop(1, 'rgb(255 255 255 / 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = isDark ? `rgb(255 252 220 / ${.9 * pulse})` : `rgb(${core} / ${.95 * pulse})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (isDark ? .9 : 1.15), 0, Math.PI * 2);
        ctx.fill();
    }

    function drawLeafShape(size) {
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.quadraticCurveTo(size * .85, -size * .35, 0, size);
        ctx.quadraticCurveTo(-size * .85, -size * .35, 0, -size);
        ctx.closePath();
    }

    function drawLeaf(p, dt, t) {
        p.x += (p.vx + Math.sin(t / 1400 + p.phase) * 26) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.y > height + 24) Object.assign(p, makeLeaf(), { y: -20, x: Math.random() * width });
        if (p.x < -40) p.x = width + 30; else if (p.x > width + 40) p.x = -30;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = isDark
            ? `hsl(${p.hue} ${p.sat}% 62% / .55)`
            : `hsl(${p.hue} ${p.sat}% 48% / .62)`;
        drawLeafShape(p.size);
        ctx.fill();
        ctx.strokeStyle = isDark ? `hsl(${p.hue} ${p.sat}% 82% / .3)` : `hsl(${p.hue} ${p.sat}% 34% / .28)`;
        ctx.lineWidth = .8;
        ctx.beginPath();
        ctx.moveTo(0, -p.size * .9);
        ctx.lineTo(0, p.size * .9);
        ctx.stroke();
        ctx.restore();
    }

    function drawSakura(p, dt, t) {
        p.x += (p.vx + Math.sin(t / 1700 + p.phase) * 20) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.y > height + 20) Object.assign(p, makeSakura(), { y: -16, x: Math.random() * width });
        if (p.x < -30) p.x = width + 20; else if (p.x > width + 30) p.x = -20;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = isDark ? `hsl(${p.hue} 72% 82% / .5)` : `hsl(${p.hue} 82% 76% / .68)`;
        for (let i = 0; i < 5; i++) {
            ctx.rotate((Math.PI * 2) / 5);
            ctx.beginPath();
            ctx.ellipse(0, -p.size * .55, p.size * .34, p.size * .58, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function drawDust(p, dt, t) {
        p.x += (p.vx + Math.sin(t / 2600 + p.phase) * 6) * dt;
        p.y += p.vy * dt;
        if (p.y < -12) { p.y = height + 10; p.x = Math.random() * width; }
        if (p.x < -12) p.x = width + 10; else if (p.x > width + 12) p.x = -10;
        const twinkle = .6 + .4 * Math.sin(t / 1800 + p.phase);
        ctx.fillStyle = isDark
            ? `rgb(226 238 255 / ${p.alpha * twinkle})`
            : `rgb(120 140 165 / ${p.alpha * .8 * twinkle})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }

    const DRAWERS = { meteor: drawMeteor, firefly: drawFirefly, leaf: drawLeaf, sakura: drawSakura, dust: drawDust };

    function step(time) {
        frame = 0;
        const dt = last ? Math.min((time - last) / 1000, .05) : 0;
        last = time;
        if (kind === 'none' || !particles.length) return;
        ctx.clearRect(0, 0, width, height);
        const drawer = DRAWERS[kind];
        const factor = speedFactor();
        if (drawer) {
            const scaled = kind === 'meteor' ? 1 : factor;
            for (const p of particles) drawer(p, dt * scaled, time);
        }
        frame = window.requestAnimationFrame(step);
    }

    function shouldAnimate() {
        return kind !== 'none' && !document.hidden && !reducedMotion.matches &&
            !document.body.classList.contains('animations-off');
    }

    function sync() {
        isDark = document.body.classList.contains('dark-mode');
        readSettings();
        particles = spawn(kind);
        canvas.dataset.kind = kind;
        if (!shouldAnimate()) {
            if (frame) window.cancelAnimationFrame(frame);
            frame = 0;
            ctx.clearRect(0, 0, width, height);
            return;
        }
        if (!frame) { last = 0; frame = window.requestAnimationFrame(step); }
    }

    window.refreshAmbientParticles = sync;

    window.addEventListener('resize', () => { resize(); sync(); });
    document.addEventListener('visibilitychange', sync);
    reducedMotion.addEventListener('change', sync);
    // 明暗切换只换配色，不重建粒子（否则位置会跳）
    new MutationObserver(() => { isDark = document.body.classList.contains('dark-mode'); })
        .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('pageshow', sync);

    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    resize();
    sync();
})();
