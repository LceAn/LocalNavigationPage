/* 天气氛围独立于文本显示，数据沿用 display.js 的天气请求与缓存。 */
const WEATHER_ATMOSPHERE_MAX_AGE = 30 * 60 * 1000;
const WEATHER_COLD_WINDOW = 6 * 60 * 60 * 1000;
const WEATHER_COLD_DURATION = 60 * 60 * 1000;

function getWeatherAtmosphereCondition(code, description = '') {
    const value = Number(code);
    if ([200, 386, 389].includes(value)) return 'thunder';
    if ([143, 248, 260].includes(value)) return 'fog';
    if ([179, 182, 227, 230, 317, 320, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371, 374, 377, 392, 395].includes(value)) return 'snow';
    if ([176, 185, 263, 266, 281, 284, 293, 296, 299, 302, 305, 308, 311, 314, 353, 356, 359].includes(value)) return 'rain';
    if (value === 116) return 'partly-cloudy';
    if ([119, 122].includes(value)) return 'cloudy';
    if (value === 113) return 'clear';
    if (/thunder|storm|雷/i.test(description)) return 'thunder';
    if (/snow|sleet|blizzard|ice pellets|雪|冰雹/i.test(description)) return 'snow';
    if (/rain|drizzle|shower|雨/i.test(description)) return 'rain';
    if (/haze|smoke|霾|烟/i.test(description)) return 'haze';
    if (/fog|mist|雾/i.test(description)) return 'fog';
    if (/wind|gale|风/i.test(description)) return 'wind';
    if (/cloud|overcast|阴|多云/i.test(description)) return 'cloudy';
    if (/clear|sunny|晴/i.test(description)) return 'clear';
    // 未知天气也走云层动画，避免“没有动画”的空状态
    return 'cloudy';
}

function advanceColdWeatherHistory(previous, observation, now = Date.now()) {
    if (!observation || !Number.isFinite(observation.temperatureC) || !Number.isFinite(observation.at) ||
        observation.at > now || now - observation.at > WEATHER_ATMOSPHERE_MAX_AGE) return previous;
    const city = String(observation.city || '').trim().toLowerCase();
    if (!city) return previous;
    const sameCity = previous?.city === city;
    if (sameCity && Number.isFinite(previous.at) && observation.at <= previous.at) return previous;
    const recent = sameCity && observation.at - previous.at <= WEATHER_COLD_WINDOW;
    const dropped = recent && Number.isFinite(previous.temperatureC) && previous.temperatureC - observation.temperatureC >= 5;
    return {
        city, temperatureC: observation.temperatureC, at: observation.at,
        coldUntil: dropped ? observation.at + WEATHER_COLD_DURATION : sameCity && previous.coldUntil > now ? previous.coldUntil : 0
    };
}

function resolveWeatherAtmosphere(observation, settings, history, now = Date.now()) {
    const empty = { kind: 'none', cold: false, validUntil: 0 };
    const city = String(settings.weatherCity || 'shanghai').split(',')[0].trim().toLowerCase();
    if (settings.weatherEffects === false || !observation || observation.city !== city ||
        !Number.isFinite(observation.at) || observation.at > now || now - observation.at >= WEATHER_ATMOSPHERE_MAX_AGE) return empty;
    return {
        kind: getWeatherAtmosphereCondition(observation.code, observation.description),
        cold: history?.city === city && history.coldUntil > now,
        validUntil: observation.at + WEATHER_ATMOSPHERE_MAX_AGE
    };
}

function getWeatherCanvasScale(width, height, ratio) {
    return Math.min(ratio || 1, 1.5, Math.sqrt(2000000 / Math.max(1, width * height)));
}

(() => {
    const layer = document.getElementById('weather-atmosphere');
    if (!layer) return;
    const rainCanvas = layer.querySelector('.weather-rain');
    const snowCanvas = layer.querySelector('.weather-snow');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let observation = null;
    let history = getSetting('weatherAtmosphereHistory', null);
    let state = { kind: 'none', cold: false };
    let rainContext;
    let snowContext;
    let rain = [];
    let snow = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastTime = 0;
    let fadeUntil = 0;
    let expiryTimer;

    function resize() {
        width = Math.max(1, window.innerWidth);
        height = Math.max(1, window.innerHeight);
        const scale = getWeatherCanvasScale(width, height, window.devicePixelRatio);
        for (const canvas of [rainCanvas, snowCanvas]) {
            canvas.width = Math.max(1, Math.floor(width * scale));
            canvas.height = Math.max(1, Math.floor(height * scale));
        }
        rainContext = rainCanvas.getContext('2d');
        snowContext = snowCanvas.getContext('2d');
        rainContext?.setTransform(scale, 0, 0, scale, 0, 0);
        snowContext?.setTransform(scale, 0, 0, scale, 0, 0);
        const density = width * height / 24000;
        rain = Array.from({ length: Math.min(78, Math.max(24, Math.round(density))) }, () => ({
            x: Math.random() * (width + 120), y: Math.random() * height,
            speed: 340 + Math.random() * 300, length: 16 + Math.random() * 22, alpha: .18 + Math.random() * .28
        }));
        snow = Array.from({ length: Math.min(48, Math.max(18, Math.round(density * .65))) }, () => ({
            x: Math.random() * width, y: Math.random() * height,
            speed: 20 + Math.random() * 42, radius: .9 + Math.random() * 1.9, phase: Math.random() * Math.PI * 2
        }));
    }

    function draw(time, delta) {
        if (!rainContext || !snowContext) return;
        const dark = document.body.classList.contains('dark-mode');
        rainContext.clearRect(0, 0, width, height);
        snowContext.clearRect(0, 0, width, height);
        if (state.kind === 'rain' || state.kind === 'thunder') for (const drop of rain) {
            drop.y += drop.speed * delta;
            drop.x -= drop.speed * delta * .18;
            if (drop.y > height + 45 || drop.x < -30) { drop.y = -45; drop.x = Math.random() * (width + 120); }
            rainContext.strokeStyle = dark ? `rgba(190,219,245,${drop.alpha})` : `rgba(79,120,159,${drop.alpha})`;
            rainContext.lineWidth = .8;
            rainContext.beginPath();
            rainContext.moveTo(drop.x, drop.y);
            rainContext.lineTo(drop.x - drop.length * .18, drop.y + drop.length);
            rainContext.stroke();
        }
        if (state.kind === 'snow') for (const flake of snow) {
            flake.y += flake.speed * delta;
            flake.x += Math.sin(time / 3000 + flake.phase) * delta * 12;
            if (flake.y > height + 5) { flake.y = -5; flake.x = Math.random() * width; }
            snowContext.fillStyle = dark ? 'rgba(229,241,255,.72)' : 'rgba(255,255,255,.88)';
            snowContext.shadowColor = dark ? 'rgba(206,228,255,.3)' : 'rgba(106,145,182,.45)';
            snowContext.shadowBlur = 4;
            snowContext.beginPath();
            snowContext.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
            snowContext.fill();
        }
    }

    function stop() {
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
        lastTime = 0;
    }

    function tick(time) {
        frame = 0;
        if (time - lastTime >= 32 || !lastTime) {
            draw(time, lastTime ? Math.min((time - lastTime) / 1000, .08) : 0);
            lastTime = time;
        }
        if (['rain', 'snow', 'thunder'].includes(state.kind) || performance.now() < fadeUntil) frame = window.requestAnimationFrame(tick);
    }

    function refresh() {
        const now = Date.now();
        const settings = typeof loadDisplaySettings === 'function' ? loadDisplaySettings() : getSetting('displaySettings', {});
        const previousKind = state.kind;
        state = resolveWeatherAtmosphere(observation, settings, history, now);
        const moving = !document.hidden && !reducedMotion.matches && !document.body.classList.contains('animations-off');
        layer.dataset.weather = state.kind;
        layer.dataset.cold = String(state.cold);
        layer.dataset.motion = moving ? 'on' : 'off';
        window.clearTimeout(expiryTimer);
        if (state.validUntil) {
            const expires = state.cold ? Math.min(state.validUntil, history.coldUntil) : state.validUntil;
            expiryTimer = window.setTimeout(refresh, Math.max(1, expires - now));
        }
        const precipitation = ['rain', 'snow', 'thunder'].includes(state.kind);
        if (precipitation && !rainContext) resize();
        if (precipitation) draw(performance.now(), 0);
        if (!moving || settings.weatherEffects === false) { stop(); return; }
        if (['rain', 'snow', 'thunder'].includes(previousKind)) fadeUntil = performance.now() + 1800;
        if ((precipitation || performance.now() < fadeUntil) && !frame) frame = window.requestAnimationFrame(tick);
        if (!precipitation && previousKind === 'none') stop();
    }

    window.applyWeatherAtmosphere = sample => {
        observation = sample;
        const nextHistory = advanceColdWeatherHistory(history, sample);
        if (nextHistory !== history) {
            history = nextHistory;
            setSetting('weatherAtmosphereHistory', history);
        }
        refresh();
    };
    window.refreshWeatherAtmosphere = refresh;
    window.addEventListener('resize', () => { if (rainContext) { resize(); draw(performance.now(), 0); } });
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    reducedMotion.addEventListener('change', refresh);
    new MutationObserver(refresh).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    refresh();
})();
