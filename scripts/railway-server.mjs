import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, access, writeFile } from 'node:fs/promises';
import process from 'node:process';

const publicPort = Number(process.env.PORT || 8080);
const internalPort = Number(process.env.RAILWAY_INTERNAL_PORT || 8788);
const dataDir = process.env.RAILWAY_DATA_DIR || '/data';
const persistDir = `${dataDir}/wrangler`;
const marker = `${dataDir}/.line-harness-initialized`;
let phase = 'starting';
let upstreamReady = false;
let child;

function log(message) {
  console.log(`[railway] ${message}`);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    log(`執行：${command} ${args.join(' ')}`);
    const process = spawn(command, args, { stdio: 'inherit', env: globalThis.process.env });
    process.once('error', reject);
    process.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} 結束，code=${code ?? 'null'} signal=${signal ?? 'none'}`));
    });
  });
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function proxyRequest(request, response) {
  if (!upstreamReady) {
    response.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'retry-after': '5' });
    response.end(JSON.stringify({ success: false, error: { code: 'STARTING', message: '服務正在初始化，請稍後再試。' } }));
    return;
  }

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = { ...request.headers };
  delete headers.host;
  delete headers.connection;

  try {
    const upstream = await fetch(`http://127.0.0.1:${internalPort}${request.url}`, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : body,
      redirect: 'manual',
    });
    const responseHeaders = Object.fromEntries(upstream.headers.entries());
    delete responseHeaders['set-cookie'];
    // Admin login issues both an HttpOnly session cookie and a CSRF cookie.
    // Preserve them as separate headers instead of joining them with commas.
    const setCookies = upstream.headers.getSetCookie?.() ?? [];
    if (setCookies.length) response.setHeader('set-cookie', setCookies);
    response.writeHead(upstream.status, responseHeaders);
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error('[railway] 反向代理錯誤：', error);
    response.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ success: false, error: { code: 'UPSTREAM_UNAVAILABLE', message: '後端服務暫時無法連線。' } }));
  }
}

// Bind Railway's PORT immediately. The health endpoint remains available while
// the first boot creates SQLite tables; normal traffic receives 503 until the
// Worker is actually ready.
const server = createServer((request, response) => {
  if (request.url === '/healthz' || request.url === '/api/health' || request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ success: true, data: { status: upstreamReady ? 'ok' : 'initializing', phase } }));
    return;
  }
  void proxyRequest(request, response);
});

server.listen(publicPort, '0.0.0.0', () => {
  log(`Railway health server 已監聽 0.0.0.0:${publicPort}`);
});

async function waitForWorker() {
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    if (child?.exitCode !== null) throw new Error(`Worker 在就緒前結束，code=${child?.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${internalPort}/api/health`);
      if (response.ok) return;
    } catch {
      // Wrangler is still compiling/starting.
    }
    if (attempt % 10 === 0) log(`等待 Worker 就緒中（${attempt}/90）`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('Worker 在 90 秒內沒有就緒');
}

async function start() {
  await mkdir(persistDir, { recursive: true });
  phase = 'environment';
  await import('./railway-env.mjs');

  if (!(await fileExists(marker))) {
    phase = 'database-bootstrap';
    log('偵測到新的 Volume，開始建立資料庫（只會在第一次執行）');
    await run('pnpm', ['--filter', 'worker', 'exec', 'wrangler', 'd1', 'execute', 'line-harness', '--local', '--persist-to', persistDir, '--file', '../../packages/db/bootstrap.sql']);
    phase = 'cafe-migration';
    await run('pnpm', ['--filter', 'worker', 'exec', 'wrangler', 'd1', 'execute', 'line-harness', '--local', '--persist-to', persistDir, '--file', '../../packages/db/migrations/050_unmanned_cafe.sql']);
    await writeFile(marker, `${new Date().toISOString()}\n`, { mode: 0o600 });
    log('資料庫初始化完成');
  } else {
    log('找到既有資料庫 marker，略過首次初始化');
  }

  phase = 'worker-start';
  child = spawn('pnpm', [
    '--filter', 'worker', 'exec', 'wrangler', 'dev', '--local',
    '--persist-to', persistDir, '--ip', '127.0.0.1', '--port', String(internalPort),
    '--no-show-interactive-dev-session',
  ], { stdio: 'inherit', env: process.env });
  child.once('error', (error) => {
    console.error('[railway] 無法啟動 Worker：', error);
    process.exitCode = 1;
    server.close();
  });
  child.once('exit', (code, signal) => {
    if (phase !== 'stopping') console.error(`[railway] Worker 意外結束，code=${code} signal=${signal}`);
    process.exit(code ?? 1);
  });

  await waitForWorker();
  upstreamReady = true;
  phase = 'ready';
  log(`Enjoy Read 已就緒：http://0.0.0.0:${publicPort}`);
}

function shutdown(signal) {
  phase = 'stopping';
  upstreamReady = false;
  log(`收到 ${signal}，正在安全停止`);
  child?.kill(signal);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((error) => {
  phase = 'failed';
  console.error('[railway] 啟動失敗：', error);
  setTimeout(() => process.exit(1), 1_000).unref();
});
