import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { BrandBackdrop } from '@/shared/ui';

/**
 * Общий слой страниц входа, регистрации и настройки: фон живёт на уровне роута и не пересоздаётся
 * при переходе между ними, поэтому его анимация не перезапускается.
 */
export function AuthLayout() {
  return (
    <div className="relative isolate min-h-dvh overflow-hidden max-md:fixed max-md:inset-0 max-md:overflow-y-auto" data-block="auth-layout">
      <BrandBackdrop className="ds-fill-screen max-md:fixed" />
      <Outlet />
    </div>
  );
}

/** Оболочка страниц входа, регистрации и первичной настройки: карточка по центру (фон — в `AuthLayout`). */
export function AuthShell({
  title,
  subtitle,
  above,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  /** Блок над карточкой (обычно `Dialogue`). */
  above?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6 max-md:min-h-full max-md:px-3 max-md:pb-[max(1rem,env(safe-area-inset-bottom))] max-md:pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-md">
        {above ? <div className="mb-4">{above}</div> : null}
        <section className="border border-brand/60 bg-bg p-8 shadow-pop max-md:p-5">
          <h1 className="font-heading text-2xl leading-snug tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-2 text-[13px] leading-relaxed text-muted">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-6 border-t border-line pt-5 text-center text-xs text-muted">{footer}</div> : null}
        </section>
      </div>
    </main>
  );
}
