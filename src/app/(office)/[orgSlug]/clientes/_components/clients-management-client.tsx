'use client';

import {
  Briefcase,
  Check,
  Landmark,
  Pencil,
  Plus,
  Power,
  Search,
  ShieldAlert,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import Link from 'next/link';
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
  createClientAction,
  createClientContactAction,
  removeClientContactAction,
  setClientStatusAction,
  updateClientAction,
} from '@/server/modules/clients/actions';
import type { ClientType, EntityStatus } from '@/server/modules/clients/service';

export interface SerializedClientContact {
  id: string;
  clientId: string;
  name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  isPrimary: boolean;
  createdAt: string;
}

export interface SerializedClient {
  id: string;
  type: ClientType;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  status: EntityStatus;
  notes: string | null;
  ownerMembershipId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  contacts: SerializedClientContact[];
  companyCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerMemberOption {
  membershipId: string;
  name: string;
  email: string;
}

interface ClientsManagementClientProps {
  orgSlug: string;
  canWrite: boolean;
  clients: SerializedClient[];
  ownerOptions: OwnerMemberOption[];
  initialSearch: string;
  initialStatus: string;
  initialType: string;
}

function formatTaxIdDisplay(taxId: string | null, type: ClientType): string {
  if (!taxId) return '—';
  const digits = taxId.replace(/\D/g, '');
  if (type === 'individual' && digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }
  if (type === 'organization' && digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }
  return taxId;
}

export function ClientsManagementClient({
  orgSlug,
  canWrite,
  clients,
  ownerOptions,
  initialSearch,
  initialStatus,
  initialType,
}: ClientsManagementClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Filtros
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [typeFilter, setTypeFilter] = useState(initialType);

  // Novo cliente
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newType, setNewType] = useState<ClientType>('organization');
  const [newName, setNewName] = useState('');
  const [newTaxId, setNewTaxId] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newOwnerMembershipId, setNewOwnerMembershipId] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactPosition, setNewContactPosition] = useState('');

  // Edição de cliente
  const [editingClient, setEditingClient] = useState<SerializedClient | null>(null);
  const [editType, setEditType] = useState<ClientType>('organization');
  const [editName, setEditName] = useState('');
  const [editTaxId, setEditTaxId] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editOwnerMembershipId, setEditOwnerMembershipId] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Gestão de contatos de um cliente
  const [activeContactsClientId, setActiveContactsClientId] = useState<string | null>(null);
  const [contactFormName, setContactFormName] = useState('');
  const [contactFormEmail, setContactFormEmail] = useState('');
  const [contactFormPhone, setContactFormPhone] = useState('');
  const [contactFormPosition, setContactFormPosition] = useState('');
  const [contactFormPrimary, setContactFormPrimary] = useState(false);

  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (statusFilter) params.set('status', statusFilter);
    if (typeFilter) params.set('type', typeFilter);
    const qs = params.toString();
    router.push(`/${orgSlug}/clientes${qs ? `?${qs}` : ''}`);
  }

  function handleClearFilters() {
    setSearch('');
    setStatusFilter('');
    setTypeFilter('');
    router.push(`/${orgSlug}/clientes`);
  }

  function handleCreateClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const result = await createClientAction({
        orgSlug,
        type: newType,
        name: newName,
        taxId: newTaxId.trim() || undefined,
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
        ownerMembershipId: newOwnerMembershipId || undefined,
        notes: newNotes.trim() || undefined,
        contactName: newContactName.trim() || undefined,
        contactEmail: newContactEmail.trim() || undefined,
        contactPhone: newContactPhone.trim() || undefined,
        contactPosition: newContactPosition.trim() || undefined,
      });

      if (!result.ok) {
        setFeedbackError(result.error.message);
        return;
      }

      setNewName('');
      setNewTaxId('');
      setNewEmail('');
      setNewPhone('');
      setNewOwnerMembershipId('');
      setNewNotes('');
      setNewContactName('');
      setNewContactEmail('');
      setNewContactPhone('');
      setNewContactPosition('');
      setShowCreateForm(false);
      setFeedbackSuccess(`Cliente "${result.data.name}" cadastrado com sucesso.`);
      router.refresh();
    });
  }

  function startEditClient(client: SerializedClient) {
    setEditingClient(client);
    setEditType(client.type);
    setEditName(client.name);
    setEditTaxId(client.taxId ?? '');
    setEditEmail(client.email ?? '');
    setEditPhone(client.phone ?? '');
    setEditOwnerMembershipId(client.ownerMembershipId ?? '');
    setEditNotes(client.notes ?? '');
    setFeedbackError(null);
    setFeedbackSuccess(null);
  }

  function handleSaveEditClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingClient) return;
    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const result = await updateClientAction({
        orgSlug,
        clientId: editingClient.id,
        type: editType,
        name: editName,
        taxId: editTaxId.trim() || undefined,
        email: editEmail.trim() || undefined,
        phone: editPhone.trim() || undefined,
        ownerMembershipId: editOwnerMembershipId || undefined,
        notes: editNotes.trim() || undefined,
      });

      if (!result.ok) {
        setFeedbackError(result.error.message);
        return;
      }

      setEditingClient(null);
      setFeedbackSuccess(`Cliente "${result.data.name}" atualizado com sucesso.`);
      router.refresh();
    });
  }

  function handleToggleStatus(client: SerializedClient) {
    const nextStatus: EntityStatus = client.status === 'active' ? 'inactive' : 'active';
    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const result = await setClientStatusAction({
        orgSlug,
        clientId: client.id,
        status: nextStatus,
      });

      if (!result.ok) {
        setFeedbackError(result.error.message);
        return;
      }

      setFeedbackSuccess(
        nextStatus === 'active'
          ? `Cliente "${client.name}" reativado.`
          : `Cliente "${client.name}" inativado.`,
      );
      router.refresh();
    });
  }

  function handleAddContact(event: FormEvent<HTMLFormElement>, clientId: string) {
    event.preventDefault();
    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const result = await createClientContactAction({
        orgSlug,
        clientId,
        name: contactFormName,
        email: contactFormEmail.trim() || undefined,
        phone: contactFormPhone.trim() || undefined,
        position: contactFormPosition.trim() || undefined,
        isPrimary: contactFormPrimary,
      });

      if (!result.ok) {
        setFeedbackError(result.error.message);
        return;
      }

      setContactFormName('');
      setContactFormEmail('');
      setContactFormPhone('');
      setContactFormPosition('');
      setContactFormPrimary(false);
      setFeedbackSuccess('Contato adicionado ao cliente.');
      router.refresh();
    });
  }

  function handleRemoveContact(contactId: string) {
    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const result = await removeClientContactAction({
        orgSlug,
        contactId,
      });

      if (!result.ok) {
        setFeedbackError(result.error.message);
        return;
      }

      setFeedbackSuccess('Contato removido.');
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

      {/* Barra de Pesquisa, Filtros e Ação de Cadastro */}
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleFilterSubmit} className="grid gap-3 sm:grid-cols-12 sm:items-end">
            <div className="sm:col-span-4">
              <FormField id="filter-client-search" label="Pesquisar cliente">
                <Input
                  id="filter-client-search"
                  placeholder="Nome, CPF/CNPJ ou e-mail..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </FormField>
            </div>

            <div className="sm:col-span-2">
              <FormField id="filter-client-type" label="Tipo">
                <select
                  id="filter-client-type"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="border-input bg-background flex h-9 w-full rounded-md border px-2.5 text-xs"
                >
                  <option value="">Todos</option>
                  <option value="organization">Pessoa Jurídica (PJ)</option>
                  <option value="individual">Pessoa Física (PF)</option>
                </select>
              </FormField>
            </div>

            <div className="sm:col-span-2">
              <FormField id="filter-client-status" label="Status">
                <select
                  id="filter-client-status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="border-input bg-background flex h-9 w-full rounded-md border px-2.5 text-xs"
                >
                  <option value="">Todos</option>
                  <option value="active">Ativos</option>
                  <option value="inactive">Inativos</option>
                </select>
              </FormField>
            </div>

            <div className="flex items-center gap-2 sm:col-span-4">
              <Button type="submit" variant="outline" className="flex-1">
                <Search className="mr-1.5 h-3.5 w-3.5" />
                Filtrar
              </Button>
              {search || statusFilter || typeFilter ? (
                <Button type="button" variant="outline" onClick={handleClearFilters}>
                  Limpar
                </Button>
              ) : null}
              {canWrite ? (
                <Button
                  type="button"
                  onClick={() => setShowCreateForm((prev) => !prev)}
                  className="shrink-0"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Novo Cliente
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Formulário de Cadastro de Novo Cliente */}
      {canWrite && showCreateForm ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Cadastrar Novo Cliente</CardTitle>
                <CardDescription>
                  Registre clientes (PF ou PJ / Grupos Empresariais), defina o responsável interno e
                  adicione o contato principal de relacionamento.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCreateForm(false)}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Fechar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateClient} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-12">
                <div className="sm:col-span-3">
                  <FormField id="client-type" label="Natureza" required>
                    <select
                      id="client-type"
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as ClientType)}
                      disabled={isPending}
                      className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-xs"
                    >
                      <option value="organization">Pessoa Jurídica / Grupo (PJ)</option>
                      <option value="individual">Pessoa Física (PF)</option>
                    </select>
                  </FormField>
                </div>

                <div className="sm:col-span-5">
                  <FormField id="client-name" label="Nome / Razão Social do Cliente" required>
                    <Input
                      id="client-name"
                      required
                      placeholder="Ex.: Grupo Horizonte Participações"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      disabled={isPending}
                    />
                  </FormField>
                </div>

                <div className="sm:col-span-4">
                  <FormField
                    id="client-tax-id"
                    label={
                      newType === 'individual' ? 'CPF (11 dígitos)' : 'CNPJ Matriz (14 dígitos)'
                    }
                  >
                    <Input
                      id="client-tax-id"
                      placeholder={
                        newType === 'individual' ? '000.000.000-00' : '00.000.000/0000-00'
                      }
                      value={newTaxId}
                      onChange={(e) => setNewTaxId(e.target.value)}
                      disabled={isPending}
                    />
                  </FormField>
                </div>

                <div className="sm:col-span-4">
                  <FormField id="client-email" label="E-mail principal">
                    <Input
                      id="client-email"
                      type="email"
                      placeholder="juridico@cliente.com.br"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      disabled={isPending}
                    />
                  </FormField>
                </div>

                <div className="sm:col-span-3">
                  <FormField id="client-phone" label="Telefone">
                    <Input
                      id="client-phone"
                      placeholder="(11) 99999-0000"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      disabled={isPending}
                    />
                  </FormField>
                </div>

                <div className="sm:col-span-5">
                  <FormField id="client-owner" label="Responsável interno (Account Owner)">
                    <select
                      id="client-owner"
                      value={newOwnerMembershipId}
                      onChange={(e) => setNewOwnerMembershipId(e.target.value)}
                      disabled={isPending}
                      className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-xs"
                    >
                      <option value="">Sem responsável específico</option>
                      {ownerOptions.map((m) => (
                        <option key={m.membershipId} value={m.membershipId}>
                          {m.name} ({m.email})
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>

                <div className="sm:col-span-12">
                  <FormField id="client-notes" label="Observações operacionais">
                    <Input
                      id="client-notes"
                      placeholder="Contexto contratual, SLA acordado ou particularidades do cliente"
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      disabled={isPending}
                    />
                  </FormField>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3.5">
                <p className="mb-3 text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
                  Contato Principal do Cliente (Opcional)
                </p>
                <div className="grid gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-3">
                    <FormField id="contact-name" label="Nome do contato">
                      <Input
                        id="contact-name"
                        placeholder="Ex.: Fernanda Lima"
                        value={newContactName}
                        onChange={(e) => setNewContactName(e.target.value)}
                        disabled={isPending}
                      />
                    </FormField>
                  </div>
                  <div className="sm:col-span-3">
                    <FormField id="contact-position" label="Cargo / Função">
                      <Input
                        id="contact-position"
                        placeholder="Ex.: Diretora Jurídica"
                        value={newContactPosition}
                        onChange={(e) => setNewContactPosition(e.target.value)}
                        disabled={isPending}
                      />
                    </FormField>
                  </div>
                  <div className="sm:col-span-3">
                    <FormField id="contact-email" label="E-mail do contato">
                      <Input
                        id="contact-email"
                        type="email"
                        placeholder="fernanda@cliente.com.br"
                        value={newContactEmail}
                        onChange={(e) => setNewContactEmail(e.target.value)}
                        disabled={isPending}
                      />
                    </FormField>
                  </div>
                  <div className="sm:col-span-3">
                    <FormField id="contact-phone" label="Telefone / WhatsApp">
                      <Input
                        id="contact-phone"
                        placeholder="(11) 98888-0000"
                        value={newContactPhone}
                        onChange={(e) => setNewContactPhone(e.target.value)}
                        disabled={isPending}
                      />
                    </FormField>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending}>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Salvar Cliente
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Modal/Card de Edição de Cliente */}
      {canWrite && editingClient ? (
        <Card className="border-slate-300">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Editar Cliente: {editingClient.name}</CardTitle>
                <CardDescription>
                  Atualize os dados cadastrais e o responsável interno.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingClient(null)}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Cancelar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveEditClient} className="grid gap-4 sm:grid-cols-12">
              <div className="sm:col-span-3">
                <FormField id="edit-client-type" label="Natureza" required>
                  <select
                    id="edit-client-type"
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as ClientType)}
                    disabled={isPending}
                    className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-xs"
                  >
                    <option value="organization">Pessoa Jurídica (PJ)</option>
                    <option value="individual">Pessoa Física (PF)</option>
                  </select>
                </FormField>
              </div>

              <div className="sm:col-span-5">
                <FormField id="edit-client-name" label="Nome / Razão Social" required>
                  <Input
                    id="edit-client-name"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    disabled={isPending}
                  />
                </FormField>
              </div>

              <div className="sm:col-span-4">
                <FormField id="edit-client-tax" label="CPF / CNPJ">
                  <Input
                    id="edit-client-tax"
                    value={editTaxId}
                    onChange={(e) => setEditTaxId(e.target.value)}
                    disabled={isPending}
                  />
                </FormField>
              </div>

              <div className="sm:col-span-4">
                <FormField id="edit-client-email" label="E-mail">
                  <Input
                    id="edit-client-email"
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    disabled={isPending}
                  />
                </FormField>
              </div>

              <div className="sm:col-span-3">
                <FormField id="edit-client-phone" label="Telefone">
                  <Input
                    id="edit-client-phone"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    disabled={isPending}
                  />
                </FormField>
              </div>

              <div className="sm:col-span-5">
                <FormField id="edit-client-owner" label="Responsável Interno">
                  <select
                    id="edit-client-owner"
                    value={editOwnerMembershipId}
                    onChange={(e) => setEditOwnerMembershipId(e.target.value)}
                    disabled={isPending}
                    className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-xs"
                  >
                    <option value="">Sem responsável específico</option>
                    {ownerOptions.map((m) => (
                      <option key={m.membershipId} value={m.membershipId}>
                        {m.name} ({m.email})
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              <div className="sm:col-span-9">
                <FormField id="edit-client-notes" label="Observações">
                  <Input
                    id="edit-client-notes"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    disabled={isPending}
                  />
                </FormField>
              </div>

              <div className="flex items-end justify-end sm:col-span-3">
                <Button type="submit" className="w-full" disabled={isPending}>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Salvar Alterações
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Tabela de Clientes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Carteira de Clientes</CardTitle>
              <CardDescription>
                Relação de clientes da organização, contatos vinculados e empresas associadas.
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono">
              {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="Nenhum cliente encontrado"
              description="Cadastre o primeiro cliente da organização ou ajuste os filtros de busca acima."
            />
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente / Documento</TableHead>
                    <TableHead>Contato Principal</TableHead>
                    <TableHead>Responsável Interno</TableHead>
                    <TableHead>Empresas (PJ)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => {
                    const primaryContact =
                      client.contacts.find((c) => c.isPrimary) ?? client.contacts[0];
                    const isContactsExpanded = activeContactsClientId === client.id;

                    return (
                      <TableRow key={client.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {client.type === 'individual' ? 'PF' : 'PJ'}
                            </Badge>
                            <div>
                              <p className="text-xs font-medium text-slate-900">{client.name}</p>
                              <p className="font-mono text-[11px] text-slate-500">
                                {formatTaxIdDisplay(client.taxId, client.type)}
                                {client.email ? ` · ${client.email}` : ''}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          {primaryContact ? (
                            <div>
                              <p className="text-xs font-medium text-slate-800">
                                {primaryContact.name}
                                {primaryContact.position ? (
                                  <span className="ml-1 text-[11px] font-normal text-slate-500">
                                    ({primaryContact.position})
                                  </span>
                                ) : null}
                              </p>
                              <p className="font-mono text-[11px] text-slate-500">
                                {primaryContact.email ?? primaryContact.phone ?? '—'}
                              </p>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">Sem contato</span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setActiveContactsClientId(isContactsExpanded ? null : client.id)
                            }
                            className="mt-1 text-[11px] font-medium text-slate-600 underline hover:text-slate-900"
                          >
                            {isContactsExpanded
                              ? 'Ocultar contatos'
                              : `Gerenciar contatos (${client.contacts.length})`}
                          </button>
                        </TableCell>

                        <TableCell>
                          {client.ownerName ? (
                            <div>
                              <p className="text-xs text-slate-800">{client.ownerName}</p>
                              <p className="font-mono text-[11px] text-slate-500">
                                {client.ownerEmail}
                              </p>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">Não atribuído</span>
                          )}
                        </TableCell>

                        <TableCell>
                          <Link
                            href={`/${orgSlug}/empresas?clientId=${client.id}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <Landmark className="h-3 w-3 text-slate-500" />
                            <span>
                              {client.companyCount}{' '}
                              {client.companyCount === 1 ? 'empresa' : 'empresas'}
                            </span>
                          </Link>
                        </TableCell>

                        <TableCell>
                          {client.status === 'active' ? (
                            <Badge variant="emerald">Ativo</Badge>
                          ) : (
                            <Badge variant="warning">Inativo</Badge>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          {canWrite ? (
                            <div className="inline-flex items-center gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={isPending}
                                onClick={() => startEditClient(client)}
                              >
                                <Pencil className="mr-1 h-3 w-3" />
                                Editar
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={isPending}
                                onClick={() => handleToggleStatus(client)}
                              >
                                <Power className="mr-1 h-3 w-3" />
                                {client.status === 'active' ? 'Inativar' : 'Ativar'}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">Somente leitura</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Painel de Contatos do Cliente Selecionado */}
              {activeContactsClientId
                ? (() => {
                    const selectedClient = clients.find((c) => c.id === activeContactsClientId);
                    if (!selectedClient) return null;
                    return (
                      <div className="rounded-md border border-slate-200 bg-slate-50/80 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <h3 className="text-xs font-semibold text-slate-900">
                              Contatos de Relacionamento — {selectedClient.name}
                            </h3>
                            <p className="text-[11px] text-slate-500">
                              Pessoas autorizadas para comunicação operacional com este cliente.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setActiveContactsClientId(null)}
                          >
                            <X className="mr-1 h-3 w-3" />
                            Fechar
                          </Button>
                        </div>

                        {selectedClient.contacts.length === 0 ? (
                          <p className="py-2 text-xs text-slate-500">
                            Nenhum contato cadastrado para este cliente.
                          </p>
                        ) : (
                          <div className="mb-4 grid gap-2 sm:grid-cols-2">
                            {selectedClient.contacts.map((contact) => (
                              <div
                                key={contact.id}
                                className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2"
                              >
                                <div>
                                  <p className="text-xs font-medium text-slate-900">
                                    {contact.name}
                                    {contact.isPrimary ? (
                                      <Badge variant="emerald" className="ml-2 text-[10px]">
                                        Principal
                                      </Badge>
                                    ) : null}
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    {[contact.position, contact.email, contact.phone]
                                      .filter(Boolean)
                                      .join(' · ') || 'Sem detalhes adicionais'}
                                  </p>
                                </div>
                                {canWrite ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-red-700 hover:bg-red-50"
                                    disabled={isPending}
                                    onClick={() => handleRemoveContact(contact.id)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}

                        {canWrite ? (
                          <form
                            onSubmit={(e) => handleAddContact(e, selectedClient.id)}
                            className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-12 sm:items-end"
                          >
                            <div className="sm:col-span-3">
                              <FormField id="new-contact-name" label="Nome do contato" required>
                                <Input
                                  id="new-contact-name"
                                  required
                                  placeholder="Nome completo"
                                  value={contactFormName}
                                  onChange={(e) => setContactFormName(e.target.value)}
                                  disabled={isPending}
                                />
                              </FormField>
                            </div>
                            <div className="sm:col-span-2">
                              <FormField id="new-contact-pos" label="Cargo">
                                <Input
                                  id="new-contact-pos"
                                  placeholder="Ex.: Sócio / CFO"
                                  value={contactFormPosition}
                                  onChange={(e) => setContactFormPosition(e.target.value)}
                                  disabled={isPending}
                                />
                              </FormField>
                            </div>
                            <div className="sm:col-span-3">
                              <FormField id="new-contact-email" label="E-mail">
                                <Input
                                  id="new-contact-email"
                                  type="email"
                                  placeholder="contato@empresa.com.br"
                                  value={contactFormEmail}
                                  onChange={(e) => setContactFormEmail(e.target.value)}
                                  disabled={isPending}
                                />
                              </FormField>
                            </div>
                            <div className="sm:col-span-2">
                              <FormField id="new-contact-phone" label="Telefone">
                                <Input
                                  id="new-contact-phone"
                                  placeholder="(11) 99999-0000"
                                  value={contactFormPhone}
                                  onChange={(e) => setContactFormPhone(e.target.value)}
                                  disabled={isPending}
                                />
                              </FormField>
                            </div>
                            <div className="flex flex-col gap-1.5 sm:col-span-2">
                              <label className="flex items-center gap-1.5 text-[11px] text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={contactFormPrimary}
                                  onChange={(e) => setContactFormPrimary(e.target.checked)}
                                />
                                Contato principal
                              </label>
                              <Button type="submit" size="sm" disabled={isPending}>
                                <UserPlus className="mr-1 h-3.5 w-3.5" />
                                Adicionar
                              </Button>
                            </div>
                          </form>
                        ) : null}
                      </div>
                    );
                  })()
                : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
