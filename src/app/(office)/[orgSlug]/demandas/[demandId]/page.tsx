import { ArrowLeft, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentSessionFromCookies } from '@/server/auth/session';
import { can } from '@/server/authz/permissions';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import { ForbiddenError, NotFoundError } from '@/server/errors/app-error';
import { listOrganizationClients } from '@/server/modules/clients/service';
import { listOrganizationCompanies } from '@/server/modules/companies/service';
import { getDemandDetails } from '@/server/modules/demands/service';
import { listOrganizationDepartments } from '@/server/modules/departments/service';
import { listOrganizationMembers } from '@/server/modules/members/service';
import { DemandDetailClient } from './_components/demand-detail-client';

interface DemandDetailPageProps {
  params: Promise<{ orgSlug: string; demandId: string }>;
}

/**
 * Tela de Detalhes da Demanda (`/[orgSlug]/demandas/[demandId]` — Fase 1.6):
 * - Exibe linha do tempo de etapas (`demand_stage_history`), trilha imutável de auditoria (`activity_log`),
 *   status atual derivado, responsáveis, participantes, comentários e dados vinculados (Cliente, Empresa, Serviço).
 * - Aplica estritamente o escopo RBAC por departamento (Decisão A5).
 */
export default async function OfficeDemandDetailPage({ params }: DemandDetailPageProps) {
  const { orgSlug, demandId } = await params;

  const session = await getCurrentSessionFromCookies();
  if (!session) {
    redirect(
      `/login?next=/${encodeURIComponent(orgSlug)}/demandas/${encodeURIComponent(demandId)}`,
    );
  }

  let tenantCtx;
  try {
    tenantCtx = await resolveOfficeTenantContext({
      userId: session.userId,
      orgSlug,
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      notFound();
    }
    throw err;
  }

  let demand;
  try {
    demand = await getDemandDetails(tenantCtx, demandId);
  } catch (err) {
    if (err instanceof NotFoundError) {
      notFound();
    }
    if (err instanceof ForbiddenError) {
      return (
        <div className="space-y-4">
          <Link
            href={`/${orgSlug}/demandas`}
            className="hover:text-brand-navy inline-flex items-center gap-1.5 text-xs font-medium text-slate-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para Demandas
          </Link>
          <Card className="border-amber-200 bg-amber-50/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-950">
                <ShieldAlert className="h-4 w-4 text-amber-700" />
                Acesso Restrito ao Departamento Responsável (403)
              </CardTitle>
              <CardDescription className="text-amber-900">
                Esta demanda pertence a um departamento fora do seu escopo operacional atual e você
                não figura como responsável ou participante vinculado.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-amber-900">
              Caso necessite atuar nesta ordem de serviço, solicite ao Coordenador do departamento
              ou Gestor da organização sua inclusão como participante ou a atribuição ao seu
              departamento.
            </CardContent>
          </Card>
        </div>
      );
    }
    throw err;
  }

  const [clientsList, companiesList, departmentsList, membersList] = await Promise.all([
    listOrganizationClients(tenantCtx, { status: 'active' }),
    listOrganizationCompanies(tenantCtx, { status: 'active' }),
    listOrganizationDepartments(tenantCtx),
    listOrganizationMembers(tenantCtx),
  ]);

  const resourceScope = {
    departmentId: demand.departmentId,
    assigneeMembershipId: demand.assigneeMembershipId,
    participantMembershipIds: demand.participants.map((p) => p.membershipId),
  };

  const canUpdate = can(tenantCtx, 'demand.update', resourceScope);
  const canAssign = can(tenantCtx, 'demand.assign', resourceScope);

  return (
    <DemandDetailClient
      orgSlug={tenantCtx.orgSlug}
      canUpdate={canUpdate}
      canAssign={canAssign}
      demand={{
        ...demand,
        openedAt: demand.openedAt.toISOString(),
        completedAt: demand.completedAt ? demand.completedAt.toISOString() : null,
        updatedAt: demand.updatedAt.toISOString(),
        participants: demand.participants.map((p) => ({
          ...p,
          createdAt: p.createdAt.toISOString(),
        })),
        stageHistory: demand.stageHistory.map((sh) => ({
          ...sh,
          movedAt: sh.movedAt.toISOString(),
        })),
        comments: demand.comments.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
        })),
        activityTimeline: demand.activityTimeline.map((log) => ({
          ...log,
          createdAt: log.createdAt.toISOString(),
        })),
      }}
      clients={clientsList.map((c) => ({ id: c.id, name: c.name }))}
      companies={companiesList.map((comp) => ({
        id: comp.id,
        clientId: comp.clientId,
        legalName: comp.legalName,
        cnpj: comp.cnpj,
      }))}
      departments={departmentsList.map((dept) => ({
        id: dept.id,
        name: dept.name,
      }))}
      members={membersList.members
        .filter((m) => m.status === 'active')
        .map((m) => ({
          membershipId: m.membershipId,
          name: m.name,
          email: m.email,
          role: m.role,
        }))}
    />
  );
}
