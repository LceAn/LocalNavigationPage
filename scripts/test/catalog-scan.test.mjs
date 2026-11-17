// scripts/test/catalog-scan.test.mjs — 网页端「重新收集」服务端逻辑
// 覆盖：指定目录收集与打码、写回 catalog.json、空结果保留旧目录、首次空扫描。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectCatalog } from '../scan-catalog.mjs';
import { createCatalogService } from '../catalog-service.mjs';

async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'lnp-catalog-'));
    const mcpPath = join(root, 'mcp.json');
    const skillsDir = join(root, 'skills');
    const dataRoot = join(root, 'data');
    await mkdir(join(skillsDir, 'demo-skill'), { recursive: true });
    await mkdir(dataRoot, { recursive: true });
    await writeFile(mcpPath, JSON.stringify({
        mcpServers: {
            demo: {
                type: 'http',
                url: 'https://example.com/mcp',
                headers: { Authorization: 'Bearer secret-token' },
                env: { API_TOKEN: 'secret' },
                tools: 12
            }
        }
    }), 'utf8');
    await writeFile(join(skillsDir, 'demo-skill', 'SKILL.md'), [
        '---',
        'name: demo-skill',
        'description: 演示技能',
        'tags: [demo, test]',
        '---',
        '',
        '# 用法',
        ''
    ].join('\n'), 'utf8');
    return { root, mcpPath, skillsDir, dataRoot };
}

function serviceFor(fixture, { mcpPath = fixture.mcpPath, skillsDir = fixture.skillsDir } = {}) {
    return createCatalogService({
        dataRoot: fixture.dataRoot,
        defaultCatalogPath: join(fixture.root, 'catalog.json.default'),
        mcpConfigPath: mcpPath,
        skillsDir
    });
}

test('collectCatalog：读取指定 MCP 与技能目录，凭据只留键名', async () => {
    const fx = await fixture();
    try {
        const result = collectCatalog({ mcpPath: fx.mcpPath, skillsDir: fx.skillsDir });
        assert.equal(result.mcpServers.length, 1);
        assert.equal(result.mcpServers[0].name, 'demo');
        assert.deepEqual(result.mcpServers[0].headerKeys, ['Authorization']);
        assert.deepEqual(result.mcpServers[0].envKeys, ['API_TOKEN']);
        assert.equal(result.mcpServers[0].headers, undefined);
        assert.equal(result.mcpServers[0].env, undefined);
        assert.equal(result.skills.length, 1);
        assert.equal(result.skills[0].name, 'demo-skill');
        assert.deepEqual(result.document._meta.counts, { mcpServers: 1, skills: 1 });
    } finally {
        await rm(fx.root, { recursive: true, force: true });
    }
});

test('scanCatalog：写入扫描结果并返回计数', async () => {
    const fx = await fixture();
    try {
        const result = await serviceFor(fx).scanCatalog();
        assert.equal(result.skipped, false);
        assert.equal(result.written, true);
        assert.deepEqual(result.counts, { mcpServers: 1, skills: 1 });
        const saved = JSON.parse(await readFile(join(fx.dataRoot, 'catalog.json'), 'utf8'));
        assert.equal(saved.mcpServers[0].name, 'demo');
        assert.equal(saved.skills[0].name, 'demo-skill');
        assert.equal(saved._meta.counts.mcpServers, 1);
    } finally {
        await rm(fx.root, { recursive: true, force: true });
    }
});

test('scanCatalog：空结果保留已有目录，避免误点清空', async () => {
    const fx = await fixture();
    try {
        const emptyMcp = join(fx.root, 'empty-mcp.json');
        const emptySkills = join(fx.root, 'empty-skills');
        await writeFile(emptyMcp, JSON.stringify({ mcpServers: {} }), 'utf8');
        await mkdir(emptySkills, { recursive: true });
        const existing = {
            _meta: { counts: { mcpServers: 1, skills: 0 } },
            mcpServers: [{ name: 'keep-me' }],
            skills: []
        };
        await writeFile(join(fx.dataRoot, 'catalog.json'), JSON.stringify(existing), 'utf8');

        const result = await serviceFor(fx, { mcpPath: emptyMcp, skillsDir: emptySkills }).scanCatalog();
        assert.equal(result.skipped, true);
        assert.equal(result.reason, 'empty');
        assert.equal(result.written, false);
        const saved = JSON.parse(await readFile(join(fx.dataRoot, 'catalog.json'), 'utf8'));
        assert.equal(saved.mcpServers[0].name, 'keep-me');
    } finally {
        await rm(fx.root, { recursive: true, force: true });
    }
});

test('scanCatalog：首次扫描为空时写入空目录，保证页面可用', async () => {
    const fx = await fixture();
    try {
        const emptyMcp = join(fx.root, 'empty-mcp.json');
        const emptySkills = join(fx.root, 'empty-skills');
        await writeFile(emptyMcp, JSON.stringify({ mcpServers: {} }), 'utf8');
        await mkdir(emptySkills, { recursive: true });

        const result = await serviceFor(fx, { mcpPath: emptyMcp, skillsDir: emptySkills }).scanCatalog();
        assert.equal(result.skipped, false);
        assert.equal(result.written, true);
        assert.deepEqual(result.counts, { mcpServers: 0, skills: 0 });
        const saved = JSON.parse(await readFile(join(fx.dataRoot, 'catalog.json'), 'utf8'));
        assert.deepEqual(saved.mcpServers, []);
        assert.deepEqual(saved.skills, []);
    } finally {
        await rm(fx.root, { recursive: true, force: true });
    }
});
