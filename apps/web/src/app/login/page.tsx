'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '')

    try {
      if (!apiUrl) {
        setError('NEXT_PUBLIC_API_URL is not set in build env')
        setLoading(false)
        return
      }
      // Exchange the API key for an HttpOnly session cookie. The key is never
      // stored in localStorage (removes the XSS-exposed credential).
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })

      if (res.ok) {
        localStorage.removeItem('lh_api_key')
        try {
          const parsed = await res.json() as {
            success?: boolean
            data?: { name?: string; role?: string }
            csrfToken?: string
          }
          if (parsed.success && parsed.data) {
            if (parsed.data.name) localStorage.setItem('lh_staff_name', parsed.data.name)
            if (parsed.data.role) localStorage.setItem('lh_staff_role', parsed.data.role)
          }
          // Cache the CSRF token for mutating requests (double-submit).
          if (parsed.csrfToken) {
            localStorage.setItem('lh_csrf', parsed.csrfToken)
          }
        } catch {
          // Profile / CSRF caching is best-effort.
        }

        // Do not navigate optimistically. On browsers that block a cross-site
        // Set-Cookie, the dashboard AuthGuard would immediately send the user
        // back to /login, which looks like a confusing flash. Verify that the
        // newly issued HttpOnly cookie is usable before leaving this page.
        const sessionRes = await fetch(`${apiUrl}/api/auth/session`, {
          credentials: 'include',
          cache: 'no-store',
        })
        if (!sessionRes.ok) {
          console.error('[admin-login] Login succeeded but session verification failed', {
            status: sessionRes.status,
          })
          setError(
            `密碼正確，但瀏覽器未保存登入 Cookie（HTTP ${sessionRes.status}）。` +
            '請允許此網站使用跨網站 Cookie，或使用同一主網域的 Admin／Backend 自訂網域。'
          )
          return
        }
        const sessionData = await sessionRes.json().catch(() => null)
        // `/api/auth/session` is protected by the Worker auth middleware. A 2xx
        // response already proves that the HttpOnly cookie was accepted. Older
        // Worker bundles can omit the optional `data` field after routing
        // through a mounted Hono sub-app; keep the profile cached from the
        // successful login response instead of creating a redirect loop.
        if (!sessionData?.success) {
          console.warn('[admin-login] Session verified with a legacy response payload', sessionData)
        }
        router.replace('/')
      } else if (res.status === 401) {
        setError('API Key 不正確，請確認輸入值與 Backend 的 API_KEY 完全相同。')
      } else {
        // Surface topology / configuration errors (e.g. cross-site cookie guard).
        let message = `登入失敗（HTTP ${res.status}）`
        try {
          const data = await res.json()
          if (data?.error) message = data.error
        } catch {
          // keep default message
        }
        setError(message)
      }
    } catch (cause) {
      // fetch() only rejects for network-level failures (DNS, TLS, CORS, or an
      // unreachable backend). A wrong API key is handled above as HTTP 401, so
      // do not misleadingly ask the operator to change the key here.
      const reason = cause instanceof Error ? cause.message : 'Unknown network error'
      console.error('[admin-login] Backend connection failed', { apiUrl, reason })
      setError(
        `無法連線至後端（${apiUrl}）。這不是 API Key 錯誤；請確認 Backend 網址可開啟，` +
        '並在 Backend 設定正確的 ADMIN_ORIGIN 後重新部署。'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#06C755' }}>
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg mx-auto mb-3" style={{ backgroundColor: '#06C755' }}>
            H
          </div>
          <h1 className="text-xl font-bold text-gray-900">Enjoy Read</h1>
          <p className="text-sm text-gray-500 mt-1">登入管理後台</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">管理員 API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="請輸入 Backend 的 API_KEY"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 mb-4">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !apiKey}
            className="w-full py-3 text-white font-medium rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#06C755' }}
          >
            {loading ? '登入中…' : '登入'}
          </button>
        </form>
      </div>
    </div>
  )
}
