import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, ComponentType, SVGProps } from 'react'

import { cn } from '@/lib/utils'

/* ─── Page Header ─── */
export function AdminPageHeader({
  title,
  description,
  meta,
  actions,
}: {
  title: string
  description?: string
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-[1.6rem] font-bold leading-tight tracking-[-0.01em] text-[#10213f] md:text-[1.85rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-3xl text-[0.85rem] leading-6 text-[#52627f]">
            {description}
          </p>
        )}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ─── Panel (Card container) ─── */
export function AdminPanel({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-[#d7e0f0]/80 bg-white shadow-sm shadow-[#053384]/[0.03]',
        className,
      )}
    >
      {(title || description || action) && (
        <div className="flex flex-col gap-3 border-b border-[#d7e0f0]/70 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            {title && (
              <h2 className="text-[0.95rem] font-semibold leading-tight text-[#10213f]">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-[0.8rem] text-[#52627f]">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/* ─── Notice (Alert) ─── */
export function AdminNotice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'danger'
  children: ReactNode
}) {
  const toneClass = {
    info: 'border-[#053384]/15 bg-[#eef3fb] text-[#053384]',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    danger: 'border-red-200 bg-red-50 text-red-700',
  }[tone]

  return (
    <div className={cn('rounded-xl border px-4 py-3 text-sm font-medium', toneClass)}>
      {children}
    </div>
  )
}

/* ─── Select ─── */
export function AdminSelect({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 rounded-xl border border-[#d7e0f0] bg-white px-3 text-sm text-[#10213f] shadow-sm outline-none transition-all focus:border-[#7a96c9] focus:ring-3 focus:ring-[#7a96c9]/15 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

/* ─── Textarea ─── */
export function AdminTextarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-xl border border-[#d7e0f0] bg-white px-3.5 py-2.5 text-sm text-[#10213f] shadow-sm outline-none transition-all focus:border-[#7a96c9] focus:ring-3 focus:ring-[#7a96c9]/15 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

/* ─── Modal ─── */
export function AdminModal({
  title,
  children,
  footer,
}: {
  title: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#08142b]/55 p-4 backdrop-blur-sm">
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#d7e0f0] bg-white shadow-2xl shadow-[#053384]/10">
        <div className="border-b border-[#d7e0f0] px-6 py-5">
          <h2 className="text-lg font-bold text-[#10213f]">{title}</h2>
        </div>
        <div className="px-6 py-5">{children}</div>
        <div className="flex justify-end gap-2 border-t border-[#d7e0f0] bg-[#f6f8fb] px-6 py-4">
          {footer}
        </div>
      </div>
    </div>
  )
}

/* ─── Switch ─── */
export function AdminSwitch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-[#d7e0f0] p-4 transition-colors',
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-[#f6f8fb]',
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#10213f]">{label}</p>
        {description && <p className="mt-0.5 text-xs text-[#52627f]">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200',
          checked ? 'bg-[#053384]' : 'bg-[#d7e0f0]',
        )}
      >
        <span
          className={cn(
            'inline-block h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-[22px]' : 'translate-x-[3px]',
          )}
        />
      </button>
    </label>
  )
}

/* ─── Empty State ─── */
export function AdminEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {Icon && (
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-[#eef3fb]">
          <Icon className="h-7 w-7 text-[#7a96c9]" />
        </div>
      )}
      <p className="text-sm font-semibold text-[#10213f]">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-[0.82rem] text-[#52627f]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ─── Skeleton ─── */
export function AdminSkeleton({
  className,
  variant = 'line',
}: {
  className?: string
  variant?: 'line' | 'card' | 'circle'
}) {
  const base = 'animate-pulse rounded-xl bg-[#eef3fb]'
  const defaults = {
    line: 'h-4 w-full',
    card: 'h-32 w-full',
    circle: 'h-10 w-10 rounded-full',
  }

  return <div className={cn(base, defaults[variant], className)} />
}

/* ─── Stat Card ─── */
export function AdminStatCard({
  icon: Icon,
  title,
  value,
  color = '#053384',
}: {
  icon: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>
  title: string
  value: string | number
  color?: string
}) {
  return (
    <div className="rounded-2xl border border-[#d7e0f0]/80 bg-white p-5 shadow-sm shadow-[#053384]/[0.02] transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.8rem] font-medium text-[#52627f]">{title}</p>
          <p className="mt-2 text-[1.8rem] font-bold leading-none tracking-tight text-[#10213f]">
            {value}
          </p>
        </div>
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${color}10`, color }}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

/* ─── Category Badge Style ─── */
export function categoryStyle(color?: string | null) {
  return color
    ? {
        borderColor: `${color}55`,
        backgroundColor: `${color}14`,
        color,
      }
    : undefined
}
