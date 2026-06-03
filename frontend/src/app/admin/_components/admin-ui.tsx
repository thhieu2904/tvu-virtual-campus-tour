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
  className,
  bodyClassName,
}: {
  title: string
  children: ReactNode
  footer: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#08142b]/55 p-4 backdrop-blur-sm">
      <div className={cn("flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#d7e0f0] bg-white shadow-2xl shadow-[#053384]/10", className)}>
        <div className="shrink-0 border-b border-[#d7e0f0] px-6 py-5">
          <h2 className="text-lg font-bold text-[#10213f]">{title}</h2>
        </div>
        <div className={cn("min-h-0 overflow-y-auto px-6 py-5", bodyClassName)}>{children}</div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-[#d7e0f0] bg-[#f6f8fb] px-6 py-4">
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

/* ─── Workbench ─── */
export function AdminWorkbench({
  sidebar,
  main,
  inspector,
  className,
  mainClassName,
  inspectorClassName,
}: {
  sidebar: ReactNode
  main: ReactNode
  inspector?: ReactNode
  className?: string
  mainClassName?: string
  inspectorClassName?: string
}) {
  return (
    <div className={cn('grid min-h-0 gap-5 xl:grid-cols-[280px_minmax(0,1fr)]', className)}>
      <aside className="min-h-0 overflow-hidden">
        {sidebar}
      </aside>
      <div className={cn('min-h-0 min-w-0 overflow-y-auto rounded-2xl', mainClassName)}>
        {main}
        {inspector && (
          <aside className={cn('min-h-0 min-w-0 overflow-y-auto', inspectorClassName)}>
            {inspector}
          </aside>
        )}
      </div>
    </div>
  )
}

/* ─── Resource Sidebar ─── */
export function AdminResourceSidebar({
  title,
  items,
  activeId,
  onSelect,
  loading = false,
  emptyText = "Không có mục nào",
  headerActions,
  summary,
  footer,
}: {
  kicker?: string
  title: string
  description?: string
  items: {
    id: string
    title: string
    subtitle?: string
    count?: number
    color?: string
    icon?: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>
    status?: 'success' | 'warning' | 'danger' | 'muted'
    meta?: ReactNode
  }[]
  activeId?: string | null
  onSelect: (id: string) => void
  loading?: boolean
  emptyText?: string
  headerActions?: ReactNode
  summary?: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#d7e0f0]/80 bg-white shadow-sm shadow-[#053384]/[0.03]">
      <div className="shrink-0 p-3 pb-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="truncate text-sm font-bold text-[#10213f]">{title}</h2>
          {headerActions && <div>{headerActions}</div>}
        </div>
        {summary && <div className="mt-2">{summary}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-[#d7e0f0]/70 p-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl px-3 py-3">
              <AdminSkeleton variant="line" className="mb-1 h-5 w-2/3" />
              <AdminSkeleton variant="line" className="h-3 w-1/2" />
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="p-4 text-center text-sm text-[#7a96c9]">{emptyText}</div>
        ) : (
          items.map((item) => {
            const isActive = activeId === item.id
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  'mb-1 flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-[#7a96c9]/30',
                  isActive
                    ? 'bg-[#053384] text-white shadow-sm shadow-[#053384]/20'
                    : 'text-[#52627f] hover:bg-[#f6f8fb] hover:text-[#10213f]'
                )}
              >
                {(Icon || item.color) && (
                  <span
                    className={cn(
                      'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
                      isActive ? 'bg-white/15 text-white' : 'border border-[#d7e0f0]/80 bg-white text-[#7a96c9]',
                    )}
                  >
                    {Icon ? (
                      <Icon className="h-4 w-4" />
                    ) : (
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    )}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm font-semibold', isActive ? 'text-white' : 'text-[#10213f]')}>
                    {item.title}
                  </p>
                  {item.subtitle && (
                    <p className={cn('truncate text-[0.72rem]', isActive ? 'text-white/70' : 'text-[#7a96c9]')}>
                      {item.subtitle}
                    </p>
                  )}
                  {item.meta && (
                    <div className={cn('mt-1 text-[0.7rem]', isActive ? 'text-white/70' : 'text-[#7a96c9]')}>
                      {item.meta}
                    </div>
                  )}
                </div>
                {item.count !== undefined && (
                  <span className={cn(
                    'ml-1 shrink-0 rounded-lg px-2 py-0.5 text-[0.7rem] font-semibold tabular-nums',
                    isActive ? 'bg-white/20 text-white' : 'border border-[#d7e0f0] bg-[#eef3fb] text-[#52627f]',
                  )}>
                    {item.count}
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>
      {footer && <div className="shrink-0 border-t border-[#d7e0f0]/70 p-3">{footer}</div>}
    </div>
  )
}

/* ─── Toolbar ─── */
export function AdminToolbar({
  search,
  filters,
  actions,
}: {
  search?: ReactNode
  filters?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-[#d7e0f0]/70 bg-white p-3 shadow-sm shadow-[#053384]/[0.02]">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        {search && <div className="w-full sm:max-w-xs">{search}</div>}
        {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  )
}

/* ─── Metric Strip ─── */
export function AdminMetricStrip({
  metrics,
  variant = 'cards',
}: {
  metrics: {
    label: string
    value: string | number
    color?: string
    description?: string
  }[]
  variant?: 'cards' | 'compact'
}) {
  if (variant === 'compact') {
    return (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-sm">
        {metrics.map((m, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            <span className="text-[0.8rem] font-medium text-[#52627f]">{m.label}:</span>
            <span className="text-[0.8rem] font-bold text-[#10213f]" style={m.color ? { color: m.color } : {}}>
              {m.value}
            </span>
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metrics.map((m, i) => (
        <div key={i} className="rounded-xl border border-[#d7e0f0]/70 bg-white p-3 shadow-sm shadow-[#053384]/[0.02]">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#7a96c9]">{m.label}</p>
          <p className="mt-1 text-lg font-bold text-[#10213f]" style={m.color ? { color: m.color } : {}}>
            {m.value}
          </p>
          {m.description && <p className="mt-0.5 text-[0.72rem] text-[#52627f]">{m.description}</p>}
        </div>
      ))}
    </div>
  )
}

/* ─── Preview Frame ─── */
export function AdminPreviewFrame({
  src,
  type,
  aspectRatio = 'video',
  alt = 'Preview',
  caption,
  emptyState,
  className,
}: {
  src?: string | null
  type?: 'image' | 'video' | '3d'
  aspectRatio?: 'video' | 'square' | 'auto'
  alt?: string
  caption?: ReactNode
  emptyState?: ReactNode
  className?: string
}) {
  const aspectClass = {
    video: 'aspect-video',
    square: 'aspect-square',
    auto: '',
  }[aspectRatio]

  return (
    <div className={cn("overflow-hidden rounded-xl border border-[#d7e0f0] bg-[#eef3fb]", className)}>
      <div className={cn("relative flex items-center justify-center w-full", aspectClass)}>
        {src ? (
          type === 'video' ? (
            <video src={src} controls className="h-full w-full object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={alt} className="h-full w-full object-contain" />
          )
        ) : (
          <div className="p-6 text-center text-[#7a96c9]">
            {emptyState || 'Không có bản xem trước'}
          </div>
        )}
      </div>
      {caption && (
        <div className="border-t border-[#d7e0f0] bg-white p-3 text-sm text-[#52627f]">
          {caption}
        </div>
      )}
    </div>
  )
}

/* ─── Status Pill ─── */
export function AdminStatusPill({
  status,
  label,
  className,
}: {
  status: 'success' | 'warning' | 'danger' | 'muted' | 'info'
  label: ReactNode
  className?: string
}) {
  const colorClass = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    danger: 'border-red-200 bg-red-50 text-red-700',
    muted: 'border-slate-200 bg-slate-50 text-slate-600',
    info: 'border-[#7a96c9]/30 bg-[#eef3fb] text-[#053384]',
  }[status]

  return (
    <span className={cn('inline-flex items-center rounded-lg border px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider', colorClass, className)}>
      {label}
    </span>
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
