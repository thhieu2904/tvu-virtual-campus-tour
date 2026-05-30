'use client'

import { useEffect, useState } from 'react'
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
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { TooltipProvider } from '@/components/ui/tooltip'

const navigation = [
  { name: 'Tổng quan', href: '/admin', icon: LayoutDashboard },
  { name: 'Địa điểm', href: '/admin/locations', icon: MapPin },
  { name: 'Danh mục tài liệu', href: '/admin/documents', icon: FileText },
  { name: 'Thư viện media', href: '/admin/media', icon: ImageIcon },
  { name: 'Đại sứ ảo', href: '/admin/mascots', icon: Bot },
  { name: 'Cấu hình kiosk', href: '/admin/settings', icon: Settings },
]

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
    await supabase.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  // Conditional return AFTER all hooks
  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <TooltipProvider>
      <div className="admin-shell flex min-h-screen w-full flex-col bg-[#f6f8fb]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/80 bg-background/95 px-4 backdrop-blur sm:static sm:h-auto sm:bg-transparent sm:px-6 sm:py-4">
          <Sheet>
            <SheetTrigger render={
              <Button size="icon" variant="outline" className="sm:hidden" />
            }>
              <Menu className="h-5 w-5" />
              <span className="sr-only">Mở menu quản trị</span>
            </SheetTrigger>
            <SheetContent side="left" className="sm:max-w-xs">
              <SheetTitle className="mb-4 text-xl font-bold">Quản trị TVU Tour</SheetTitle>
              <SheetDescription className="sr-only">
                Menu điều hướng quản trị nội dung hệ thống Kiosk
              </SheetDescription>
              <nav className="grid gap-3 text-base font-medium">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                      pathname === item.href
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.name}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
          
          <div className="flex w-full items-center justify-between gap-4 sm:justify-end md:ml-auto md:gap-2 lg:gap-4">
            <div className="mr-auto hidden items-center gap-3 sm:flex">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm">
                TVU
              </div>
              <div>
                <div className="text-base font-semibold leading-tight text-primary">
                  Bảng quản trị TVU Tour
                </div>
                <div className="text-xs font-medium text-muted-foreground">
                  Trung tâm quản trị nội dung tham quan ảo
                </div>
              </div>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="secondary" size="icon" className="rounded-full" />
              }>
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{email ? email.substring(0, 2).toUpperCase() : 'AD'}</AvatarFallback>
                </Avatar>
                <span className="sr-only">Mở menu tài khoản</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Tài khoản quản trị</DropdownMenuLabel>
                {email && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    {email}
                  </div>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        
        <div className="flex flex-1 w-full flex-col sm:flex-row">
          <aside className="hidden w-[280px] flex-col border-r border-border/80 bg-background sm:flex">
            <div className="px-5 py-5">
              <div className="rounded-lg border border-primary/15 bg-primary/5 p-4">
                <p className="text-xs font-semibold uppercase text-primary">Trung tâm điều phối</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Quản trị dữ liệu học liệu, địa điểm và trải nghiệm kiosk.
                </p>
              </div>
            </div>
            <nav className="grid items-start gap-1 px-4 text-sm font-medium">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                    pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-primary'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="flex-1 p-4 sm:p-6 sm:px-8">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
