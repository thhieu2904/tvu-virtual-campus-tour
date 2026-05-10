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
  Bot
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { TooltipProvider } from '@/components/ui/tooltip'

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Locations', href: '/admin/locations', icon: MapPin },
  { name: 'Knowledge Base', href: '/admin/documents', icon: FileText },
  { name: 'Media Gallery', href: '/admin/media', icon: ImageIcon },
  { name: 'Mascots', href: '/admin/mascots', icon: Bot },
  { name: 'Settings', href: '/admin/settings', icon: Settings },
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
      <div className="flex min-h-screen w-full flex-col bg-muted/40">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 sm:py-4">
          <Sheet>
            <SheetTrigger render={
              <Button size="icon" variant="outline" className="sm:hidden" />
            }>
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle Menu</span>
            </SheetTrigger>
            <SheetContent side="left" className="sm:max-w-xs">
              <SheetTitle className="text-xl font-bold mb-4">TVU Admin</SheetTitle>
              <SheetDescription className="sr-only">
                Menu điều hướng quản trị nội dung hệ thống Kiosk
              </SheetDescription>
              <nav className="grid gap-6 text-lg font-medium">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-4 px-2.5 ${
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
          
          <div className="flex w-full items-center justify-between sm:justify-end gap-4 md:ml-auto md:gap-2 lg:gap-4">
            <div className="hidden font-semibold text-lg sm:flex items-center gap-2 mr-auto text-primary">
              <Bot className="h-6 w-6" />
              TVU Virtual Campus Tour Admin
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="secondary" size="icon" className="rounded-full" />
              }>
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{email ? email.substring(0, 2).toUpperCase() : 'AD'}</AvatarFallback>
                </Avatar>
                <span className="sr-only">Toggle user menu</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                {email && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    {email}
                  </div>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        
        <div className="flex flex-1 w-full flex-col sm:flex-row">
          <aside className="hidden w-64 flex-col border-r bg-background sm:flex">
            <nav className="grid gap-2 items-start px-4 text-sm font-medium pt-4">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                    pathname === item.href
                      ? 'bg-primary text-primary-foreground'
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
