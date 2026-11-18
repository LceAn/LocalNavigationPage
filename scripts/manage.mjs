#!/usr/bin/env node
// scripts/manage.mjs — 跨平台生命周期管理器
//
// 用法：node scripts/manage.mjs <command> [options]
//
// 命令：
//   install    安装为系统服务（开机自启）
//   uninstall  卸载服务（保留数据）
//   start      启动服务
//   stop       停止服务
//   restart    重启服务
//   status     查看运行状态
//   update     更新到最新版本（git pull + 重启）
//   logs       查看最近日志
//   info       显示安装信息（端口/路径/版本/OS）
//
// 选项：
//   --port N       指定端口（默认 8080）
//   --host IP      绑定地址（默认 0.0.0.0）
//   --offline      离线模式安装（从本地包安装，不 clone）

import { spawn, spawnSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, arch, homedir, userInfo } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OS = platform();
const ARCH = arch();
const IS_WIN = OS === 'win32';
const IS_MAC = OS === 'darwin';
const IS_LINUX = OS === 'linux';

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const APP_NAME = 'local-navigation-page';
const APP_LABEL = 'Local Navigation Page';

// ================= 配置 =================
function getConfig() {
    const args = process.argv.slice(2);
    const get = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined; };
    return {
        port: parseInt(get('--port'), 10) || 8080,
        host: get('--host') || '0.0.0.0',
        offline: args.includes('--offline'),
    };
}

// ================= 服务路径 =================
function servicePaths() {
    if (IS_LINUX) {
        return {
            unit: join(homedir(), '.config', 'systemd', 'user', `${APP_NAME}.service`),
            logs: join(ROOT, 'logs', 'service.log'),
            pid: join(ROOT, 'logs', 'service.pid'),
        };
    }
    if (IS_MAC) {
        return {
            plist: join(homedir(), 'Library', 'LaunchAgents', `com.${APP_NAME}.plist`),
            logs: join(ROOT, 'logs', 'service.log'),
            pid: join(ROOT, 'logs', 'service.pid'),
        };
    }
    // Windows
    const startupDir = join(homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    return {
        shortcut: join(startupDir, `${APP_LABEL}.lnk`),
        vbs: join(startupDir, `${APP_NAME}-start.vbs`),
        logs: join(ROOT, 'logs', 'service.log'),
        pid: join(ROOT, 'logs', 'service.pid'),
    };
}

// ================= 工具 =================
function log(msg, color = '') {
    const colors = { green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', reset: '\x1b[0m' };
    console.log(`${colors[color] || ''}${msg}${colors.reset || ''}`);
}

function sh(cmd, opts = {}) {
    const result = spawnSync(cmd, { shell: true, encoding: 'utf8', ...opts });
    return { ok: result.status === 0, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function checkNode() {
    const res = sh('node --version');
    if (!res.ok) return { ok: false, version: null };
    const version = res.stdout.trim().replace('v', '');
    const [major] = version.split('.').map(Number);
    return { ok: major >= 18, version };
}

function isRunning() {
    const { pid: pidFile } = servicePaths();
    if (!existsSync(pidFile)) return { running: false };
    try {
        const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
        if (!pid) return { running: false };
        // 检查进程是否存在
        if (IS_WIN) {
            const res = sh(`tasklist /FI "PID eq ${pid}" /NH`);
            return { running: res.stdout.includes(String(pid)), pid };
        }
        const res = sh(`kill -0 ${pid} 2>/dev/null`);
        return { running: res.ok, pid };
    } catch {
        return { running: false };
    }
}

// ================= 安装 =================
function cmdInstall() {
    const config = getConfig();
    log(`\n📦 安装 ${APP_LABEL} v${VERSION}`);
    log(`   OS: ${OS} (${ARCH})  端口: ${config.port}  模式: ${config.offline ? '离线' : '在线'}\n`);

    // 1. 检查 Node.js
    const node = checkNode();
    if (!node.ok) {
        log('❌ 需要 Node.js 18+（当前: ' + (node.version || '未安装') + '）', 'red');
        log('   下载: https://nodejs.org/', 'dim');
        process.exit(1);
    }
    log(`✅ Node.js v${node.version}`, 'green');

    // 2. 检查项目文件
    if (!existsSync(join(ROOT, 'HTML', 'index.html'))) {
        log('❌ 项目文件不完整（缺少 HTML/index.html）', 'red');
        process.exit(1);
    }
    log('✅ 项目文件完整', 'green');

    // 3. 创建日志目录
    mkdirSync(join(ROOT, 'logs'), { recursive: true });

    // 4. 注册系统服务
    if (IS_LINUX) return installSystemd(config);
    if (IS_MAC) return installLaunchd(config);
    return installWindows(config);
}

function installSystemd(config) {
    const { unit, logs } = servicePaths();
    mkdirSync(dirname(unit), { recursive: true });

    const unitContent = `[Unit]
Description=${APP_LABEL}
After=network.target

[Service]
Type=simple
ExecStart=${process.execPath} ${join(ROOT, 'scripts', 'serve.mjs')} ${config.port}
Environment=SERVE_HOST=${config.host}
Restart=on-failure
RestartSec=3
StandardOutput=append:${logs}
StandardError=append:${logs}
WorkingDirectory=${ROOT}

[Install]
WantedBy=default.target
`;
    writeFileSync(unit, unitContent);
    log(`✅ systemd 服务已创建: ${unit}`, 'green');

    sh('systemctl --user daemon-reload');
    sh('systemctl --user enable ' + APP_NAME);
    sh('systemctl --user start ' + APP_NAME);
    log('✅ 服务已启动并设为开机自启', 'green');
    log(`\n🌐 访问: http://127.0.0.1:${config.port}`, 'cyan');
    log(`   管理: systemctl --user {start|stop|status} ${APP_NAME}`, 'dim');
}

function installLaunchd(config) {
    const { plist, logs } = servicePaths();
    mkdirSync(dirname(plist), { recursive: true });

    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.${APP_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${process.execPath}</string>
        <string>${join(ROOT, 'scripts', 'serve.mjs')}</string>
        <string>${config.port}</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>SERVE_HOST</key>
        <string>${config.host}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${logs}</string>
    <key>StandardErrorPath</key>
    <string>${logs}</string>
    <key>WorkingDirectory</key>
    <string>${ROOT}</string>
</dict>
</plist>
`;
    writeFileSync(plist, plistContent);
    log(`✅ launchd 服务已创建: ${plist}`, 'green');

    sh(`launchctl load ${plist}`);
    log('✅ 服务已启动并设为开机自启', 'green');
    log(`\n🌐 访问: http://127.0.0.1:${config.port}`, 'cyan');
    log(`   管理: launchctl {load|unload} ${plist}`, 'dim');
}

function installWindows(config) {
    const { vbs, logs } = servicePaths();

    // 创建 VBS 启动脚本（开机自启，无弹窗）
    const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "${ROOT}"
WshShell.Run """${process.execPath}"" ""${join(ROOT, 'scripts', 'serve.mjs')}"" ${config.port}", 0, False
`;
    writeFileSync(vbs, vbsContent);
    log(`✅ 开机自启已创建: ${vbs}`, 'green');

    // 立即启动
    startService(config);
    log('✅ 服务已启动', 'green');

    // 防火墙提示
    log(`\n💡 如需局域网访问，请放行端口 ${config.port}:`, 'yellow');
    log(`   netsh advfirewall firewall add rule name="${APP_LABEL}" dir=in action=allow protocol=TCP localport=${config.port}`, 'dim');
    log(`\n🌐 访问: http://127.0.0.1:${config.port}`, 'cyan');
}

// ================= 服务控制 =================
function startService(config = getConfig()) {
    const { logs, pid: pidFile } = servicePaths();
    mkdirSync(dirname(logs), { recursive: true });

    const status = isRunning();
    if (status.running) {
        log(`✅ 服务已在运行 (PID: ${status.pid})`, 'green');
        return;
    }

    if (IS_LINUX) {
        sh('systemctl --user start ' + APP_NAME);
    } else if (IS_MAC) {
        sh(`launchctl start com.${APP_NAME}`);
    } else {
        // Windows: 后台启动
        const child = spawn(process.execPath, [join(ROOT, 'scripts', 'serve.mjs'), String(config.port)], {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, SERVE_HOST: config.host },
        });
        const logStream = writeFileSync(logs, `[${new Date().toISOString()}] Started PID ${child.pid}\n`);
        child.stdout.on('data', d => appendFileSync(logs, d));
        child.stderr.on('data', d => appendFileSync(logs, d));
        child.unref();
        writeFileSync(pidFile, String(child.pid));
    }
    log('✅ 服务已启动', 'green');
}

function stopService() {
    if (IS_LINUX) {
        sh('systemctl --user stop ' + APP_NAME);
        log('✅ 服务已停止', 'green');
    } else if (IS_MAC) {
        sh(`launchctl stop com.${APP_NAME}`);
        log('✅ 服务已停止', 'green');
    } else {
        const status = isRunning();
        if (status.running) {
            sh(`taskkill /PID ${status.pid} /F`);
            log(`✅ 服务已停止 (PID: ${status.pid})`, 'green');
        } else {
            log('ℹ️ 服务未在运行', 'yellow');
        }
        const { pid: pidFile } = servicePaths();
        if (existsSync(pidFile)) rmSync(pidFile);
    }
}

// ================= 状态 =================
function cmdStatus() {
    const config = getConfig();
    const status = isRunning();
    const { logs } = servicePaths();

    log(`\n📊 ${APP_LABEL} 状态`);
    log(`   版本: ${VERSION}`);
    log(`   平台: ${OS} (${ARCH})`);
    log(`   路径: ${ROOT}`);
    log(`   运行: ${status.running ? '✅ 运行中' : '❌ 已停止'}`);
    if (status.pid) log(`   PID: ${status.pid}`);

    // 端口检测
    const res = sh(IS_WIN ? `netstat -ano | findstr :${config.port} | findstr LISTENING` : `ss -tlnp | grep :${config.port}`);
    if (res.ok && res.stdout.trim()) {
        log(`   端口: ${config.port} ✅ 监听中`);
    } else {
        log(`   端口: ${config.port} ❌ 未监听`);
    }

    // 日志文件
    if (existsSync(logs)) {
        const size = readFileSync(logs).length;
        log(`   日志: ${logs} (${(size / 1024).toFixed(1)} KB)`);
    }

    // 服务注册状态
    const paths = servicePaths();
    const svcFile = paths.unit || paths.plist || paths.vbs;
    log(`   服务: ${svcFile && existsSync(svcFile) ? '✅ 已注册' : '❌ 未注册'}`);
    log('');
}

// ================= 卸载 =================
function cmdUninstall() {
    log(`\n🗑️ 卸载 ${APP_LABEL}\n`);

    // 1. 停止服务
    stopService();

    // 2. 注销系统服务
    const paths = servicePaths();
    if (IS_LINUX && existsSync(paths.unit)) {
        sh('systemctl --user disable ' + APP_NAME);
        sh('systemctl --user daemon-reload');
        rmSync(paths.unit);
        log('✅ systemd 服务已移除', 'green');
    } else if (IS_MAC && existsSync(paths.plist)) {
        sh(`launchctl unload ${paths.plist}`);
        rmSync(paths.plist);
        log('✅ launchd 服务已移除', 'green');
    } else if (IS_WIN && existsSync(paths.vbs)) {
        rmSync(paths.vbs);
        log('✅ 开机自启已移除', 'green');
    }

    // 3. 清理日志
    if (existsSync(join(ROOT, 'logs'))) {
        rmSync(join(ROOT, 'logs'), { recursive: true });
        log('✅ 日志已清理', 'green');
    }

    log('\n✅ 卸载完成（项目文件和用户数据保留在原目录）', 'green');
    log(`   如需彻底删除: rm -rf ${ROOT}`, 'dim');
}

// ================= 更新 =================
function cmdUpdate() {
    log('\n🔄 更新到最新版本...\n');

    const res = sh(`cd "${ROOT}" && git pull origin main`);
    if (!res.ok) {
        log('❌ git pull 失败（可能不是 git clone 安装的）', 'red');
        log('   离线安装请手动替换文件后运行 restart', 'dim');
        process.exit(1);
    }

    const output = res.stdout.trim();
    if (output.includes('Already up to date') || output.includes('已经是最新')) {
        log('✅ 已是最新版本', 'green');
    } else {
        log('✅ 已拉取最新代码', 'green');
        // 重启
        stopService();
        setTimeout(() => startService(), 500);
        log('✅ 服务已重启', 'green');
    }
}

// ================= 日志 =================
function cmdLogs() {
    const { logs } = servicePaths();
    if (!existsSync(logs)) {
        log('暂无日志', 'yellow');
        return;
    }
    const content = readFileSync(logs, 'utf8');
    const lines = content.split('\n');
    const recent = lines.slice(-50); // 最近 50 行
    log(`\n📋 最近日志 (最后 50 行):\n`);
    recent.forEach(l => console.log(l));
}

// ================= 信息 =================
function cmdInfo() {
    const config = getConfig();
    log(`\nℹ️ ${APP_LABEL}`);
    log(`   版本: ${VERSION}`);
    log(`   平台: ${OS} (${ARCH})`);
    log(`   Node: ${process.version}`);
    log(`   路径: ${ROOT}`);
    log(`   端口: ${config.port}`);
    log(`   绑定: ${config.host}`);
    log(`   数据: ${join(ROOT, 'HTML', 'data', 'links.json')}`);
    log('');
}

// ================= 主入口 =================
const command = process.argv[2];
const commands = { install: cmdInstall, uninstall: cmdUninstall, start: () => startService(), stop: stopService, restart: () => { stopService(); setTimeout(() => startService(), 500); }, status: cmdStatus, update: cmdUpdate, logs: cmdLogs, info: cmdInfo };

if (!command || !commands[command]) {
    log(`\n${APP_LABEL} 生命周期管理器 v${VERSION}\n`);
    log('用法: node scripts/manage.mjs <command>');
    log('');
    log('命令:');
    log('  install    安装为系统服务（开机自启）');
    log('  uninstall  卸载服务（保留数据）');
    log('  start      启动服务');
    log('  stop       停止服务');
    log('  restart    重启服务');
    log('  status     查看运行状态');
    log('  update     更新到最新版本');
    log('  logs       查看最近日志');
    log('  info       显示安装信息');
    log('');
    log('选项:');
    log('  --port N   指定端口（默认 8080）');
    log('  --host IP  绑定地址（默认 0.0.0.0）');
    log('');
    process.exit(0);
}

commands[command]();
