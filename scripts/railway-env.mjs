import { writeFileSync } from 'node:fs';

// Wrangler local mode reads Worker bindings from .dev.vars. Only explicitly
// allow-listed variables are copied; this avoids accidentally exposing every
// Railway/system variable to application code or logs.
const names = [
  'API_KEY', 'LEGACY_API_KEY', 'LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_SECRET',
  'LINE_CHANNEL_ID', 'LINE_LOGIN_CHANNEL_ID', 'LINE_LOGIN_CHANNEL_SECRET',
  'LIFF_URL', 'WORKER_URL', 'ADMIN_ORIGIN', 'ADMIN_ALLOW_CROSS_SITE',
  'ADMIN_COOKIE_SAMESITE', 'CAFE_SESSION_SECRET', 'QR_SIGNING_SECRET',
  'GATE_DEVICE_SECRET', 'CAFE_MOCK_GATE', 'STRIPE_WEBHOOK_SECRET',
  'X_HARNESS_URL', 'IG_HARNESS_URL', 'IG_HARNESS_LINK_SECRET',
];

const lines = names
  .filter((name) => process.env[name] !== undefined)
  .map((name) => `${name}=${JSON.stringify(process.env[name])}`);
writeFileSync('apps/worker/.dev.vars', `${lines.join('\n')}\n`, { mode: 0o600 });
