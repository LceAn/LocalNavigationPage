// scripts/test/catalog.test.mjs — MCP / 技能目录生成器单测(node:test,零依赖)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskArg, parseMcpConfig, parseSkillMarkdown } from '../scan-catalog.mjs';

test('maskArg:敏感参数、URL 凭据、长 token 打码,普通路径保留', () => {
    assert.equal(maskArg('--token=abc123'), '--token=***');
    assert.equal(maskArg('--api-key=sk-live-123'), '--api-key=***');
    assert.equal(maskArg('https://user:pass@example.com/mcp'), 'https://***@example.com/mcp');
    assert.equal(maskArg('ghp_abcdefghijklmnopqrstuvwxyz0123456789'), '***');
    assert.equal(maskArg('/usr/local/bin/node'), '/usr/local/bin/node');
    assert.equal(maskArg('C:\\Users\\me\\server.mjs'), 'C:\\Users\\me\\server.mjs');
    assert.equal(maskArg('--verbose'), '--verbose');
});

test('parseMcpConfig:stdio/http 两种传输,env/headers 只留键名', () => {
    const out = parseMcpConfig({
        mcpServers: {
            fs: {
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem', '/data'],
                env: { API_TOKEN: 'secret', DEBUG: '1' }
            },
            lab: {
                type: 'http',
                url: 'http://192.168.1.10:3000/mcp',
                headers: { Authorization: 'Bearer x' },
                tools: 120,
                description: '实验室'
            },
            stream: { type: 'sse', url: 'https://example.com/sse' }
        }
    });

    const fs = out.find(item => item.name === 'fs');
    const lab = out.find(item => item.name === 'lab');
    assert.equal(fs.transport, 'stdio');
    assert.deepEqual(fs.envKeys, ['API_TOKEN', 'DEBUG']);
    assert.equal(fs.env, undefined, '不能带出 env 值');
    assert.equal(lab.transport, 'http');
    assert.equal(lab.url, 'http://192.168.1.10:3000/mcp');
    assert.deepEqual(lab.headerKeys, ['Authorization']);
    assert.equal(lab.tools, 120);
    assert.equal(out.find(item => item.name === 'stream').transport, 'sse');
});

test('parseMcpConfig:非法/空配置返回空数组或最小条目', () => {
    assert.deepEqual(parseMcpConfig(null), []);
    assert.deepEqual(parseMcpConfig({ mcpServers: [] }), []);
    const [minimal] = parseMcpConfig({ mcpServers: { bare: null } });
    assert.equal(minimal.name, 'bare');
    assert.equal(minimal.transport, 'stdio');
});

test('parseSkillMarkdown:解析 frontmatter、引号与标签', () => {
    const skill = parseSkillMarkdown(`---
name: "solve-ai-ctf"
description: 'CTF 题目分析'
tags: [ctf, reverse]
category: 安全
---

# 内容
`, 'solve-ai-ctf', '~/.workbuddy/skills/solve-ai-ctf');

    assert.equal(skill.name, 'solve-ai-ctf');
    assert.equal(skill.description, 'CTF 题目分析');
    assert.deepEqual(skill.tags, ['ctf', 'reverse']);
    assert.equal(skill.category, '安全');
    assert.equal(skill.path, '~/.workbuddy/skills/solve-ai-ctf');
    assert.equal(skill.enabled, true);
});

test('parseSkillMarkdown:无 frontmatter 时回退目录名', () => {
    const skill = parseSkillMarkdown('# 普通文档\n没有元数据', 'my-skill', '~/.workbuddy/skills/my-skill');
    assert.equal(skill.name, 'my-skill');
    assert.equal(skill.description, '');
    assert.deepEqual(skill.tags, []);
});
