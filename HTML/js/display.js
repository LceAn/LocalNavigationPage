/* display.js — 显示设置：时钟 / 日期 / 天气（自 main.js 拆出，Phase 3）
 * 时间格式(12/24h)、极简大时钟、天气获取与中文翻译、显示开关。
 * 依赖 links-data.js / storage.js 全局函数；showMessage 经 window 桥接。
 * main.js 的每秒 interval 会调用本模块的 updateTimeDisplay。 */
const showMessage = (msg, type) => window.showMessage?.(msg, type);


// ================================
// 显示设置功能（时间、日期、天气）
// ================================

// 显示设置相关元素
const showTimeToggle = document.getElementById('show-time-toggle');
const showDateToggle = document.getElementById('show-date-toggle');
const showSecondsToggle = document.getElementById('show-seconds-toggle');
const show24HourToggle = document.getElementById('24hour-toggle');
const dateFormatSelect = document.getElementById('date-format-select');
const showWeatherToggle = document.getElementById('show-weather-toggle');
const weatherCityInput = document.getElementById('weather-city-input');
const weatherUnitSelect = document.getElementById('weather-unit-select');

// 时间日期显示设置默认值
const defaultDisplaySettings = {
    showTime: true,
    showDate: true,
    showSeconds: true,
    use24Hour: true,
    dateFormat: 'cn',
    showWeather: true,
    weatherCity: 'shanghai',
    weatherUnit: 'C'
};

// 加载显示设置
function loadDisplaySettings() {
    return {
        ...defaultDisplaySettings,
        ...(getSetting('displaySettings', {}) || {})
    };
}

// 显示设置缓存：避免时钟每秒 tick 都触发 localStorage + JSON.parse
let cachedDisplaySettings = null;
function getCachedDisplaySettings() {
    if (!cachedDisplaySettings) {
        cachedDisplaySettings = loadDisplaySettings();
    }
    return cachedDisplaySettings;
}

// 保存显示设置
function saveDisplaySettings(settings) {
    setSetting('displaySettings', settings);
    cachedDisplaySettings = settings; // 失效缓存，下次取最新
}

// 格式化日期
function formatDate(date, format) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekDay = weekDays[date.getDay()];
    
    switch(format) {
        case 'cn':
            return `${year}年${month}月${day}日`;
        case 'cn-short':
            return `${month}月${day}日`;
        case 'us':
            return `${month}/${day}/${year}`;
        case 'eu':
            return `${day}/${month}/${year}`;
        case 'iso':
            return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        case 'cn-week':
            return `${year}年${month}月${day}日 星期${weekDay}`;
        default:
            return `${year}年${month}月${day}日`;
    }
}

const timeDisplayCache = {
    timeElement: document.getElementById('current-time'),
    dateElement: document.getElementById('current-date'),
    weatherInfo: document.getElementById('weather-info'),
    lastTimeText: '',
    lastDateText: '',
    lastVisibilityKey: ''
};

function setElementDisplay(element, value) {
    if (element && element.style.display !== value) {
        element.style.display = value;
    }
}

// 更新时间显示
function updateTimeDisplay(force = false) {
    const settings = getCachedDisplaySettings();
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    if (!settings.use24Hour) {
        hours = hours % 12 || 12;
    }
    hours = settings.use24Hour ? String(hours).padStart(2, '0') : String(hours);
    
    let timeText = settings.use24Hour
        ? `${hours}:${minutes}`
        : `${hours}:${minutes} ${ampm}`;
    
    if (settings.showSeconds) {
        timeText = settings.use24Hour
            ? `${hours}:${minutes}:${seconds}`
            : `${hours}:${minutes}:${seconds} ${ampm}`;
    }

    const dateText = formatDate(now, settings.dateFormat);
    const visibilityKey = [
        settings.showTime,
        settings.showDate,
        settings.showWeather
    ].join('|');

    if (timeDisplayCache.timeElement && (force || timeDisplayCache.lastTimeText !== timeText)) {
        timeDisplayCache.timeElement.textContent = timeText;
        timeDisplayCache.lastTimeText = timeText;
    }

    if (timeDisplayCache.dateElement && (force || timeDisplayCache.lastDateText !== dateText)) {
        timeDisplayCache.dateElement.textContent = dateText;
        timeDisplayCache.lastDateText = dateText;
    }

    if (force || timeDisplayCache.lastVisibilityKey !== visibilityKey) {
        setElementDisplay(timeDisplayCache.timeElement, settings.showTime ? 'inline-flex' : 'none');
        setElementDisplay(timeDisplayCache.dateElement, settings.showDate ? 'inline-flex' : 'none');
        setElementDisplay(timeDisplayCache.weatherInfo, settings.showWeather ? 'inline-flex' : 'none');
        timeDisplayCache.lastVisibilityKey = visibilityKey;
    }
}

// 初始化显示设置 UI
function initDisplaySettings() {
    const settings = loadDisplaySettings();
    
    if (showTimeToggle) showTimeToggle.checked = settings.showTime;
    if (showDateToggle) showDateToggle.checked = settings.showDate;
    if (showSecondsToggle) showSecondsToggle.checked = settings.showSeconds;
    if (show24HourToggle) show24HourToggle.checked = settings.use24Hour;
    if (dateFormatSelect) dateFormatSelect.value = settings.dateFormat;
    if (showWeatherToggle) showWeatherToggle.checked = settings.showWeather;
    if (weatherCityInput) weatherCityInput.value = settings.weatherCity;
    if (weatherUnitSelect) weatherUnitSelect.value = settings.weatherUnit;
    
    // 绑定事件
    if (showTimeToggle) {
        showTimeToggle.addEventListener('change', function() {
            const settings = loadDisplaySettings();
            settings.showTime = this.checked;
            saveDisplaySettings(settings);
            updateTimeDisplay();
            showMessage(this.checked ? '已显示时间' : '已隐藏时间');
        });
    }
    
    if (showDateToggle) {
        showDateToggle.addEventListener('change', function() {
            const settings = loadDisplaySettings();
            settings.showDate = this.checked;
            saveDisplaySettings(settings);
            updateTimeDisplay();
            showMessage(this.checked ? '已显示日期' : '已隐藏日期');
        });
    }
    
    if (showSecondsToggle) {
        showSecondsToggle.addEventListener('change', function() {
            const settings = loadDisplaySettings();
            settings.showSeconds = this.checked;
            saveDisplaySettings(settings);
            updateTimeDisplay();
            showMessage(this.checked ? '已显示秒数' : '已隐藏秒数');
        });
    }
    
    if (show24HourToggle) {
        show24HourToggle.addEventListener('change', function() {
            const settings = loadDisplaySettings();
            settings.use24Hour = this.checked;
            saveDisplaySettings(settings);
            updateTimeDisplay();
            showMessage(this.checked ? '已使用 24 小时制' : '已使用 12 小时制');
        });
    }
    
    if (dateFormatSelect) {
        dateFormatSelect.addEventListener('change', function() {
            const settings = loadDisplaySettings();
            settings.dateFormat = this.value;
            saveDisplaySettings(settings);
            updateTimeDisplay();
            showMessage('已更新日期格式');
        });
    }
    
    if (showWeatherToggle) {
        showWeatherToggle.addEventListener('change', function() {
            const settings = loadDisplaySettings();
            settings.showWeather = this.checked;
            saveDisplaySettings(settings);
            updateTimeDisplay();
            showMessage(this.checked ? '已显示天气' : '已隐藏天气');
        });
    }
    
    if (weatherCityInput) {
        weatherCityInput.addEventListener('change', function() {
            const settings = loadDisplaySettings();
            settings.weatherCity = this.value.trim() || 'shanghai';
            saveDisplaySettings(settings);
            updateWeather();
            showMessage('已更新城市设置');
        });
    }
    
    if (weatherUnitSelect) {
        weatherUnitSelect.addEventListener('change', function() {
            const settings = loadDisplaySettings();
            settings.weatherUnit = this.value;
            saveDisplaySettings(settings);
            updateWeather();
            showMessage(`已更新温度单位为${this.value === 'C' ? '摄氏度' : '华氏度'}`);
        });
    }
}

// 更新天气功能（支持多地区）
function updateWeather() {
    const settings = loadDisplaySettings();
    const cities = settings.weatherCity.split(',').map(c => c.trim()).filter(c => c);
    const unit = settings.weatherUnit === 'F' ? 'F' : 'C';
    const weatherLocationsEl = document.getElementById('weather-locations');
    const weatherLocationText = document.getElementById('weather-location-text');
    
    if (cities.length === 0) {
        if (weatherLocationsEl) weatherLocationsEl.style.display = 'none';
        return;
    }
    
    // 如果只有一个城市，不显示地区名称
    if (cities.length === 1) {
        if (weatherLocationsEl) weatherLocationsEl.style.display = 'none';
        fetchWeatherForCity(cities[0], unit, 'weather-text');
    } else {
        // 多城市：显示第一个城市的天气，并在后面显示所有城市名称
        if (weatherLocationsEl) {
            weatherLocationsEl.style.display = 'inline-flex';
            weatherLocationText.textContent = cities.join(' / ');
        }
        fetchWeatherForCity(cities[0], unit, 'weather-text');
    }
}

// 获取指定城市的天气
function fetchWeatherForCity(city, unit, elementId) {
    const weatherText = document.getElementById(elementId);
    if (weatherText) {
        weatherText.textContent = '加载中...';
        weatherText.classList.add('loading');
        weatherText.classList.remove('loaded');
    }

    const shortTextParams = new URLSearchParams({
        format: '%C %t',
        [unit === 'F' ? 'u' : 'm']: ''
    });
    const jsonParams = new URLSearchParams({
        format: 'j1',
        [unit === 'F' ? 'u' : 'm']: ''
    });

    const jsonUrl = `https://wttr.in/${encodeURIComponent(city)}?${jsonParams.toString()}&lang=zh`;
    const shortTextUrl = `https://wttr.in/${encodeURIComponent(city)}?${shortTextParams.toString()}`;

    function renderWeatherText(text) {
        let cleanedText = text.trim().replace(/\s+/g, ' ');
        cleanedText = translateWeatherText(cleanedText);
        const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(cleanedText) || cleanedText.includes('<!DOCTYPE');
        // 正常短文本由 %C %t 组成，必然包含温度符号 °；
        // wttr.in 偶尔把气象警报文本塞进 %C 字段，识别后按不可用处理
        const looksLikeAlert = !cleanedText.includes('°');
        if (weatherText) {
            weatherText.textContent = looksLikeHtml || looksLikeAlert || cleanedText.length > 48
                ? '天气暂不可用'
                : cleanedText;
            weatherText.classList.remove('loading');
            weatherText.classList.add('loaded');
        }
    }

    // hover 天气胶囊时显示详细数据（湿度/风/体感/能见度等）
    function attachWeatherDetail(detail, unit) {
        const weatherInfo = document.getElementById('weather-info');
        if (!weatherInfo || !detail) return;
        // 翻译风向
        const dirMap = { N:'北', NNE:'北偏东', NE:'东北', ENE:'东偏北', E:'东', ESE:'东偏南', SE:'东南', SSE:'南偏东', S:'南', SSW:'南偏西', SW:'西南', WSW:'西偏南', W:'西', WNW:'西偏北', NW:'西北', NNW:'北偏西' };
        const uvDesc = (uv) => uv < 3 ? '低' : uv < 6 ? '中等' : uv < 8 ? '高' : uv < 11 ? '很高' : '极强';
        const rows = [];
        if (detail.city) rows.push(['城市', detail.city]);
        if (detail.feelsLike !== undefined) rows.push(['体感', `${detail.feelsLike}°${unit}`]);
        if (detail.humidity) rows.push(['湿度', `${detail.humidity}%`]);
        if (detail.windSpeed) rows.push(['风力', `${detail.windSpeed} ${unit==='F'?'mph':'km/h'}${detail.windDir ? ' ' + (dirMap[detail.windDir] || detail.windDir) : ''}`]);
        if (detail.visibility) rows.push(['能见度', `${detail.visibility} km`]);
        if (detail.pressure) rows.push(['气压', `${detail.pressure} hPa`]);
        if (detail.uvIndex !== undefined) rows.push(['紫外线', `${detail.uvIndex}（${uvDesc(Number(detail.uvIndex))}）`]);

        if (!rows.length) return;
        // 构建详情浮层（移除旧的）
        let popover = weatherInfo.querySelector('.weather-detail');
        if (popover) popover.remove();
        popover = document.createElement('div');
        popover.className = 'weather-detail';
        popover.innerHTML = rows.map(([k, v]) =>
            `<div class="weather-detail-row"><span class="weather-detail-label">${k}</span><span class="weather-detail-value">${escapeHTML(String(v))}</span></div>`
        ).join('');
        weatherInfo.appendChild(popover);
        weatherInfo.classList.add('has-detail');
    }

    // wttr.in 返回的天气描述是英文，这里翻译成中文（覆盖常见词组 + 整句兜底）
    function translateWeatherText(text) {
        // wttr.in 短文本常见整句（如 "Partly cloudy, 25°C"）按词组逐个替换
        const phrases = [
            [/thundery outbreaks/i, '雷阵雨'], [/outbreaks/i, ''], [/ in /i, ' '],
            [/sunny/i, '晴'], [/clear/i, '晴'],
            [/partly cloudy/i, '多云'], [/partly clear/i, '多云'],
            [/cloudy/i, '阴'], [/overcast/i, '阴'],
            [/mist/i, '薄雾'], [/fog/i, '雾'], [/foggy/i, '雾'],
            [/drizzle/i, '小雨'], [/light rain/i, '小雨'], [/light shower/i, '小雨'],
            [/heavy rain/i, '大雨'], [/heavy shower/i, '大雨'],
            [/moderate rain/i, '中雨'], [/rain/i, '雨'], [/shower/i, '阵雨'],
            [/thunder/i, '雷'], [/thunderstorm/i, '雷阵雨'],
            [/light snow/i, '小雪'], [/heavy snow/i, '大雪'], [/moderate snow/i, '中雪'],
            [/snow/i, '雪'], [/blizzard/i, '暴风雪'], [/sleet/i, '雨夹雪'],
            [/hail/i, '冰雹'], [/ice/i, '冰'],
            [/wind/i, '大风'], [/breezy/i, '微风'], [/gust/i, '阵风'],
            [/haze/i, '霾'], [/hazy/i, '霾'], [/dust/i, '沙尘'],
            [/hot/i, '炎热'], [/cold/i, '寒冷'], [/warm/i, '温暖'],
            [/humid/i, '潮湿'], [/freezing/i, '严寒'],
            [/patchy/i, '局部'], [/nearby/i, '附近'], [/occasional/i, '偶有'],
            [/light/i, '小'], [/heavy/i, '大'], [/moderate/i, '中']
        ];
        // 先尝试整词替换（按短语长度从长到短，避免短词先命中）
        phrases.sort((a, b) => b[0].source.length - a[0].source.length);
        let translated = text;
        for (const [re, cn] of phrases) {
            translated = translated.replace(re, cn);
        }
        // 处理重复词（如两个"多云"）
        translated = translated.replace(/(多云|阴|晴|雾|雪|雷|雨)\1+/g, '$1');
        // 合并相邻的"强度词+降水词"：小雨 阵雨→小阵雨，大雪 雪→大雪，小雨 雨→小雨
        translated = translated.replace(/(小|大|中)\s*(阵雨|雷阵雨|雨|雪|冰雹)/g, '$1$2');
        // 多个降水词相邻只留最有信息量的（阵雨/雷阵雨 > 雨 > 雪）
        translated = translated.replace(/(阵雨|雷阵雨|小雨|中雨|大雨|雨)\s*(阵雨|雷阵雨|小雨|中雨|大雨|雨)/g, (m, a, b) => {
            const order = ['雷阵雨','阵雨','小雨','中雨','大雨','雨'];
            return order.includes(a) ? a : b;
        });
        translated = translated.replace(/(小|大|中)(小|大|中)+/g, '$1');
        // 清理多余空格（"局部 小雪"→"局部小雪"）
        translated = translated.replace(/(?<=[\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '').replace(/\s{2,}/g, ' ').trim();
        return translated;
    }

    function fetchShortTextWeather() {
        return fetch(shortTextUrl, {
            headers: {
                Accept: 'text/plain'
            }
        })
            .then(res => {
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                return res.text();
            })
            .then(renderWeatherText);
    }

    fetch(jsonUrl, {
        headers: {
            Accept: 'application/json'
        }
    })
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            return res.json();
        })
        .then(data => {
            const current = data?.current_condition?.[0];
            const description = current?.lang_zh?.[0]?.value || current?.weatherDesc?.[0]?.value || '';
            const temp = unit === 'F' ? current?.temp_F : current?.temp_C;
            if (!description || temp === undefined) {
                throw new Error('天气数据不完整');
            }
            renderWeatherText(`${description} ${temp}°${unit}`);

            // 保存详细数据，供 hover 详情显示
            const detail = {
                humidity: current?.humidity,          // 湿度 %
                windSpeed: unit === 'F' ? current?.windspeedMiles : current?.windspeedKmph, // 风速
                windDir: current?.winddir16Point,      // 风向
                feelsLike: unit === 'F' ? current?.FeelsLikeF : current?.FeelsLikeC,        // 体感温度
                visibility: current?.visibility,       // 能见度 km
                pressure: current?.pressure,           // 气压 hPa
                uvIndex: current?.uvIndex,              // 紫外线指数
                city: data?.nearest_area?.[0]?.areaName?.[0]?.value || city // 城市名
            };
            attachWeatherDetail(detail, unit);
        })
        .catch(() => fetchShortTextWeather())
        .catch(() => {
            if (weatherText) {
                weatherText.textContent = '获取失败';
                weatherText.classList.remove('loading');
                weatherText.classList.add('loaded');
            }
        });
}

// 初始化显示设置
initDisplaySettings();
updateTimeDisplay();
updateWeather();
