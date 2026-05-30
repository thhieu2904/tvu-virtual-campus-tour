'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, GraduationCap, MapPin, Bot, ShieldCheck } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('Sai email hoặc mật khẩu. Vui lòng thử lại.')
      setLoading(false)
    } else {
      router.push('/admin')
      router.refresh()
    }
  }

  const features = [
    { icon: MapPin, text: 'Quản lý địa điểm & ảnh 360°' },
    { icon: Bot, text: 'Cấu hình đại sứ ảo AI' },
    { icon: GraduationCap, text: 'Học liệu RAG thông minh' },
    { icon: ShieldCheck, text: 'Bảo mật xác thực Supabase' },
  ]

  return (
    <div className="flex min-h-screen w-full">
      {/* Left Panel — Branded */}
      <div className="relative hidden w-[52%] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#053384] via-[#0a4cb8] to-[#062a6e] p-10 text-white lg:flex xl:p-14">
        {/* Decorative orbs */}
        <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/[0.04] blur-2xl" />
        <div className="pointer-events-none absolute bottom-16 right-10 h-56 w-56 rounded-full bg-[#e3b83c]/[0.08] blur-2xl" />
        <div className="pointer-events-none absolute right-1/3 top-1/3 h-40 w-40 rounded-full bg-white/[0.03] blur-xl" />

        {/* Top — Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-white/15 text-sm font-bold shadow-lg backdrop-blur-sm">
            TVU
          </div>
          <div>
            <p className="text-lg font-semibold leading-tight">TVU Virtual Tour</p>
            <p className="text-xs text-white/60">Hệ thống tham quan ảo</p>
          </div>
        </div>

        {/* Center — Hero */}
        <div className="relative z-10 -mt-8 space-y-8">
          <div>
            <div className="mb-4 inline-block rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-medium tracking-wide backdrop-blur-sm">
              ADMIN CONTROL CENTER
            </div>
            <h1 className="text-[2.6rem] font-bold leading-[1.15] tracking-tight xl:text-5xl">
              Trung tâm
              <br />
              <span className="bg-gradient-to-r from-[#e3b83c] to-[#f0d060] bg-clip-text text-transparent">
                điều phối nội dung
              </span>
            </h1>
            <p className="mt-5 max-w-md text-[0.94rem] leading-relaxed text-white/65">
              Quản trị toàn bộ dữ liệu, học liệu và trải nghiệm kiosk tham quan ảo
              khuôn viên Trường Đại học Trà Vinh.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {features.map((f) => (
              <div
                key={f.text}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3.5 backdrop-blur-sm transition-colors hover:bg-white/[0.1]"
              >
                <f.icon className="h-[18px] w-[18px] shrink-0 text-[#e3b83c]" />
                <span className="text-[0.82rem] leading-snug text-white/80">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom — Copyright */}
        <p className="relative z-10 text-xs text-white/35">
          © 2026 Trường Đại học Trà Vinh — Phát triển bởi nhóm TVU Digital
        </p>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-[#f6f8fb] px-6 py-12 sm:px-10">
        <div className="w-full max-w-[400px]">
          {/* Mobile-only logo */}
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#053384] text-sm font-bold text-white shadow-md">
              TVU
            </div>
            <span className="text-lg font-semibold text-[#10213f]">TVU Admin</span>
          </div>

          <div className="mb-2">
            <h2 className="text-2xl font-bold text-[#10213f]">
              Đăng nhập quản trị
            </h2>
            <p className="mt-2 text-[0.9rem] text-[#52627f]">
              Sử dụng tài khoản được cấp quyền admin để truy cập hệ thống.
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-8 space-y-5">
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[0.82rem] font-medium text-[#10213f]">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@tvu.edu.vn"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 rounded-xl border-[#d7e0f0] bg-white px-4 text-[0.9rem] shadow-sm transition-shadow focus:shadow-md"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[0.82rem] font-medium text-[#10213f]">
                Mật khẩu
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 rounded-xl border-[#d7e0f0] bg-white px-4 text-[0.9rem] shadow-sm transition-shadow focus:shadow-md"
              />
            </div>

            <Button
              className="h-11 w-full rounded-xl bg-[#053384] text-[0.9rem] font-semibold shadow-lg shadow-[#053384]/20 transition-all hover:bg-[#0a4cb8] hover:shadow-xl hover:shadow-[#053384]/25 active:scale-[0.98]"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Đang xác thực...
                </span>
              ) : (
                'Đăng nhập'
              )}
            </Button>
          </form>

          <p className="mt-10 text-center text-xs text-[#52627f]/60">
            Chỉ dành cho quản trị viên được ủy quyền
          </p>
        </div>
      </div>
    </div>
  )
}
