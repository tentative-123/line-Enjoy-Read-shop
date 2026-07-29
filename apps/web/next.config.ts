import type { NextConfig } from 'next'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'))
const repoRoot = resolve(__dirname, '../..')

function readGitSha(): string | null {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return null
  }
}

const buildSha =
  process.env.APP_COMMIT_SHA || process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || readGitSha() || 'local'
const buildTime = process.env.APP_BUILD_TIME || new Date().toISOString()
const externalApiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '')
// Railway serves the static Admin and Backend on different `up.railway.app`
// sites. Modern browsers can block the Backend's cookie as third-party. The
// Admin nginx image therefore exposes a same-origin `/backend` reverse proxy.
const publicApiUrl = process.env.RAILWAY_ADMIN_PROXY === 'true' ? '/backend' : externalApiUrl

const nextConfig: NextConfig = {
  output: 'export',
  transpilePackages: ['@line-crm/shared'],
  env: {
    // Railway users commonly paste the Backend URL with a trailing slash. All
    // callers append `/api/...`, so canonicalize once at build time to prevent
    // requests such as `//api/auth/login`.
    NEXT_PUBLIC_API_URL: publicApiUrl,
    NEXT_PUBLIC_WORKER_PUBLIC_URL: externalApiUrl,
    APP_VERSION: pkg.version,
    APP_COMMIT_SHA: buildSha.slice(0, 12),
    APP_BUILD_TIME: buildTime,
  },
}
export default nextConfig
