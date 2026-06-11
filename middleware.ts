import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_ROUTES = [
  '/blog',
  '/faq',
  '/login',
  '/register',
  '/admin/login',
  '/admin/register',
  '/reset-password',
]

const AUTH_REQUIRED = ['/payment', '/chat', '/boost']
const ADMIN_REQUIRED = ['/admin/dashboard', '/admin/blog', '/admin/leaks']

const BOT_PATTERNS = [
  'googlebot', 'google-inspectiontool', 'googleother', 'adsbot-google',
  'mediapartners-google', 'bingbot', 'bingpreview', 'msnbot',
  'yandexbot', 'yandexmobilebot', 'baiduspider',
  'duckduckbot', 'facebookexternalhit', 'facebookcatalog',
  'twitterbot', 'linkedinbot', 'applebot',
  'whatsapp', 'telegrambot', 'discordbot', 'slackbot',
  'pinterestbot', 'ahrefsbot', 'semrushbot', 'mj12bot',
  'rogerbot', 'dotbot', 'crawler', 'spider',
]

function isBot(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent')?.toLowerCase() ?? ''
  return BOT_PATTERNS.some(p => ua.includes(p))
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Bots skip all gates and get full content immediately
  if (isBot(request)) {
    return NextResponse.next()
  }

  // Public routes skip age verification
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  // Auth-required: redirect to login if no cookie token
  if (AUTH_REQUIRED.some(r => pathname.startsWith(r))) {
    const token = request.cookies.get('auth_token')?.value
    if (!token) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }
  }

  // Admin-required: redirect to admin login
  if (ADMIN_REQUIRED.some(r => pathname.startsWith(r))) {
    const adminToken = request.cookies.get('admin_token')?.value
    if (!adminToken) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      return NextResponse.redirect(url)
    }
  }

  // Age gate: signal to client via header; client reads cookie 'age_verified'
  const ageVerified = request.cookies.get('age_verified')?.value === 'true'
  const response = NextResponse.next()
  if (!ageVerified) {
    response.headers.set('x-age-gate-required', 'true')
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.ico$|.*\\.js$|.*\\.css$|.*\\.json$).*)',
  ],
}
