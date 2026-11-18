/* 天气氛围独立于文本显示，数据沿用 display.js 的天气请求与缓存。
 *
 * 分层模型：
 *   kind（细分天气，如 rain-heavy / snow-storm）→ profile（画布参数）→ data-weather（大类，供 CSS 用）
 * 大类只决定「哪些图层出现」，细分决定雨丝密度、长度、倾角、速度与整屏压暗程度。
 */
const WEATHER_ATMOSPHERE_MAX_AGE = 30 * 60 * 1000;
const WEATHER_COLD_WINDOW = 6 * 60 * 60 * 1000;
const WEATHER_COLD_DURATION = 60 * 60 * 1000;

/* 粒子强度：数量倍率 / 单颗透明度倍率 / 整层浓度 */
const WEATHER_FX_INTENSITY = {
    light: { count: .7, alpha: .92, opacity: .94 },
    normal: { count: 1, alpha: 1, opacity: 1 },
    strong: { count: 2.2, alpha: 1.2, opacity: 1 }
};
const WEATHER_FX_SPEED = { slow: .6, normal: 1, fast: 1.6 };

/* 细分天气 → 绘制参数
 * count  基础粒子数倍率（再乘强度）
 * speed  下落/飘落速度倍率
 * len    雨丝长度区间（px）    width 雨丝粗细
 * alpha  单颗透明度区间        slant 倾斜比例（x 位移 / y 位移）
 * veil   整屏压暗/水汽强度 0~1  flash [间隔秒, 抖动秒] 仅雷暴  gust 横向风力倍率
 */
const WEATHER_FX_PROFILES = {
    clear: { family: 'clear' },
    'partly-cloudy': { family: 'partly-cloudy' },
    cloudy: { family: 'cloudy' },
    fog: { family: 'fog' },
    haze: { family: 'haze' },
    wind: { family: 'wind', gust: 1 },

    // 雨：毛毛雨 → 特大暴雨，密度、长度、速度、压暗逐级放大
    drizzle: { family: 'rain', rain: { count: 2.2, speed: .45, len: [5, 12], width: 1.05, alpha: [.24, .46], slant: .05 } },
    'rain-light': { family: 'rain', rain: { count: 1.55, speed: .8, len: [9, 17], width: 1.1, alpha: [.24, .46], slant: .1 } },
    rain: { family: 'rain', rain: { count: 2, speed: 1.05, len: [16, 28], width: 1.3, alpha: [.28, .54], slant: .15 } },
    'rain-heavy': { family: 'rain', rain: { count: 2.6, speed: 1.4, len: [28, 50], width: 1.7, alpha: [.34, .66], slant: .19 }, veil: .16 },
    'rain-torrential': { family: 'rain', rain: { count: 3.3, speed: 1.75, len: [44, 82], width: 2.1, alpha: [.36, .74], slant: .24 }, veil: .32 },

    // 雷雨：雨量递增 + 闪电间隔缩短
    'thunder-light': { family: 'thunder', rain: { count: 1.6, speed: .9, len: [10, 19], width: 1.1, alpha: [.2, .42], slant: .13 }, flash: [13, 8] },
    thunder: { family: 'thunder', rain: { count: 2.3, speed: 1.25, len: [20, 36], width: 1.5, alpha: [.26, .54], slant: .17 }, veil: .1, flash: [8, 5] },
    'thunder-heavy': { family: 'thunder', rain: { count: 3.1, speed: 1.55, len: [34, 62], width: 1.9, alpha: [.32, .66], slant: .21 }, veil: .2, flash: [5, 3] },

    // 雪：越大的雪片越大越快，暴雪带明显横风
    'snow-light': { family: 'snow', snow: { count: 1.4, speed: .7, size: [.9, 2] } },
    snow: { family: 'snow', snow: { count: 1.9, speed: 1, size: [1.1, 2.6] } },
    'snow-heavy': { family: 'snow', snow: { count: 2.5, speed: 1.25, size: [1.5, 3.4] }, veil: .08 },
    'snow-storm': { family: 'snow', snow: { count: 2.7, speed: 1.7, size: [2, 4.6] }, veil: .2, gust: 2.6 },
    // 雨夹雪：雨丝 + 雪片同时出现
    sleet: { family: 'snow', snow: { count: 1.5, speed: 1.1, size: [1, 2.2] }, rain: { count: 1.4, speed: 1, len: [9, 17], width: 1, alpha: [.2, .4], slant: .12 } }
};

function weatherFxProfile(kind) {
    return WEATHER_FX_PROFILES[kind] || { family: 'none' };
}

function resolveWeatherFxTuning(settings = {}) {
    const intensity = WEATHER_FX_INTENSITY[settings.weatherEffectIntensity] || WEATHER_FX_INTENSITY.normal;
    const speed = WEATHER_FX_SPEED[settings.weatherEffectSpeed] || WEATHER_FX_SPEED.normal;
    const off = Array.isArray(settings.weatherEffectOff) ? settings.weatherEffectOff : [];
    return { count: intensity.count, alpha: intensity.alpha, opacity: intensity.opacity, speed, off };
}

/* 天气编码 → 细分天气。WWO 编码本身带强度（light / moderate / heavy / torrential） */
const WEATHER_CODE_KINDS = {
    drizzle: [185, 263, 266, 281, 284],
    'rain-light': [176, 293, 296, 353],
    rain: [299, 302, 311, 314, 356],
    'rain-heavy': [305, 308],
    'rain-torrential': [359],
    'thunder-light': [200, 386],
    thunder: [389],
    'snow-light': [179, 323, 326, 368],
    sleet: [182, 317, 320, 362, 365],
    snow: [329, 332, 350, 371, 374, 377, 392],
    'snow-heavy': [227, 335, 338, 395],
    'snow-storm': [230],
    fog: [143, 248, 260],
    'partly-cloudy': [116],
    cloudy: [119, 122],
    clear: [113]
};

function getWeatherAtmosphereCondition(code, description = '') {
    const value = Number(code);
    for (const kind in WEATHER_CODE_KINDS) {
        if (WEATHER_CODE_KINDS[kind].includes(value)) {
            // 389 同属中到大雨伴雷，按描述再细分一档
            if (kind === 'thunder' && /heavy|torrential|strong|大|暴/i.test(String(description))) return 'thunder-heavy';
            return kind;
        }
    }
    const text = String(description || '');
    if (/blizzard|暴雪|雪暴/i.test(text)) return 'snow-storm';
    if (/thunder|storm|雷/i.test(text)) return /heavy|strong|大|暴/i.test(text) ? 'thunder-heavy' : 'thunder';
    if (/torrential|倾盆|特大暴雨/i.test(text)) return 'rain-torrential';
    if (/heavy rain|大雨|暴雨/i.test(text)) return 'rain-heavy';
    if (/drizzle|毛毛雨|细雨/i.test(text)) return 'drizzle';
    if (/light rain|小雨/i.test(text)) return 'rain-light';
    if (/sleet|freezing rain|雨夹雪|冻雨|冰粒/i.test(text)) return 'sleet';
    if (/heavy snow|大雪|冰雹/i.test(text)) return 'snow-heavy';
    if (/light snow|小雪/i.test(text)) return 'snow-light';
    if (/snow|雪/i.test(text)) return 'snow';
    if (/rain|shower|雨/i.test(text)) return 'rain';
    if (/haze|smoke|霾|烟/i.test(text)) return 'haze';
    if (/fog|mist|雾/i.test(text)) return 'fog';
    if (/wind|gale|风/i.test(text)) return 'wind';
    if (/cloud|overcast|阴|多云/i.test(text)) return 'cloudy';
    if (/clear|sunny|晴/i.test(text)) return 'clear';
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
    let tuning = resolveWeatherFxTuning({});
    let previewKind = '';
    let previewUntil = 0;
    let previewTimer = 0;
    let builtSignature = '';
    let gust = 1;

    const rand = (min, max) => min + Math.random() * (max - min);

    function resizeCanvas() {
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
    }

    /* 按当前细分天气 + 强度重建粒子池。
       强度调了没反应，根因就是以前只在首次拿到 canvas 时跑一次 resize，
       粒子数量被永久固定在初始值。 */
    function buildParticles(kind) {
        const profile = weatherFxProfile(kind);
        const area = width * height / 20000;
        gust = profile.gust || 1;
        rain = [];
        snow = [];

        if (profile.rain) {
            const p = profile.rain;
            const total = Math.min(560, Math.max(10, Math.round(area * p.count * tuning.count)));
            rain = Array.from({ length: total }, () => ({
                x: Math.random() * (width + 160) - 40,
                y: Math.random() * height,
                speed: (300 + Math.random() * 280) * p.speed * tuning.speed,
                len: rand(p.len[0], p.len[1]),
                width: p.width,
                alpha: Math.min(.95, rand(p.alpha[0], p.alpha[1]) * tuning.alpha),
                slant: p.slant
            }));
        }
        if (profile.snow) {
            const p = profile.snow;
            const total = Math.min(300, Math.max(12, Math.round(area * .9 * p.count * tuning.count)));
            snow = Array.from({ length: total }, () => ({
                x: Math.random() * width,
                y: Math.random() * height,
                speed: (18 + Math.random() * 44) * p.speed * tuning.speed,
                radius: rand(p.size[0], p.size[1]),
                phase: Math.random() * Math.PI * 2
            }));
        }
        builtSignature = `${kind}|${tuning.count}|${tuning.speed}|${width}x${height}`;
    }

    function ensureParticles(kind) {
        if (!rainContext) resizeCanvas();
        const signature = `${kind}|${tuning.count}|${tuning.speed}|${width}x${height}`;
        if (signature !== builtSignature) buildParticles(kind);
    }

    function draw(time, delta) {
        if (!rainContext || !snowContext) return;
        const dark = document.body.classList.contains('dark-mode');
        rainContext.clearRect(0, 0, width, height);
        snowContext.clearRect(0, 0, width, height);
        const off = tuning.off;
        const rainOff = off.includes('rain') || (state.kind.startsWith('thunder') && off.includes('thunder'));
        const snowOff = off.includes('snow');

        if (rain.length && !rainOff) {
            rainContext.lineCap = 'round';
            for (const drop of rain) {
                drop.y += drop.speed * delta;
                drop.x -= drop.speed * delta * drop.slant;
                if (drop.y > height + 60 || drop.x < -60) {
                    drop.y = -60;
                    drop.x = Math.random() * (width + 160) - 40;
                }
                rainContext.strokeStyle = dark
                    ? `rgba(198,225,250,${drop.alpha})`
                    : `rgba(72,112,152,${drop.alpha})`;
                rainContext.lineWidth = drop.width;
                rainContext.beginPath();
                rainContext.moveTo(drop.x, drop.y);
                rainContext.lineTo(drop.x - drop.len * drop.slant, drop.y + drop.len);
                rainContext.stroke();
            }
        }

        if (snow.length && !snowOff) {
            snowContext.shadowBlur = dark ? 6 : 7;
            snowContext.shadowColor = dark ? 'rgba(206,228,255,.5)' : 'rgba(96,128,168,.55)';
            snowContext.fillStyle = dark ? 'rgba(232,243,255,.9)' : 'rgba(255,255,255,.96)';
            for (const flake of snow) {
                flake.y += flake.speed * delta;
                flake.x += (Math.sin(time / 3000 + flake.phase) * 12 + gust * 18) * delta;
                if (flake.y > height + 6) { flake.y = -6; flake.x = Math.random() * width; }
                if (flake.x > width + 20) flake.x = -10;
                snowContext.beginPath();
                snowContext.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
                snowContext.fill();
            }
            snowContext.shadowBlur = 0;
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
        if (rain.length || snow.length || performance.now() < fadeUntil) frame = window.requestAnimationFrame(tick);
    }

    function refresh() {
        const now = Date.now();
        const settings = typeof loadDisplaySettings === 'function' ? loadDisplaySettings() : getSetting('displaySettings', {});
        tuning = resolveWeatherFxTuning(settings);
        const previousKind = state.kind;
        state = resolveWeatherAtmosphere(observation, settings, history, now);
        // 预览优先：点「立即预览」时忽略真实天气与总开关
        const previewing = Boolean(previewKind) && now < previewUntil;
        if (previewing) state = { ...state, kind: previewKind };

        const profile = weatherFxProfile(state.kind);
        const moving = !document.hidden && !reducedMotion.matches && !document.body.classList.contains('animations-off');

        layer.dataset.weather = profile.family;
        layer.dataset.kind = state.kind;
        layer.dataset.cold = String(state.cold);
        layer.dataset.motion = moving ? 'on' : 'off';
        layer.dataset.intensity = settings.weatherEffectIntensity || 'normal';
        layer.dataset.off = tuning.off.join(' ');
        layer.style.setProperty('--fx-opacity', String(tuning.opacity || 1));
        layer.style.setProperty('--fx-veil', String(profile.veil || 0));
        layer.style.setProperty('--flash-duration', `${profile.flash ? profile.flash[0] : 8}s`);

        window.clearTimeout(expiryTimer);
        if (state.validUntil) {
            const expires = state.cold ? Math.min(state.validUntil, history.coldUntil) : state.validUntil;
            expiryTimer = window.setTimeout(refresh, Math.max(1, expires - now));
        }

        const hasParticles = Boolean(profile.rain || profile.snow);
        if (hasParticles) {
            ensureParticles(state.kind);
            draw(performance.now(), 0);
            if (previousKind !== state.kind) fadeUntil = performance.now() + 1200;
        }

        if (!moving || (settings.weatherEffects === false && !previewing)) { stop(); return; }
        if ((hasParticles || performance.now() < fadeUntil) && !frame) frame = window.requestAnimationFrame(tick);
        if (!hasParticles && previousKind === 'none') stop();
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
    // 立即预览：kind 为空表示停止；不写设置，只影响当前画面
    window.previewWeatherAtmosphere = (kind, duration = 6000) => {
        window.clearTimeout(previewTimer);
        if (!kind) {
            previewKind = '';
            previewUntil = 0;
            refresh();
            window.dispatchEvent(new CustomEvent('lnp:weather-preview-end'));
            return;
        }
        previewKind = kind;
        previewUntil = Date.now() + duration;
        refresh();
        previewTimer = window.setTimeout(() => {
            previewKind = '';
            previewUntil = 0;
            refresh();
            window.dispatchEvent(new CustomEvent('lnp:weather-preview-end'));
        }, duration);
    };
    window.getWeatherPreviewKind = () => (previewKind && Date.now() < previewUntil ? previewKind : '');

    window.addEventListener('resize', () => {
        if (!rainContext) return;
        resizeCanvas();
        builtSignature = '';
        refresh();
    });
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    reducedMotion.addEventListener('change', refresh);
    new MutationObserver(refresh).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    refresh();
})();
