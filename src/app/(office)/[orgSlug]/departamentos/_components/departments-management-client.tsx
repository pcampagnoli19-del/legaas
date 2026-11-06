'use client';

import { Check, Network, Pencil, Plus, ShieldAlert, Trash2, UserPlus, X } from 'lucide-react';
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
  assignDepartmentMemberAction,
  createDepartmentAction,
  removeDepartmentMemberAction,
  updateDepartmentAction,
} from '@/server/modules/departments/actions';
import type {
  DepartmentMemberRole,
  DepartmentParticipantDTO,
} from '@/server/modules/departments/service';
import type { InternalRole } from '@/server/modules/members/service';

export interface SerializedDepartment {
  id: string;
  name: string;
  description: string | null;
  participants: DepartmentParticipantDTO[];
  createdAt: string;
}

export interface AssignableMemberOption {
  membershipId: string;
  name: string;
  email: string;
  role: InternalRole;
}

interface DepartmentsManagementClientProps {
  orgSlug: string;
  departments: SerializedDepartment[];
  activeMembers: AssignableMemberOption[];
}

const DEPT_ROLE_OPTIONS: Array<{ value: DepartmentMemberRole; label: string }> = [
  { value: 'member', label: 'Membro da Equipe (member)' },
  { value: 'coordinator', label: 'Coordenador do Departamento (coordinator)' },
  { value: 'manager', label: 'Gestor do Departamento (manager)' },
];

const DEPT_ROLE_BADGE: Record<DepartmentMemberRole, string> = {
  manager: 'Gestor',
  coordinator: 'Coordenador',
  member: 'Membro',
};

export function DepartmentsManagementClient({
  orgSlug,
  departments,
  activeMembers,
}: DepartmentsManagementClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const [selectedMemberByDept, setSelectedMemberByDept] = useState<Record<string, string>>({});
  const [selectedRoleByDept, setSelectedRoleByDept] = useState<
    Record<string, DepartmentMemberRole>
  >({});

  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  function handleCreateDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const result = await createDepartmentAction({
        orgSlug,
        name: newName,
        description: newDescription.trim() || undefined,
      });

      if (!result.ok) {
        setFeedbackError(result.error.message);
        return;
      }

      setNewName('');
      setNewDescription('');
      setFeedbackSuccess(`Departamento "${result.data.name}" criado com sucesso.`);
      router.refresh();
    });
  }

  function startEditingDepartment(dept: SerializedDepartment) {
    setEditingDeptId(dept.id);
    setEditName(dept.name);
    setEditDescription(dept.description ?? '');
    setFeedbackError(null);
    setFeedbackSuccess(null);
  }

  function handleSaveDepartmentEdit(departmentId: string) {
    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const result = await updateDepartmentAction({
        orgSlug,
        departmentId,
        name: editName,
        description: editDescription.trim() || undefined,
      });

      if (!result.ok) {
        setFeedbackError(result.error.message);
        return;
      }

      setEditingDeptId(null);
      setFeedbackSuccess(`Departamento "${result.data.name}" atualizado.`);
      router.refresh();
    });
  }

  function handleAssignMember(departmentId: string) {
    const membershipId = selectedMemberByDept[departmentId] ?? activeMembers[0]?.membershipId;
    const role = selectedRoleByDept[departmentId] ?? 'member';

    if (!membershipId) {
      setFeedbackError('Selecione um membro ativo para vincular ao departamento.');
      return;
    }

    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const result = await assignDepartmentMemberAction({
        orgSlug,
        departmentId,
        membershipId,
        departmentRole: role,
      });

      if (!result.ok) {
        setFeedbackError(result.error.message);
        return;
      }

      setFeedbackSuccess('Vínculo de membro no departamento atualizado com sucesso.');
      router.refresh();
    });
  }

  function handleChangeParticipantRole(
    departmentId: string,
    membershipId: string,
    newRole: DepartmentMemberRole,
  ) {
    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const result = await assignDepartmentMemberAction({
        orgSlug,
        departmentId,
        membershipId,
        departmentRole: newRole,
      });

      if (!result.ok) {
        setFeedbackError(result.error.message);
        return;
      }

      setFeedbackSuccess('Função do participante no departamento atualizada.');
      router.refresh();
    });
  }

  function handleRemoveParticipant(departmentId: string, membershipId: string) {
    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const result = await removeDepartmentMemberAction({
        orgSlug,
        departmentId,
        membershipId,
      });

      if (!result.ok) {
        setFeedbackError(result.error.message);
        return;
      }

      setFeedbackSuccess('Participante removido do departamento.');
      router.refresh();
    });
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
          {feedbackSuccess}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-slate-600" />
            Criar Novo Departamento
          </CardTitle>
          <CardDescription>
            Estruture áreas operacionais (ex.: Societário, Paralegal, Licenças, Contencioso) para
            delimitar escopo de demandas e permissões (Decisão A5).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleCreateDepartment}
            className="grid gap-4 sm:grid-cols-12 sm:items-end"
          >
            <div className="sm:col-span-4">
              <FormField label="Nome do departamento" id="dept-name" required>
                <Input
                  id="dept-name"
                  name="name"
                  placeholder="Ex.: Societário e Paralegal"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={isPending}
                />
              </FormField>
            </div>

            <div className="sm:col-span-5">
              <FormField label="Descrição operacional" id="dept-description">
                <Input
                  id="dept-description"
                  name="description"
                  placeholder="Ex.: Constituição, alterações contratuais e alvarás"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  disabled={isPending}
                />
              </FormField>
            </div>

            <div className="sm:col-span-3">
              <Button type="submit" className="w-full" disabled={isPending}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Criar Departamento
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {departments.length === 0 ? (
        <EmptyState
          icon={Network}
          title="Nenhum departamento cadastrado nesta organização"
          description="Crie o primeiro departamento acima para organizar equipes, coordenadores e gestores."
        />
      ) : (
        <div className="space-y-4">
          {departments.map((dept) => {
            const isEditing = editingDeptId === dept.id;
            const selectedMemberId =
              selectedMemberByDept[dept.id] ?? activeMembers[0]?.membershipId ?? '';
            const selectedRole = selectedRoleByDept[dept.id] ?? 'member';

            return (
              <Card key={dept.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    {isEditing ? (
                      <div className="grid flex-1 gap-3 sm:grid-cols-12 sm:items-center">
                        <div className="sm:col-span-4">
                          <Input
                            aria-label="Editar nome do departamento"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            disabled={isPending}
                          />
                        </div>
                        <div className="sm:col-span-5">
                          <Input
                            aria-label="Editar descrição do departamento"
                            placeholder="Descrição (opcional)"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            disabled={isPending}
                          />
                        </div>
                        <div className="flex items-center gap-2 sm:col-span-3">
                          <Button
                            type="button"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleSaveDepartmentEdit(dept.id)}
                          >
                            <Check className="mr-1 h-3.5 w-3.5" />
                            Salvar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() => setEditingDeptId(null)}
                          >
                            <X className="mr-1 h-3.5 w-3.5" />
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <span>{dept.name}</span>
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {dept.participants.length}{' '}
                              {dept.participants.length === 1 ? 'integrante' : 'integrantes'}
                            </Badge>
                          </CardTitle>
                          <CardDescription>
                            {dept.description ?? 'Sem descrição operacional informada.'}
                          </CardDescription>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() => startEditingDepartment(dept)}
                          className="h-7 text-xs"
                        >
                          <Pencil className="mr-1 h-3 w-3" />
                          Editar
                        </Button>
                      </>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {dept.participants.length === 0 ? (
                    <p className="rounded-md border border-dashed border-slate-200 py-4 text-center text-xs text-slate-500">
                      Nenhum membro vinculado a este departamento.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Integrante</TableHead>
                          <TableHead>Função no Departamento</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dept.participants.map((participant) => (
                          <TableRow key={participant.membershipId}>
                            <TableCell>
                              <p className="text-xs font-medium text-slate-900">
                                {participant.name}
                              </p>
                              <p className="font-mono text-[11px] text-slate-500">
                                {participant.email}
                              </p>
                            </TableCell>
                            <TableCell>
                              <select
                                aria-label={`Função de ${participant.name} em ${dept.name}`}
                                value={participant.departmentRole}
                                disabled={isPending}
                                onChange={(e) =>
                                  handleChangeParticipantRole(
                                    dept.id,
                                    participant.membershipId,
                                    e.target.value as DepartmentMemberRole,
                                  )
                                }
                                className="border-input bg-background h-8 rounded-md border px-2 text-xs"
                              >
                                {DEPT_ROLE_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {DEPT_ROLE_BADGE[opt.value]}
                                  </option>
                                ))}
                              </select>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isPending}
                                onClick={() =>
                                  handleRemoveParticipant(dept.id, participant.membershipId)
                                }
                                className="h-7 text-red-700 hover:bg-red-50 hover:text-red-800"
                              >
                                <Trash2 className="mr-1 h-3 w-3" />
                                Remover
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  {activeMembers.length > 0 ? (
                    <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
                      <p className="mb-2.5 text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
                        Vincular ou atualizar integrante neste departamento
                      </p>
                      <div className="grid gap-3 sm:grid-cols-12 sm:items-end">
                        <div className="sm:col-span-5">
                          <label
                            htmlFor={`select-member-${dept.id}`}
                            className="mb-1 block text-[11px] font-medium text-slate-700"
                          >
                            Membro ativo da organização
                          </label>
                          <select
                            id={`select-member-${dept.id}`}
                            value={selectedMemberId}
                            disabled={isPending}
                            onChange={(e) =>
                              setSelectedMemberByDept((prev) => ({
                                ...prev,
                                [dept.id]: e.target.value,
                              }))
                            }
                            className="border-input bg-background flex h-8 w-full rounded-md border px-2.5 text-xs"
                          >
                            {activeMembers.map((m) => (
                              <option key={m.membershipId} value={m.membershipId}>
                                {m.name} ({m.email})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-4">
                          <label
                            htmlFor={`select-role-${dept.id}`}
                            className="mb-1 block text-[11px] font-medium text-slate-700"
                          >
                            Papel no departamento
                          </label>
                          <select
                            id={`select-role-${dept.id}`}
                            value={selectedRole}
                            disabled={isPending}
                            onChange={(e) =>
                              setSelectedRoleByDept((prev) => ({
                                ...prev,
                                [dept.id]: e.target.value as DepartmentMemberRole,
                              }))
                            }
                            className="border-input bg-background flex h-8 w-full rounded-md border px-2.5 text-xs"
                          >
                            {DEPT_ROLE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-3">
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 w-full"
                            disabled={isPending}
                            onClick={() => handleAssignMember(dept.id)}
                          >
                            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                            Vincular Membro
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
