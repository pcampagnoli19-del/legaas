'use client';

import {
  Check,
  Copy,
  MailPlus,
  ShieldAlert,
  UserCheck,
  UserMinus,
  Users,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  inviteMemberAction,
  revokeInvitationAction,
  setMemberStatusAction,
  updateMemberRoleAction,
} from '@/server/modules/members/actions';
import type { InternalRole, MemberDepartmentAssignment } from '@/server/modules/members/service';

export interface SerializedMember {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: InternalRole;
  status: 'invited' | 'active' | 'disabled';
  departments: MemberDepartmentAssignment[];
  createdAt: string;
}

export interface SerializedPendingInvitation {
  invitationId: string;
  email: string;
  role: InternalRole;
  expiresAt: string;
  createdAt: string;
}

interface MembersManagementClientProps {
  orgSlug: string;
  currentMembershipId: string;
  members: SerializedMember[];
  pendingInvitations: SerializedPendingInvitation[];
}

const ROLE_OPTIONS: Array<{ value: InternalRole; label: string; description: string }> = [
  {
    value: 'org_admin',
    label: 'Administrador (org_admin)',
    description: 'Acesso administrativo irrestrito à organização',
  },
  {
    value: 'manager',
    label: 'Gestor (manager)',
    description: 'Gestão operacional nos departamentos atribuídos',
  },
  {
    value: 'coordinator',
    label: 'Coordenador (coordinator)',
    description: 'Coordenação de demandas e prazos nos departamentos atribuídos',
  },
  {
    value: 'analyst',
    label: 'Analista (analyst)',
    description: 'Execução operacional nas demandas e departamentos atribuídos',
  },
  {
    value: 'viewer',
    label: 'Visualizador (viewer)',
    description: 'Leitura operacional sem permissão de edição',
  },
];

const ROLE_BADGE_LABELS: Record<InternalRole, string> = {
  org_admin: 'Administrador',
  manager: 'Gestor',
  coordinator: 'Coordenador',
  analyst: 'Analista',
  viewer: 'Visualizador',
};

const DEPT_ROLE_LABELS: Record<MemberDepartmentAssignment['departmentRole'], string> = {
  manager: 'Gestor',
  coordinator: 'Coordenador',
  member: 'Membro',
};

export function MembersManagementClient({
  orgSlug,
  currentMembershipId,
  members,
  pendingInvitations,
}: MembersManagementClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InternalRole>('analyst');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [generatedInvitePath, setGeneratedInvitePath] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  function handleInviteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedbackError(null);
    setFeedbackSuccess(null);
    setGeneratedInvitePath(null);

    startTransition(async () => {
      const result = await inviteMemberAction({
        orgSlug,
        email: inviteEmail,
        role: inviteRole,
      });

      if (!result.ok) {
        setFeedbackError(result.error.message);
        return;
      }

      setInviteEmail('');
      setGeneratedInvitePath(result.data.invitePath);
      setFeedbackSuccess(
        `Convite criado para ${result.data.email} com papel ${ROLE_BADGE_LABELS[result.data.role]}.`,
      );
      router.refresh();
    });
  }

  function handleRoleChange(membershipId: string, newRole: InternalRole) {
    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const result = await updateMemberRoleAction({
        orgSlug,
        membershipId,
        role: newRole,
      });

      if (!result.ok) {
        setFeedbackError(result.error.message);
        return;
      }

      setFeedbackSuccess('Papel organizacional atualizado com sucesso.');
      router.refresh();
    });
  }

  function handleToggleStatus(membershipId: string, nextStatus: 'active' | 'disabled') {
    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const result = await setMemberStatusAction({
        orgSlug,
        membershipId,
        status: nextStatus,
      });

      if (!result.ok) {
        setFeedbackError(result.error.message);
        return;
      }

      setFeedbackSuccess(
        nextStatus === 'disabled'
          ? 'Acesso do membro desativado e sessões ativas revogadas.'
          : 'Acesso do membro reativado com sucesso.',
      );
      router.refresh();
    });
  }

  function handleRevokeInvitation(invitationId: string) {
    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const result = await revokeInvitationAction({
        orgSlug,
        invitationId,
      });

      if (!result.ok) {
        setFeedbackError(result.error.message);
        return;
      }

      setFeedbackSuccess('Convite pendente revogado.');
      router.refresh();
    });
  }

  async function handleCopyInviteLink() {
    if (!generatedInvitePath) return;
    const fullUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${generatedInvitePath}`
        : generatedInvitePath;
    await navigator.clipboard.writeText(fullUrl);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2500);
  }

  return (
    <div className="space-y-6">
      {feedbackError ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
        >
          <ShieldAlert className="h-4 w-4 shrink-0 text-red-600" />
          <span>{feedbackError}</span>
        </div>
      ) : null}

      {feedbackSuccess ? (
        <div
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900"
        >
          <p>{feedbackSuccess}</p>
          {generatedInvitePath ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xs border border-emerald-300/80 bg-white px-2.5 py-1.5">
              <span className="font-mono text-[11px] text-slate-700">{generatedInvitePath}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyInviteLink}
                className="h-7 px-2 text-[11px]"
              >
                {copiedInvite ? (
                  <>
                    <Check className="mr-1 h-3 w-3 text-emerald-600" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3 w-3" />
                    Copiar link de convite
                  </>
                )}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailPlus className="h-4 w-4 text-slate-600" />
            Convidar Novo Membro
          </CardTitle>
          <CardDescription>
            Envie um convite de uso único com papel organizacional predefinido (Decisão A4 e A5).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInviteSubmit} className="grid gap-4 sm:grid-cols-12 sm:items-end">
            <div className="sm:col-span-5">
              <FormField label="E-mail corporativo" id="invite-email" required>
                <Input
                  id="invite-email"
                  name="email"
                  type="email"
                  placeholder="colaborador@empresa.com.br"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={isPending}
                />
              </FormField>
            </div>

            <div className="sm:col-span-4">
              <FormField label="Papel organizacional" id="invite-role" required>
                <select
                  id="invite-role"
                  name="role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as InternalRole)}
                  disabled={isPending}
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-xs shadow-2xs focus-visible:ring-1 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="sm:col-span-3">
              <Button type="submit" className="w-full" disabled={isPending}>
                <MailPlus className="mr-1.5 h-3.5 w-3.5" />
                Gerar Convite
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Membros da Organização</CardTitle>
              <CardDescription>
                Gerencie papéis organizacionais e o status de acesso ao Legaas Office.
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono">
              {members.length} {members.length === 1 ? 'membro' : 'membros'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhum membro encontrado"
              description="Utilize o formulário acima para convidar colaboradores para esta organização."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Papel Organizacional</TableHead>
                  <TableHead>Departamentos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const isSelf = member.membershipId === currentMembershipId;
                  return (
                    <TableRow key={member.membershipId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="text-xs font-medium text-slate-900">
                              {member.name}
                              {isSelf ? (
                                <span className="ml-1.5 text-[11px] font-normal text-slate-500">
                                  (Você)
                                </span>
                              ) : null}
                            </p>
                            <p className="font-mono text-[11px] text-slate-500">{member.email}</p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        {isSelf ? (
                          <Badge variant="default">{ROLE_BADGE_LABELS[member.role]}</Badge>
                        ) : (
                          <select
                            aria-label={`Papel de ${member.name}`}
                            value={member.role}
                            disabled={isPending}
                            onChange={(e) =>
                              handleRoleChange(member.membershipId, e.target.value as InternalRole)
                            }
                            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
                          >
                            {ROLE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {ROLE_BADGE_LABELS[opt.value]}
                              </option>
                            ))}
                          </select>
                        )}
                      </TableCell>

                      <TableCell>
                        {member.departments.length === 0 ? (
                          <span className="text-[11px] text-slate-400">Sem departamento</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {member.departments.map((dept) => (
                              <Badge key={dept.departmentId} variant="outline">
                                {dept.departmentName} · {DEPT_ROLE_LABELS[dept.departmentRole]}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>

                      <TableCell>
                        {member.status === 'active' ? (
                          <Badge variant="emerald">Ativo</Badge>
                        ) : (
                          <Badge variant="warning">Desativado</Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        {isSelf ? (
                          <span
                            className="text-[11px] text-slate-400"
                            title="Você não pode desativar seu próprio acesso administrativo"
                          >
                            Sessão atual
                          </span>
                        ) : member.status === 'active' ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleToggleStatus(member.membershipId, 'disabled')}
                            className="h-7 text-red-700 hover:bg-red-50 hover:text-red-800"
                          >
                            <UserMinus className="mr-1 h-3 w-3" />
                            Desativar
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleToggleStatus(member.membershipId, 'active')}
                            className="h-7"
                          >
                            <UserCheck className="mr-1 h-3 w-3" />
                            Reativar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Convites Pendentes</CardTitle>
              <CardDescription>
                Convites enviados que ainda aguardam aceite pelo destinatário.
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono">
              {pendingInvitations.length}{' '}
              {pendingInvitations.length === 1 ? 'pendente' : 'pendentes'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {pendingInvitations.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">
              Não há convites pendentes no momento.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail Convidado</TableHead>
                  <TableHead>Papel Atribuído</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvitations.map((inv) => (
                  <TableRow key={inv.invitationId}>
                    <TableCell className="font-mono text-xs">{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ROLE_BADGE_LABELS[inv.role]}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {new Date(inv.expiresAt).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleRevokeInvitation(inv.invitationId)}
                        className="h-7 text-red-700 hover:bg-red-50 hover:text-red-800"
                      >
                        <XCircle className="mr-1 h-3 w-3" />
                        Revogar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
