'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false

    if (pathname === '/login') {
      setChecked(true)
      return () => { cancelled = true }
    }

    // Verify the session via the HttpOnly cookie. /api/auth/session returns the
    // staff identity and refreshes the CSRF token if it was lost (e.g. reload).
    const checkSession = async () => {
      try {
        localStorage.removeItem('lh_api_key')
        const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '')
        if (!apiUrl) throw new Error('NEXT_PUBLIC_API_URL is not configured')
        const res = await fetch(`${apiUrl}/api/auth/session`, { credentials: 'include' })
        if (!res.ok) {
          console.error('[auth-guard] Session request rejected', { status: res.status })
          throw new Error(`unauthenticated (${res.status})`)
        }
        const data = await res.json()
        if (!data?.success || !data?.data) {
          console.error('[auth-guard] Session response is missing staff data', data)
          throw new Error('unauthenticated (missing staff data)')
        }
        if (data.data.name) localStorage.setItem('lh_staff_name', data.data.name)
        if (data.data.role) localStorage.setItem('lh_staff_role', data.data.role)
        if (data.csrfToken) localStorage.setItem('lh_csrf', data.csrfToken)
        if (!cancelled) setChecked(true)
      } catch (error) {
        console.error('[auth-guard] Redirecting to login', error)
        if (!cancelled) router.replace('/login')
      }
    }

    checkSession()
    return () => { cancelled = true }
  }, [pathname, router])

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-[3px] border-gray-200 border-t-green-500 rounded-full" />
      </div>
    )
  }

  return <>{children}</>
}
