/* ai-models.js — AI 模型看板的数据层（1.36.0）
 * 本地 AI 服务（Ollama / LM Studio / vLLM / One API 等 OpenAI 兼容网关）的模型发现。
 * 依赖 links-data.js 的 getSafeLinkUrls / getPreferredUrlInfo；无 DOM 依赖，便于单测。
 *
 * 两种检测通道：
 *  - 导航服务器（catalog-service inspectAi）：无 CORS 限制，可跨机
 *  - 浏览器直连（probeAiModels）：静态部署或服务器不可用时的降级
 */

// 把 /v1/models（OpenAI 兼容）或 /api/tags（Ollama 原生）的原始响应统一为模型列表
function normalizeAiModels(api, data) {
    if (api === 'ollama') {
        const list = Array.isArray(data?.models) ? data.models : [];
        return list.map(model => ({
            id: String(model.name || ''),
            size: Number(model.size) || null,
            modifiedAt: model.modified_at || '',
            family: model.details?.family || '',
            parameterSize: model.details?.parameter_size || '',
            quantization: model.details?.quantization_level || '',
            format: model.details?.format || ''
        })).filter(model => model.id);
    }
    const list = Array.isArray(data?.data) ? data.data : [];
    return list.map(model => ({
        id: String(model.id || ''),
        ownedBy: model.owned_by || '',
        createdAt: Number(model.created) || null
    })).filter(model => model.id);
}

function formatModelBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    const gb = bytes / (1000 ** 3);
    if (gb >= 1) return gb.toFixed(gb >= 10 ? 0 : 1) + ' GB';
    return (bytes / (1000 ** 2)).toFixed(0) + ' MB';
}

// 接入配置：给 OpenAI SDK / curl 用的最小片段
function buildAiClientConfig(address, apiKey, model) {
    const base = String(address || '').replace(/\/+$/, '') + '/v1';
    return {
        base_url: base,
        api_key: apiKey ? '<API Key>' : 'ollama',
        model: model || '<模型名>'
    };
}

// ---- 浏览器直连探测（带 60s 内存缓存，多地址逐个尝试）----

const AI_PROBE_CACHE = new Map(); // address → { count, expires }
const AI_PROBE_ATTEMPTS = [['/v1/models', 'openai'], ['/api/tags', 'ollama']];

async function fetchAiModelsDirect(address, apiKey, timeoutMs = 3500) {
    for (const [path, api] of AI_PROBE_ATTEMPTS) {
        try {
            const response = await fetch(address.replace(/\/+$/, '') + path, {
                headers: { Accept: 'application/json', ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}) },
                signal: AbortSignal.timeout(timeoutMs)
            });
            if (!response.ok) continue;
            const data = await response.json();
            const models = normalizeAiModels(api, data);
            if (!models.length) continue;
            return { api, models, endpoint: address };
        } catch { /* 尝试下一个端点 */ }
    }
    return null;
}

// 卡片徽标用的轻量探测：只关心数量，命中缓存直接返回
function probeAiModelCount(link) {
    const urls = getSafeLinkUrls(link).filter(url => isSafeUrl(url.address, ['http:', 'https:']));
    if (!urls.length) return Promise.resolve(null);
    const address = (getPreferredUrlInfo(link, urls) || urls[0]).address;
    const apiKey = String(link.aiApiKey || '');
    const cached = AI_PROBE_CACHE.get(address);
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.count);
    return fetchAiModelsDirect(address, apiKey)
        .then(result => {
            const count = result ? result.models.length : 0;
            AI_PROBE_CACHE.set(address, { count, expires: Date.now() + 60000 });
            return count;
        })
        .catch(() => 0);
}

window.normalizeAiModels = normalizeAiModels;
window.formatModelBytes = formatModelBytes;
window.buildAiClientConfig = buildAiClientConfig;
window.fetchAiModelsDirect = fetchAiModelsDirect;
window.probeAiModelCount = probeAiModelCount;
