/* atmosphere-settings.js — 设置 → 氛围：天气特效的强度/速度/分项开关/预览，以及漂浮物
 * 数据统一存进 displaySettings（沿用 display.js 的读写函数），刷新后保留。 */
(() => {
    const DEFAULTS = {
        weatherEffectIntensity: 'normal',
        weatherEffectSpeed: 'normal',
        weatherEffectOff: [],
        weatherDayNight: true,
        ambientParticle: 'none',
        ambientParticleDensity: 55,
        ambientParticleSpeed: 50
    };
    const PREVIEW_MS = 6000;

    function read() {
        const base = typeof loadDisplaySettings === 'function' ? loadDisplaySettings() : {};
        return { ...DEFAULTS, ...base };
    }

    function write(patch) {
        if (typeof saveDisplaySettings !== 'function') return;
        saveDisplaySettings({ ...read(), ...patch });
    }

    function toast(message) {
        window.showMessage?.(message);
    }

    /* ---------- 分段选择器：强度 / 速度 ---------- */
    function bindSegmented(id, key, onChange) {
        const root = document.getElementById(id);
        if (!root) return;
        const buttons = [...root.querySelectorAll('button[data-value]')];
        const current = read()[key] || DEFAULTS[key];
        buttons.forEach(btn => btn.setAttribute('aria-checked', String(btn.dataset.value === current)));
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.getAttribute('aria-checked') === 'true') return;
                buttons.forEach(b => b.setAttribute('aria-checked', String(b === btn)));
                write({ [key]: btn.dataset.value });
                onChange?.(btn.dataset.value);
            });
        });
    }

    const refreshFx = () => window.refreshWeatherAtmosphere?.();

    bindSegmented('fx-intensity', 'weatherEffectIntensity', value => {
        refreshFx();
        toast(`粒子强度：${{ light: '轻', normal: '标准', strong: '强烈' }[value] || value}`);
    });
    bindSegmented('fx-speed', 'weatherEffectSpeed', value => {
        refreshFx();
        toast(`动画速度：${{ slow: '慢', normal: '正常', fast: '快' }[value] || value}`);
    });

    /* ---------- 昼夜感知 ---------- */
    const dayNightToggle = document.getElementById('weather-day-night-toggle');
    if (dayNightToggle) {
        dayNightToggle.checked = read().weatherDayNight !== false;
        dayNightToggle.addEventListener('change', () => {
            write({ weatherDayNight: dayNightToggle.checked });
            refreshFx();
            toast(dayNightToggle.checked ? '已开启昼夜感知' : '已关闭昼夜感知');
        });
    }

    /* ---------- 分天气开关 ---------- */
    const offSet = () => new Set(read().weatherEffectOff || []);
    document.querySelectorAll('#fx-conditions input[data-fx]').forEach(input => {
        input.checked = !offSet().has(input.dataset.fx);
        input.addEventListener('change', () => {
            const set = offSet();
            if (input.checked) set.delete(input.dataset.fx);
            else set.add(input.dataset.fx);
            write({ weatherEffectOff: [...set] });
            refreshFx();
        });
    });

    /* ---------- 立即预览 ---------- */
    const previewRoot = document.getElementById('fx-preview');
    let previewTimer = 0;

    function endPreview() {
        window.clearTimeout(previewTimer);
        document.body.classList.remove('fx-previewing');
        window.previewWeatherAtmosphere?.(null);
    }

    if (previewRoot) {
        const buttons = [...previewRoot.querySelectorAll('.fx-preview-btn')];
        const markPlaying = kind => buttons.forEach(btn => btn.classList.toggle('is-playing', Boolean(kind) && btn.dataset.kind === kind));
        buttons.forEach(btn => {
            btn.addEventListener('click', event => {
                event.stopPropagation(); // 别让这次点击冒泡到「点按结束预览」
                const kind = btn.dataset.kind || '';
                window.clearTimeout(previewTimer);
                if (!kind) {
                    markPlaying('');
                    document.body.classList.remove('fx-previewing');
                    window.previewWeatherAtmosphere?.(null);
                    return;
                }
                window.previewWeatherAtmosphere?.(kind, PREVIEW_MS);
                markPlaying(kind);
                // 让出画面：面板淡出，直接看全屏效果；任意点击或 6 秒后恢复
                document.body.classList.add('fx-previewing');
                toast('预览中 · 点击任意处结束');
                previewTimer = window.setTimeout(endPreview, PREVIEW_MS);
            });
        });
        window.addEventListener('lnp:weather-preview-end', () => {
            markPlaying('');
            document.body.classList.remove('fx-previewing');
        });
        // 预览期间点一下空白处即可结束（捕获阶段拦截：否则会顺带触发「点遮罩关闭设置」）
        document.getElementById('settings-container')?.addEventListener('click', event => {
            if (!document.body.classList.contains('fx-previewing')) return;
            if (event.target.closest?.('#fx-preview')) return;
            event.preventDefault();
            event.stopPropagation();
            endPreview();
        }, true);
    }

    /* ---------- 漂浮物 ---------- */
    const particleRoot = document.getElementById('particle-types');
    if (particleRoot) {
        const cards = [...particleRoot.querySelectorAll('.particle-card')];
        const current = read().ambientParticle;
        cards.forEach(card => card.setAttribute('aria-pressed', String(card.dataset.particle === current)));
        cards.forEach(card => {
            card.addEventListener('click', () => {
                cards.forEach(c => c.setAttribute('aria-pressed', String(c === card)));
                write({ ambientParticle: card.dataset.particle });
                window.refreshAmbientParticles?.();
            });
        });
    }

    const densityInput = document.getElementById('particle-density');
    const densityValue = document.getElementById('particle-density-value');
    if (densityInput) {
        densityInput.value = String(read().ambientParticleDensity);
        if (densityValue) densityValue.textContent = densityInput.value;
        densityInput.addEventListener('input', () => {
            if (densityValue) densityValue.textContent = densityInput.value;
        });
        densityInput.addEventListener('change', () => {
            write({ ambientParticleDensity: Number(densityInput.value) });
            window.refreshAmbientParticles?.();
        });
    }

    const speedInput = document.getElementById('particle-speed');
    const speedValue = document.getElementById('particle-speed-value');
    if (speedInput) {
        speedInput.value = String(read().ambientParticleSpeed);
        if (speedValue) speedValue.textContent = speedInput.value;
        speedInput.addEventListener('input', () => {
            if (speedValue) speedValue.textContent = speedInput.value;
        });
        speedInput.addEventListener('change', () => {
            write({ ambientParticleSpeed: Number(speedInput.value) });
            window.refreshAmbientParticles?.();
        });
    }
})();
