// scripts/test/scan-local.test.mjs — 扫描脚本的解析/分类单元测试(node:test,零依赖)
// 重点覆盖跨平台差异：Windows netstat、ss（有/无 pid）、Linux netstat、lsof。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseListeningOutput,
  parseWindowsTasklist,
  isExcludedPort,
  isNonHttpPort,
  schemeForPort,
  inferCategory,
  inferName,
  classifyService,
  parseArgs
} from '../scan-local.mjs';

const WIN_NETSTAT = `
活动连接

  协议  本地地址          外部地址        状态           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1024
  TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       4321
  TCP    127.0.0.1:7890         0.0.0.0:0              LISTENING       999
  TCP    [::]:8080              [::]:0                 LISTENING       4321
  TCP    192.168.1.10:54321     1.1.1.1:443            ESTABLISHED     777
`;

const SS_WITH_PID = `
State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
LISTEN 0      4096   0.0.0.0:22          0.0.0.0:*         users:(("sshd",pid=6000,fd=3))
LISTEN 0      128    [::]:8080           [::]:*            users:(("node",pid=8123,fd=20))
LISTEN 0      4096   127.0.0.53%lo:53    0.0.0.0:*
LISTEN 0      128    0.0.0.0:9090        0.0.0.0:*
`;

const NETSTAT_LINUX = `
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      1234/sshd
tcp6       0      0 :::3000                 :::*                    LISTEN      5678/node
`;

const LSOF = `
node    8123 lcean   20u  IPv4 0x1234      0t0  TCP *:8080 (LISTEN)
mysqld  2345 lcean   30u  IPv6 0x5678      0t0  TCP [::1]:3306 (LISTEN)
node    8123 lcean   21u  IPv4 0x9999      0t0  TCP 127.0.0.1:8080->127.0.0.1:50000 (ESTABLISHED)
`;

test('parseListeningOutput(win32):解析 IPv4/IPv6,排除系统端口与动态端口', () => {
  const out = parseListeningOutput(WIN_NETSTAT, 'win32');
  assert.deepEqual(out.map(item => item.port), [7890, 8080]);
  assert.equal(out[0].pid, 999);
  assert.equal(out[0].addr, '127.0.0.1');
  assert.equal(out[1].pid, 4321);
  assert.equal(out[1].addr, '0.0.0.0');
});

test('parseListeningOutput(Linux ss):有 pid 时解析进程', () => {
  const out = parseListeningOutput(SS_WITH_PID, 'linux');
  const ssh = out.find(item => item.port === 22);
  const web = out.find(item => item.port === 8080);
  assert.equal(ssh.pid, 6000);
  assert.equal(web.pid, 8123);
});

test('parseListeningOutput(Linux ss):非 root 无 users 段时仍保留端口', () => {
  const out = parseListeningOutput(SS_WITH_PID, 'linux');
  const prom = out.find(item => item.port === 9090);
  assert.ok(prom, '没有 pid 的 LISTEN 行不能丢');
  assert.equal(prom.pid, 0);
  // 53 由主流程按非 HTTP 端口跳过，解析层仍应保留（才能汇总提示）
  assert.equal(out.find(item => item.port === 53)?.pid, 0);
});

test('parseListeningOutput(Linux netstat):兼容 tcp / tcp6 两种行', () => {
  const out = parseListeningOutput(NETSTAT_LINUX, 'linux');
  assert.deepEqual(out.map(item => item.port), [22, 3000]);
  assert.equal(out[0].pid, 1234);
  assert.equal(out[1].pid, 5678);
});

test('parseListeningOutput(macOS lsof):只收 LISTEN,忽略已建立连接', () => {
  const out = parseListeningOutput(LSOF, 'darwin');
  assert.deepEqual(out.map(item => item.port), [3306, 8080]);
  assert.equal(out[1].pid, 8123);
});

test('parseWindowsTasklist:解析 CSV 进程表', () => {
  const map = parseWindowsTasklist('"chrome.exe","1234","Console","1","120,000 K"\n"node.exe","4321","Console","1","80,000 K"\n');
  assert.equal(map.get(1234), 'chrome.exe');
  assert.equal(map.get(4321), 'node.exe');
  assert.equal(map.get(9999), undefined);
});

test('isExcludedPort:系统端口/动态端口/越界值一律排除', () => {
  for (const port of [135, 445, 49152, 55000, 65535, 65536, 0, -1, 1.5]) {
    assert.equal(isExcludedPort(port), true, String(port));
  }
  for (const port of [80, 8080, 32400, 49151]) {
    assert.equal(isExcludedPort(port), false, String(port));
  }
});

test('非 HTTP 端口与 https 端口判定', () => {
  for (const port of [22, 3306, 5432, 6379, 27017, 5672]) {
    assert.equal(isNonHttpPort(port), true, String(port));
  }
  assert.equal(isNonHttpPort(8080), false);
  assert.equal(schemeForPort(443), 'https');
  assert.equal(schemeForPort(8443), 'https');
  assert.equal(schemeForPort(8080), 'http');
});

test('inferCategory:端口表 > 进程名 > 端口段兜底', () => {
  assert.equal(inferCategory(8080, ''), 'Web 服务');          // 端口表
  assert.equal(inferCategory(10584, 'Thunder.exe'), '下载');   // 进程名
  assert.equal(inferCategory(9999, 'mihomo-windows-amd64.exe'), '代理');
  assert.equal(inferCategory(3500, ''), '开发工具');           // 端口段
  assert.equal(inferCategory(65000, ''), '其他服务');
});

test('inferName:标题 > 端口名 > 进程名', () => {
  assert.equal(inferName(8080, 'node', 'Jellyfin'), 'Jellyfin');
  assert.equal(inferName(443, ''), 'HTTPS 服务');
  assert.equal(inferName(7890, 'mihomo.exe'), 'Clash / Mihomo 代理');
  assert.equal(inferName(9999, 'mihomo.exe'), 'Mihomo :9999');
});

test('classifyService:数据库端口不生成链接,8443 走 https', () => {
  const db = classifyService(3306, 'mysqld');
  assert.equal(db.linkable, false);
  assert.equal(db.category, '数据库');

  const web = classifyService(8443, '');
  assert.equal(web.linkable, true);
  assert.equal(web.scheme, 'https');

  assert.equal(classifyService(22, 'sshd').linkable, false);
});

test('parseArgs:默认值、--probe、非法参数', () => {
  const defaults = parseArgs(['node', 'scan-local.mjs']);
  assert.equal(defaults.probe, false);
  assert.equal(defaults.host, '127.0.0.1');
  assert.ok(defaults.out.endsWith('links-local.json'));

  const custom = parseArgs(['node', 'scan-local.mjs', '--probe', '--host', '192.168.1.10']);
  assert.equal(custom.probe, true);
  assert.equal(custom.host, '192.168.1.10');

  // IPv6 需要方括号才能拼出合法 URL
  assert.equal(parseArgs(['node', 'scan-local.mjs', '--host', 'fe80::1']).host, '[fe80::1]');
  assert.equal(parseArgs(['node', 'scan-local.mjs', '--host', '[fe80::1]']).host, '[fe80::1]');

  assert.throws(() => parseArgs(['node', 'scan-local.mjs', '--host']), /--host/);
  assert.throws(() => parseArgs(['node', 'scan-local.mjs', '--out']), /--out/);
  assert.throws(() => parseArgs(['node', 'scan-local.mjs', '--host', 'a b']), /合法/);
});
