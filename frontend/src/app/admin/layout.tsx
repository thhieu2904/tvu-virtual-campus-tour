'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  MapPin,
  FileText,
  Image as ImageIcon,
  LogOut,
  Menu,
  Settings,
  Bot,
  ChevronRight,
  Database,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { TooltipProvider } from '@/components/ui/tooltip'

const navigation = [
  { name: 'Tổng quan', href: '/admin', icon: LayoutDashboard },
  { name: 'Địa điểm', href: '/admin/locations', icon: MapPin },
  { name: 'Tài liệu', href: '/admin/documents', icon: FileText },
  { name: 'Thư viện media', href: '/admin/media', icon: ImageIcon },
  { name: 'Đại sứ ảo', href: '/admin/mascots', icon: Bot },
  { name: 'Cache', href: '/admin/cache', icon: Database },
  { name: 'Cấu hình', href: '/admin/settings', icon: Settings },
]

function isNavActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState<string | null>(null)
  const isLoginPage = pathname === '/admin/login'

  // Hooks MUST be called before any conditional returns (Rules of Hooks)
  // Defense-in-depth: middleware handles server-side, this handles client-side
  useEffect(() => {
    if (isLoginPage) return // Skip fetching user on login page

    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/admin/login')
        router.refresh()
      } else {
        setEmail(user.email ?? null)
      }
    }
    checkAuth()
  }, [isLoginPage]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: 'local' })
    setEmail(null)
    router.replace('/admin/login')
    router.refresh()
  }

  const breadcrumb = useMemo(() => {
    const active = navigation.find((item) => isNavActive(pathname, item.href))
    if (!active || active.href === '/admin') return null
    return active
  }, [pathname])

  // Conditional return AFTER all hooks
  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <TooltipProvider>
      <div className="admin-shell flex h-screen w-full flex-col overflow-hidden bg-[#f6f8fb]">
        {/* ─── Top Bar ─── */}
        <header className="sticky top-0 z-30 flex h-[60px] shrink-0 items-center gap-4 border-b border-[#d7e0f0]/80 bg-white/95 px-4 backdrop-blur-md sm:px-6">
          {/* Mobile menu */}
          <Sheet>
            <SheetTrigger render={
              <Button size="icon" variant="ghost" className="sm:hidden" />
            }>
              <Menu className="h-5 w-5" />
              <span className="sr-only">Mở menu quản trị</span>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] bg-white sm:max-w-xs">
              <SheetTitle className="mb-6 flex items-center gap-2.5 text-lg font-bold text-[#10213f]">
                <div className="flex size-9 items-center justify-center rounded-lg bg-[#053384] text-xs font-bold text-white">
                  TVU
                </div>
                Admin Panel
              </SheetTitle>
              <SheetDescription className="sr-only">
                Menu điều hướng quản trị nội dung hệ thống Kiosk
              </SheetDescription>
              <nav className="grid gap-1 text-sm font-medium">
                {navigation.map((item) => {
                  const active = isNavActive(pathname, item.href)
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-all ${
                        active
                          ? 'bg-[#053384] text-white shadow-sm'
                          : 'text-[#52627f] hover:bg-[#eef3fb] hover:text-[#10213f]'
                      }`}
                    >
                      <item.icon className="h-[18px] w-[18px]" />
                      {item.name}
                    </Link>
                  )
                })}
              </nav>
            </SheetContent>
          </Sheet>

          {/* Logo + Brand */}
          <div className="mr-auto hidden items-center gap-3 sm:flex">
            <div className="flex size-9 items-center justify-center rounded-lg bg-[#053384] text-xs font-bold text-white shadow-sm">
              TVU
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[0.9rem] font-semibold text-[#10213f]">
                Admin Panel
              </span>
              {breadcrumb && (
                <span className="flex items-center gap-1.5 text-sm text-[#52627f]">
                  <ChevronRight className="h-3.5 w-3.5 text-[#d7e0f0]" />
                  <breadcrumb.icon className="h-3.5 w-3.5" />
                  {breadcrumb.name}
                </span>
              )}
            </div>
          </div>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="ghost" size="icon" className="rounded-full" />
            }>
              <Avatar className="h-8 w-8 border-2 border-[#d7e0f0]">
                <AvatarFallback className="bg-[#eef3fb] text-xs font-semibold text-[#053384]">
                  {email ? email.substring(0, 2).toUpperCase() : 'AD'}
                </AvatarFallback>
              </Avatar>
              <span className="sr-only">Mở menu tài khoản</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-medium">Tài khoản quản trị</DropdownMenuLabel>
                {email && (
                  <div className="px-2 py-1.5 text-xs text-[#52627f]">
                    {email}
                  </div>
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600 focus:text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* ─── Body ─── */}
        <div className="flex min-h-0 flex-1 w-full flex-col overflow-hidden sm:flex-row">
          {/* Sidebar */}
          <aside className="hidden h-full w-[260px] shrink-0 flex-col border-r border-[#d7e0f0]/80 bg-white sm:flex">
            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
              {navigation.map((item) => {
                const active = isNavActive(pathname, item.href)
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                      active
                        ? 'bg-[#053384] text-white shadow-sm shadow-[#053384]/20'
                        : 'text-[#52627f] hover:bg-[#f0f4fb] hover:text-[#10213f]'
                    }`}
                  >
                    <item.icon className={`h-[18px] w-[18px] transition-colors ${active ? 'text-white' : 'text-[#7a96c9] group-hover:text-[#053384]'}`} />
                    {item.name}
                  </Link>
                )
              })}
            </nav>

            {/* Sidebar footer */}
            <div className="border-t border-[#d7e0f0]/80 px-4 py-4">
              <div className="rounded-xl bg-gradient-to-br from-[#eef3fb] to-[#f6f8fb] p-3.5">
                <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-[#053384]/60">
                  TVU Virtual Tour
                </p>
                <p className="mt-1 text-[0.75rem] leading-relaxed text-[#52627f]">
                  Quản trị nội dung tham quan ảo khuôn viên đại học.
                </p>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
