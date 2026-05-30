import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

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
    <div className="flex flex-col gap-4 border-b border-border/80 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <div className="mb-2 h-1 w-12 rounded-full bg-accent" />
        <h1 className="text-2xl font-semibold leading-tight tracking-normal text-foreground md:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

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
    <section className={cn('rounded-lg border border-border/80 bg-card shadow-sm', className)}>
      {(title || description || action) && (
        <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            {title && <h2 className="text-base font-semibold leading-tight">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function AdminNotice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'danger'
  children: ReactNode
}) {
  const toneClass = {
    info: 'border-primary/20 bg-primary/5 text-primary',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    danger: 'border-destructive/20 bg-destructive/10 text-destructive',
  }[tone]

  return (
    <div className={cn('rounded-lg border px-3 py-2 text-sm', toneClass)}>
      {children}
    </div>
  )
}

export function AdminSelect({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  )
}

export function AdminTextarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  )
}

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
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-background shadow-2xl">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <div className="px-5 py-5">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border bg-muted/40 px-5 py-4">
          {footer}
        </div>
      </div>
    </div>
  )
}

export function categoryStyle(color?: string | null) {
  return color
    ? {
        borderColor: `${color}55`,
        backgroundColor: `${color}14`,
        color,
      }
    : undefined
}
