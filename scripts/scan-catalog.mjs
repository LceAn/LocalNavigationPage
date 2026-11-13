#!/usr/bin/env node
// scripts/scan-catalog.mjs — 收集本机 MCP 服务与技能，生成导航页目录
//
// 用法：
//   npm run catalog                         读取 ~/.workbuddy/mcp.json + ~/.workbuddy/skills
//   npm run catalog -- --mcp <path>         指定 MCP 配置
//   npm run catalog -- --skills <dir>       指定技能目录
//   npm run catalog -- --out <path>         指定输出路径（默认 HTML/data/catalog.json）
//
// 安全：只输出 env/headers 的键名，不输出值；args 中的 token/secret 会被打码。
// 输出文件含私有地址，已在 .gitignore / .dockerignore 中排除。

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const home = homedir();

const SENSITIVE_FLAG = /(token|secret|password|passwd|api[-_]?key|auth|credential)/i;
const TOKEN_PREFIX = /^(gh[pousr]_|sk-|xox[baprs]-|glpat-)/i;

export function maskArg(value) {
    const arg = String(value ?? '');
    // --token=xxx / --api-key xxx 这类参数
    const flagValue = arg.match(/^(--?[^=]+)=(.+)$/);
    if (flagValue && SENSITIVE_FLAG.test(flagValue[1])) return `${flagValue[1]}=***`;
    // URL 里的 user:pass@
    if (/^[a-z]+:\/\/[^/@]+@/i.test(arg)) {
        return arg.replace(/^([a-z]+:\/\/)[^/@]+@/i, '$1***@');
    }
    // 独立的长 token（不含路径分隔符，避免误伤文件路径）
    if (!/[\\/]/.test(arg) && (TOKEN_PREFIX.test(arg) || /^[A-Za-z0-9_-]{32,}$/.test(arg))) {
        return '***';
    }
    return arg;
}

export function parseMcpConfig(document) {
    const servers = document?.mcpServers;
    if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return [];

    return Object.entries(servers)
        .map(([name, config]) => {
            if (!config || typeof config !== 'object') return { name, transport: 'stdio' };
            const url = typeof config.url === 'string' ? config.url.trim() : '';
            const type = String(config.type || '').toLowerCase();
            const transport = type === 'http' || type === 'sse' ? type : (url ? 'http' : 'stdio');
            const envKeys = config.env && typeof config.env === 'object' ? Object.keys(config.env) : [];
            const headerKeys = config.headers && typeof config.headers === 'object' ? Object.keys(config.headers) : [];
            const tools = Number(config.tools);

            return {
                name,
                description: String(config.description || ''),
                transport,
                ...(url ? { url } : {}),
                ...(config.command ? { command: String(config.command) } : {}),
                ...(Array.isArray(config.args) ? { args: config.args.map(maskArg) } : {}),
                ...(envKeys.length ? { envKeys } : {}),
                ...(headerKeys.length ? { headerKeys } : {}),
                ...(Number.isFinite(tools) && tools > 0 ? { tools } : {}),
                ...(Array.isArray(config.tags) ? { tags: config.tags.map(String) } : {})
            };
        })
        .filter(entry => entry && entry.name)
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function parseSkillMarkdown(text, dirName = '', displayPath = '') {
    const source = String(text || '');
    const frontmatter = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    const meta = {};

    if (frontmatter) {
        for (const line of frontmatter[1].split('\n')) {
            const match = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
            if (!match) continue;
            meta[match[1].toLowerCase()] = match[2].trim().replace(/^["']|["']$/g, '');
        }
    }

    const rawTags = String(meta.tags || '').replace(/^\[|\]$/g, '');
    return {
        name: meta.name || dirName,
        description: meta.description || meta.summary || '',
        category: meta.category || '',
        tags: rawTags
            ? rawTags.split(',').map(tag => tag.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
            : [],
        path: displayPath || dirName,
        enabled: true
    };
}

function shorten(filePath) {
    const normalized = String(filePath || '');
    const homePrefix = home.replace(/\\/g, '/');
    const value = normalized.replace(/\\/g, '/');
    return value.startsWith(homePrefix) ? '~' + value.slice(homePrefix.length) : value;
}

function readMcpConfig(filePath) {
    if (!existsSync(filePath)) return [];
    try {
        return parseMcpConfig(JSON.parse(readFileSync(filePath, 'utf8')));
    } catch (error) {
        console.warn(`[catalog] MCP 配置解析失败：${filePath} (${error.message})`);
        return [];
    }
}

function readSkills(skillsDir) {
    if (!existsSync(skillsDir)) return [];
    const entries = [];
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const skillFile = join(skillsDir, entry.name, 'SKILL.md');
        if (!existsSync(skillFile)) continue;
        try {
            entries.push(parseSkillMarkdown(
                readFileSync(skillFile, 'utf8'),
                entry.name,
                shorten(skillFile.replace(/[\\/]SKILL\.md$/i, ''))
            ));
        } catch (error) {
            console.warn(`[catalog] 技能解析失败：${entry.name} (${error.message})`);
        }
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const valueOf = (flag) => {
        const index = args.indexOf(flag);
        if (index === -1) return null;
        const value = args[index + 1];
        return value && !value.startsWith('--') ? value : null;
    };

    return {
        mcpPath: resolve(valueOf('--mcp') || join(home, '.workbuddy', 'mcp.json')),
        skillsDir: resolve(valueOf('--skills') || join(home, '.workbuddy', 'skills')),
        outPath: resolve(valueOf('--out') || join(root, 'HTML', 'data', 'catalog.json'))
    };
}

async function main() {
    const { mcpPath, skillsDir, outPath } = parseArgs(process.argv);

    console.log('📚 收集 MCP 与技能...\n');
    const mcpServers = readMcpConfig(mcpPath);
    const skills = readSkills(skillsDir);

    const output = {
        _meta: {
            generatedAt: new Date().toISOString(),
            source: 'scripts/scan-catalog.mjs',
            mcpConfig: shorten(mcpPath),
            skillsDir: shorten(skillsDir),
            counts: { mcpServers: mcpServers.length, skills: skills.length }
        },
        mcpServers,
        skills
    };

    writeFileSync(outPath, JSON.stringify(output, null, 4) + '\n', 'utf8');

    console.log(`  MCP：${mcpServers.length} 个${mcpServers.length ? `（${mcpServers.map(item => item.name).join(', ')}）` : ''}`);
    console.log(`  技能：${skills.length} 个${skills.length ? `（${skills.slice(0, 6).map(item => item.name).join(', ')}${skills.length > 6 ? '…' : ''}）` : ''}`);
    console.log(`\n  已写入：${outPath}`);
    if (mcpServers.length === 0 && !existsSync(mcpPath)) {
        console.log(`  ⚠️ 未找到 MCP 配置：${mcpPath}（可用 --mcp 指定）`);
    }
    if (skills.length === 0 && !existsSync(skillsDir)) {
        console.log(`  ⚠️ 未找到技能目录：${skillsDir}（可用 --skills 指定）`);
    }
}

const isDirectRun = process.argv[1] &&
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
    main().catch(error => {
        console.error('收集失败:', error.message);
        process.exit(1);
    });
}
