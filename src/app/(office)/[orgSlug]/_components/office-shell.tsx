'use client';

import {
  Briefcase,
  Building2,
  FolderKanban,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { LegaasLogo } from '@/components/shared/legaas-logo';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { logoutAction } from '@/server/auth/actions';
import type { MembershipRole } from '@/server/context/tenant-context';

const ROLE_LABELS: Record<MembershipRole, string> = {
  org_admin: 'Admin',
  manager: 'Gestor',
  coordinator: 'Coordenador',
  analyst: 'Analista',
  viewer: 'Visualizador',
  external: 'Externo',
};

export interface OfficeShellUser {
  name: string;
  email: string;
  role: Exclude<MembershipRole, 'external'>;
}

export interface OfficeShellProps {
  orgSlug: string;
  orgDisplayName: string;
  isDevPreview: boolean;
  user?: OfficeShellUser | null;
  availableOrgs?: Array<{ orgSlug: string; orgName: string }>;
  children: ReactNode;
}

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}

export function OfficeShell({
  orgSlug,
  orgDisplayName,
  isDevPreview,
  user,
  availableOrgs = [],
  children,
}: OfficeShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isOrgAdmin = !user || user.role === 'org_admin';

  const navItems: NavItem[] = [
    {
      label: 'Visão Geral',
      href: `/${orgSlug}`,
      icon: LayoutDashboard,
    },
    {
      label: 'Demandas',
      href: `/${orgSlug}/demandas`,
      icon: FolderKanban,
    },
    {
      label: 'Clientes',
      href: `/${orgSlug}/clientes`,
      icon: Briefcase,
    },
    {
      label: 'Empresas',
      href: `/${orgSlug}/empresas`,
      icon: Landmark,
    },
    ...(isOrgAdmin
      ? [
          {
            label: 'Departamentos',
            href: `/${orgSlug}/departamentos`,
            icon: Network,
          },
          {
            label: 'Usuários e Permissões',
            href: `/${orgSlug}/usuarios`,
            icon: Users,
          },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        aria-label="Navegação principal do Legaas Office"
        className={cn(
          'bg-brand-navy fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-800 text-slate-100 transition-all duration-150 lg:static lg:translate-x-0',
          collapsed ? 'w-16' : 'w-60',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
          <Link
            href={`/${orgSlug}`}
            className="focus-visible:ring-brand-emerald rounded-xs focus-visible:ring-2 focus-visible:outline-hidden"
          >
            <LegaasLogo variant="dark-bg" collapsed={collapsed} />
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1 text-slate-300 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Fechar menu de navegação"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contexto da Organização Ativa (Decisão A3) */}
        <div className="border-b border-white/10 px-3 py-3">
          <div
            className={cn(
              'flex items-center gap-2.5 rounded-md bg-white/5 px-2.5 py-2',
              collapsed && 'justify-center px-0',
            )}
            title={`Organização ativa: ${orgDisplayName} (${orgSlug})`}
          >
            <Building2 className="text-brand-emerald h-4 w-4 shrink-0" aria-hidden="true" />
            {!collapsed ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white">{orgDisplayName}</p>
                <p className="truncate font-mono text-[10px] text-slate-400">/{orgSlug}</p>
              </div>
            ) : null}
          </div>

          {!collapsed && availableOrgs.length > 1 ? (
            <div className="mt-2 space-y-1">
              <p className="px-1 text-[10px] tracking-wider text-slate-400 uppercase">
                Alternar organização
              </p>
              {availableOrgs
                .filter((o) => o.orgSlug !== orgSlug)
                .map((otherOrg) => (
                  <Link
                    key={otherOrg.orgSlug}
                    href={`/${otherOrg.orgSlug}`}
                    className="block truncate rounded-xs px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white"
                  >
                    {otherOrg.orgName}
                  </Link>
                ))}
            </div>
          ) : null}
        </div>

        <nav className="flex-1 space-y-1 px-2.5 py-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === `/${orgSlug}`
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-white/12 text-white'
                    : 'text-slate-300 hover:bg-white/6 hover:text-white',
                  collapsed && 'justify-center px-0',
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    isActive ? 'text-brand-emerald' : 'text-slate-400',
                  )}
                  aria-hidden="true"
                />
                {!collapsed ? <span>{item.label}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-white/10 p-2.5">
          {user ? (
            <form action={logoutAction}>
              <button
                type="submit"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-red-500/15 hover:text-red-200',
                  collapsed && 'justify-center px-0',
                )}
                title="Encerrar sessão"
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                {!collapsed ? <span>Sair da conta</span> : null}
              </button>
            </form>
          ) : null}

          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            className={cn(
              'hidden w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/8 hover:text-white lg:flex',
              collapsed && 'justify-center px-0',
            )}
            aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4 shrink-0" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4 shrink-0" />
                <span>Recolher navegação</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 lg:hidden"
              aria-label="Abrir menu de navegação"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-900">Legaas Office</span>
              <span className="text-slate-300">/</span>
              <span className="font-mono text-slate-600">{orgSlug}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-2">
                <Badge variant="default" className="hidden sm:inline-flex">
                  <UserCheck className="mr-1 h-3 w-3" aria-hidden="true" />
                  {user.name} · {ROLE_LABELS[user.role]}
                </Badge>
              </div>
            ) : null}

            <Badge variant="emerald" className="hidden sm:inline-flex">
              <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" />
              RLS Ativo
            </Badge>

            {isDevPreview ? (
              <Badge
                variant="warning"
                title="CLAUDE.md §3.3 — Ambiente explícito de demonstração de desenvolvimento"
              >
                Preview Dev
              </Badge>
            ) : null}
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
