import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Only apply Supabase auth checks to /admin/* routes
  // Kiosk routes (/, /map-demo, etc.) are NOT affected
  if (request.nextUrl.pathname.startsWith('/admin')) {
    return await updateSession(request)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match /admin routes only.
     * Kiosk routes are completely excluded — no auth overhead.
     */
    '/admin/:path*',
  ],
}
