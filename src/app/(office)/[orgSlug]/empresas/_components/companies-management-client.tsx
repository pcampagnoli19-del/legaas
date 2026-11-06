'use client';

import {
  Check,
  GitBranch,
  Landmark,
  Pencil,
  Plus,
  Power,
  Search,
  ShieldAlert,
  X,
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
import type { EntityStatus } from '@/server/modules/clients/service';
import {
  createCompanyAction,
  setCompanyStatusAction,
  updateCompanyAction,
} from '@/server/modules/companies/actions';

export interface SerializedCompany {
  id: string;
  clientId: string;
  clientName: string;
  parentCompanyId: string | null;
  parentCompanyName: string | null;
  parentCompanyCnpj: string | null;
  cnpj: string;
  legalName: string;
  tradeName: string | null;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressDistrict: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZipCode: string | null;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SelectableClientOption {
  id: string;
  name: string;
}

interface CompaniesManagementClientProps {
  orgSlug: string;
  canWrite: boolean;
  companies: SerializedCompany[];
  clientOptions: SelectableClientOption[];
  initialSearch: string;
  initialClientId: string;
  initialStatus: string;
}

function formatCnpjDisplay(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

export function CompaniesManagementClient({
  orgSlug,
  canWrite,
  companies,
  clientOptions,
  initialSearch,
  initialClientId,
  initialStatus,
}: CompaniesManagementClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Filtros
  const [search, setSearch] = useState(initialSearch);
  const [clientIdFilter, setClientIdFilter] = useState(initialClientId);
  const [statusFilter, setStatusFilter] = useState(initialStatus);

  // Nova empresa
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newClientId, setNewClientId] = useState(initialClientId || clientOptions[0]?.id || '');
  const [newParentCompanyId, setNewParentCompanyId] = useState('');
  const [newCnpj, setNewCnpj] = useState('');
  const [newLegalName, setNewLegalName] = useState('');
  const [newTradeName, setNewTradeName] = useState('');
  const [newStateReg, setNewStateReg] = useState('');
  const [newMunicipalReg, setNewMunicipalReg] = useState('');
  const [newStreet, setNewStreet] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newComplement, setNewComplement] = useState('');
  const [newDistrict, setNewDistrict] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newState, setNewState] = useState('');
  const [newZipCode, setNewZipCode] = useState('');

  // Edição de empresa
  const [editingCompany, setEditingCompany] = useState<SerializedCompany | null>(null);
  const [editClientId, setEditClientId] = useState('');
  const [editParentCompanyId, setEditParentCompanyId] = useState('');
  const [editCnpj, setEditCnpj] = useState('');
  const [editLegalName, setEditLegalName] = useState('');
  const [editTradeName, setEditTradeName] = useState('');
  const [editStateReg, setEditStateReg] = useState('');
  const [editMunicipalReg, setEditMunicipalReg] = useState('');
  const [editStreet, setEditStreet] = useState('');
  const [editNumber, setEditNumber] = useState('');
  const [editComplement, setEditComplement] = useState('');
  const [editDistrict, setEditDistrict] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editZipCode, setEditZipCode] = useState('');

  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (clientIdFilter) params.set('clientId', clientIdFilter);
    if (statusFilter) params.set('status', statusFilter);
    const qs = params.toString();
    router.push(`/${orgSlug}/empresas${qs ? `?${qs}` : ''}`);
  }

  function handleClearFilters() {
    setSearch('');
    setClientIdFilter('');
    setStatusFilter('');
    router.push(`/${orgSlug}/empresas`);
  }

  function handleCreateCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedbackError(null);
    setFeedbackSuccess(null);

    const targetClientId = newClientId || clientOptions[0]?.id;
    if (!targetClientId) {
      setFeedbackError('Cadastre ao menos um cliente antes de registrar uma empresa.');
      return;
    }

    startTransition(async () => {
      const result = await createCompanyAction({
        orgSlug,
        clientId: targetClientId,
        parentCompanyId: newParentCompanyId || undefined,
        cnpj: newCnpj,
        legalName: newLegalName,
        tradeName: newTradeName.trim() || undefined,
        stateRegistration: newStateReg.trim() || undefined,
        municipalRegistration: newMunicipalReg.trim() || undefined,
        addressStreet: newStreet.trim() || undefined,
        addressNumber: newNumber.trim() || undefined,
        addressComplement: newComplement.trim() || undefined,
        addressDistrict: newDistrict.trim() || undefined,
        addressCity: newCity.trim() || undefined,
        addressState: newState.trim() || undefined,
        addressZipCode: newZipCode.trim() || undefined,
      });

      if (!result.ok) {
        setFeedbackError(result.error.message);
        return;
      }

      setNewParentCompanyId('');
      setNewCnpj('');
      setNewLegalName('');
      setNewTradeName('');
      setNewStateReg('');
      setNewMunicipalReg('');
      setNewStreet('');
      setNewNumber('');
      setNewComplement('');
      setNewDistrict('');
      setNewCity('');
      setNewState('');
      setNewZipCode('');
      setShowCreateForm(false);
      setFeedbackSuccess(`Empresa "${result.data.legalName}" cadastrada com sucesso.`);
      router.refresh();
    });
  }

  function startEditCompany(company: SerializedCompany) {
    setEditingCompany(company);
    setEditClientId(company.clientId);
    setEditParentCompanyId(company.parentCompanyId ?? '');
    setEditCnpj(company.cnpj);
    setEditLegalName(company.legalName);
    setEditTradeName(company.tradeName ?? '');
    setEditStateReg(company.stateRegistration ?? '');
    setEditMunicipalReg(company.municipalRegistration ?? '');
    setEditStreet(company.addressStreet ?? '');
    setEditNumber(company.addressNumber ?? '');
    setEditComplement(company.addressComplement ?? '');
    setEditDistrict(company.addressDistrict ?? '');
    setEditCity(company.addressCity ?? '');
    setEditState(company.addressState ?? '');
    setEditZipCode(company.addressZipCode ?? '');
    setFeedbackError(null);
    setFeedbackSuccess(null);
  }

  function handleSaveEditCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCompany) return;
    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const result = await updateCompanyAction({
        orgSlug,
        companyId: editingCompany.id,
        clientId: editClientId,
        parentCompanyId: editParentCompanyId || undefined,
        cnpj: editCnpj,
        legalName: editLegalName,
        tradeName: editTradeName.trim() || undefined,
        stateRegistration: editStateReg.trim() || undefined,
        municipalRegistration: editMunicipalReg.trim() || undefined,
        addressStreet: editStreet.trim() || undefined,
        addressNumber: editNumber.trim() || undefined,
        addressComplement: editComplement.trim() || undefined,
        addressDistrict: editDistrict.trim() || undefined,
        addressCity: editCity.trim() || undefined,
        addressState: editState.trim() || undefined,
        addressZipCode: editZipCode.trim() || undefined,
      });

      if (!result.ok) {
        setFeedbackError(result.error.message);
        return;
      }

      setEditingCompany(null);
      setFeedbackSuccess(`Empresa "${result.data.legalName}" atualizada com sucesso.`);
      router.refresh();
    });
  }

  function handleToggleStatus(company: SerializedCompany) {
    const nextStatus: EntityStatus = company.status === 'active' ? 'inactive' : 'active';
    setFeedbackError(null);
    setFeedbackSuccess(null);

    startTransition(async () => {
      const result = await setCompanyStatusAction({
        orgSlug,
        companyId: company.id,
        status: nextStatus,
      });

      if (!result.ok) {
        setFeedbackError(result.error.message);
        return;
      }

      setFeedbackSuccess(
        nextStatus === 'active'
          ? `Empresa "${company.legalName}" reativada.`
          : `Empresa "${company.legalName}" inativada.`,
      );
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

      {/* Barra de Pesquisa e Filtros */}
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleFilterSubmit} className="grid gap-3 sm:grid-cols-12 sm:items-end">
            <div className="sm:col-span-4">
              <FormField id="filter-company-search" label="Pesquisar empresa">
                <Input
                  id="filter-company-search"
                  placeholder="Razão social, nome fantasia ou CNPJ..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </FormField>
            </div>

            <div className="sm:col-span-3">
              <FormField id="filter-company-client" label="Cliente vinculado">
                <select
                  id="filter-company-client"
                  value={clientIdFilter}
                  onChange={(e) => setClientIdFilter(e.target.value)}
                  className="border-input bg-background flex h-9 w-full rounded-md border px-2.5 text-xs"
                >
                  <option value="">Todos os clientes</option>
                  {clientOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="sm:col-span-2">
              <FormField id="filter-company-status" label="Status">
                <select
                  id="filter-company-status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="border-input bg-background flex h-9 w-full rounded-md border px-2.5 text-xs"
                >
                  <option value="">Todos</option>
                  <option value="active">Ativas</option>
                  <option value="inactive">Inativas</option>
                </select>
              </FormField>
            </div>

            <div className="flex items-center gap-2 sm:col-span-3">
              <Button type="submit" variant="outline" className="flex-1">
                <Search className="mr-1.5 h-3.5 w-3.5" />
                Filtrar
              </Button>
              {search || clientIdFilter || statusFilter ? (
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
                  Nova Empresa
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Formulário de Cadastro de Nova Empresa */}
      {canWrite && showCreateForm ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Cadastrar Nova Empresa (Pessoa Jurídica)</CardTitle>
                <CardDescription>
                  Vincule a pessoa jurídica a um cliente da organização e, quando aplicável, a uma
                  empresa-mãe (holding) do grupo empresarial (Decisão A2).
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
            {clientOptions.length === 0 ? (
              <p className="text-xs text-amber-800">
                Nenhum cliente cadastrado. Cadastre primeiro um cliente em{' '}
                <a href={`/${orgSlug}/clientes`} className="font-semibold underline">
                  /{orgSlug}/clientes
                </a>{' '}
                para vincular empresas.
              </p>
            ) : (
              <form onSubmit={handleCreateCompany} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-12">
                  <div className="sm:col-span-6">
                    <FormField id="company-client" label="Cliente Vinculado" required>
                      <select
                        id="company-client"
                        required
                        value={newClientId}
                        onChange={(e) => setNewClientId(e.target.value)}
                        disabled={isPending}
                        className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-xs"
                      >
                        {clientOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </div>

                  <div className="sm:col-span-6">
                    <FormField
                      id="company-parent"
                      label="Empresa-Mãe / Holding (Grupo Empresarial)"
                    >
                      <select
                        id="company-parent"
                        value={newParentCompanyId}
                        onChange={(e) => setNewParentCompanyId(e.target.value)}
                        disabled={isPending}
                        className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-xs"
                      >
                        <option value="">Nenhuma (Empresa independente / Matriz)</option>
                        {companies.map((comp) => (
                          <option key={comp.id} value={comp.id}>
                            {comp.legalName} ({formatCnpjDisplay(comp.cnpj)})
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </div>

                  <div className="sm:col-span-4">
                    <FormField id="company-cnpj" label="CNPJ (14 dígitos)" required>
                      <Input
                        id="company-cnpj"
                        required
                        placeholder="00.000.000/0001-00"
                        value={newCnpj}
                        onChange={(e) => setNewCnpj(e.target.value)}
                        disabled={isPending}
                      />
                    </FormField>
                  </div>

                  <div className="sm:col-span-5">
                    <FormField id="company-legal-name" label="Razão Social" required>
                      <Input
                        id="company-legal-name"
                        required
                        placeholder="Ex.: Horizonte Logística Integrada S.A."
                        value={newLegalName}
                        onChange={(e) => setNewLegalName(e.target.value)}
                        disabled={isPending}
                      />
                    </FormField>
                  </div>

                  <div className="sm:col-span-3">
                    <FormField id="company-trade-name" label="Nome Fantasia">
                      <Input
                        id="company-trade-name"
                        placeholder="Ex.: Horizonte Log"
                        value={newTradeName}
                        onChange={(e) => setNewTradeName(e.target.value)}
                        disabled={isPending}
                      />
                    </FormField>
                  </div>

                  <div className="sm:col-span-3">
                    <FormField id="company-ie" label="Inscrição Estadual (IE)">
                      <Input
                        id="company-ie"
                        placeholder="Isento ou número"
                        value={newStateReg}
                        onChange={(e) => setNewStateReg(e.target.value)}
                        disabled={isPending}
                      />
                    </FormField>
                  </div>

                  <div className="sm:col-span-3">
                    <FormField id="company-im" label="Inscrição Municipal (IM)">
                      <Input
                        id="company-im"
                        placeholder="Número CCM / IM"
                        value={newMunicipalReg}
                        onChange={(e) => setNewMunicipalReg(e.target.value)}
                        disabled={isPending}
                      />
                    </FormField>
                  </div>

                  <div className="sm:col-span-4">
                    <FormField id="company-street" label="Logradouro">
                      <Input
                        id="company-street"
                        placeholder="Av. Paulista"
                        value={newStreet}
                        onChange={(e) => setNewStreet(e.target.value)}
                        disabled={isPending}
                      />
                    </FormField>
                  </div>

                  <div className="sm:col-span-2">
                    <FormField id="company-number" label="Número">
                      <Input
                        id="company-number"
                        placeholder="1000"
                        value={newNumber}
                        onChange={(e) => setNewNumber(e.target.value)}
                        disabled={isPending}
                      />
                    </FormField>
                  </div>

                  <div className="sm:col-span-3">
                    <FormField id="company-complement" label="Complemento">
                      <Input
                        id="company-complement"
                        placeholder="Conj. 121"
                        value={newComplement}
                        onChange={(e) => setNewComplement(e.target.value)}
                        disabled={isPending}
                      />
                    </FormField>
                  </div>

                  <div className="sm:col-span-3">
                    <FormField id="company-district" label="Bairro">
                      <Input
                        id="company-district"
                        placeholder="Bela Vista"
                        value={newDistrict}
                        onChange={(e) => setNewDistrict(e.target.value)}
                        disabled={isPending}
                      />
                    </FormField>
                  </div>

                  <div className="sm:col-span-3">
                    <FormField id="company-city" label="Município">
                      <Input
                        id="company-city"
                        placeholder="São Paulo"
                        value={newCity}
                        onChange={(e) => setNewCity(e.target.value)}
                        disabled={isPending}
                      />
                    </FormField>
                  </div>

                  <div className="sm:col-span-1">
                    <FormField id="company-state" label="UF">
                      <Input
                        id="company-state"
                        maxLength={2}
                        placeholder="SP"
                        value={newState}
                        onChange={(e) => setNewState(e.target.value)}
                        disabled={isPending}
                      />
                    </FormField>
                  </div>

                  <div className="sm:col-span-2">
                    <FormField id="company-zip" label="CEP">
                      <Input
                        id="company-zip"
                        placeholder="01310-100"
                        value={newZipCode}
                        onChange={(e) => setNewZipCode(e.target.value)}
                        disabled={isPending}
                      />
                    </FormField>
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
                    Salvar Empresa
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Card de Edição de Empresa */}
      {canWrite && editingCompany ? (
        <Card className="border-slate-300">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Editar Empresa: {editingCompany.legalName}</CardTitle>
                <CardDescription>
                  Atualize dados societários, endereço e vínculo com holding/cliente.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingCompany(null)}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Cancelar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveEditCompany} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-12">
                <div className="sm:col-span-6">
                  <FormField id="edit-company-client" label="Cliente Vinculado" required>
                    <select
                      id="edit-company-client"
                      required
                      value={editClientId}
                      onChange={(e) => setEditClientId(e.target.value)}
                      disabled={isPending}
                      className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-xs"
                    >
                      {clientOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>

                <div className="sm:col-span-6">
                  <FormField id="edit-company-parent" label="Empresa-Mãe / Holding">
                    <select
                      id="edit-company-parent"
                      value={editParentCompanyId}
                      onChange={(e) => setEditParentCompanyId(e.target.value)}
                      disabled={isPending}
                      className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-xs"
                    >
                      <option value="">Nenhuma (Empresa independente / Matriz)</option>
                      {companies
                        .filter((comp) => comp.id !== editingCompany.id)
                        .map((comp) => (
                          <option key={comp.id} value={comp.id}>
                            {comp.legalName} ({formatCnpjDisplay(comp.cnpj)})
                          </option>
                        ))}
                    </select>
                  </FormField>
                </div>

                <div className="sm:col-span-4">
                  <FormField id="edit-company-cnpj" label="CNPJ" required>
                    <Input
                      id="edit-company-cnpj"
                      required
                      value={editCnpj}
                      onChange={(e) => setEditCnpj(e.target.value)}
                      disabled={isPending}
                    />
                  </FormField>
                </div>

                <div className="sm:col-span-5">
                  <FormField id="edit-company-legal-name" label="Razão Social" required>
                    <Input
                      id="edit-company-legal-name"
                      required
                      value={editLegalName}
                      onChange={(e) => setEditLegalName(e.target.value)}
                      disabled={isPending}
                    />
                  </FormField>
                </div>

                <div className="sm:col-span-3">
                  <FormField id="edit-company-trade-name" label="Nome Fantasia">
                    <Input
                      id="edit-company-trade-name"
                      value={editTradeName}
                      onChange={(e) => setEditTradeName(e.target.value)}
                      disabled={isPending}
                    />
                  </FormField>
                </div>

                <div className="sm:col-span-3">
                  <FormField id="edit-company-ie" label="Inscrição Estadual">
                    <Input
                      id="edit-company-ie"
                      value={editStateReg}
                      onChange={(e) => setEditStateReg(e.target.value)}
                      disabled={isPending}
                    />
                  </FormField>
                </div>

                <div className="sm:col-span-3">
                  <FormField id="edit-company-im" label="Inscrição Municipal">
                    <Input
                      id="edit-company-im"
                      value={editMunicipalReg}
                      onChange={(e) => setEditMunicipalReg(e.target.value)}
                      disabled={isPending}
                    />
                  </FormField>
                </div>

                <div className="sm:col-span-4">
                  <FormField id="edit-company-street" label="Logradouro">
                    <Input
                      id="edit-company-street"
                      value={editStreet}
                      onChange={(e) => setEditStreet(e.target.value)}
                      disabled={isPending}
                    />
                  </FormField>
                </div>

                <div className="sm:col-span-2">
                  <FormField id="edit-company-number" label="Número">
                    <Input
                      id="edit-company-number"
                      value={editNumber}
                      onChange={(e) => setEditNumber(e.target.value)}
                      disabled={isPending}
                    />
                  </FormField>
                </div>

                <div className="sm:col-span-3">
                  <FormField id="edit-company-complement" label="Complemento">
                    <Input
                      id="edit-company-complement"
                      value={editComplement}
                      onChange={(e) => setEditComplement(e.target.value)}
                      disabled={isPending}
                    />
                  </FormField>
                </div>

                <div className="sm:col-span-3">
                  <FormField id="edit-company-district" label="Bairro">
                    <Input
                      id="edit-company-district"
                      value={editDistrict}
                      onChange={(e) => setEditDistrict(e.target.value)}
                      disabled={isPending}
                    />
                  </FormField>
                </div>

                <div className="sm:col-span-3">
                  <FormField id="edit-company-city" label="Município">
                    <Input
                      id="edit-company-city"
                      value={editCity}
                      onChange={(e) => setEditCity(e.target.value)}
                      disabled={isPending}
                    />
                  </FormField>
                </div>

                <div className="sm:col-span-1">
                  <FormField id="edit-company-state" label="UF">
                    <Input
                      id="edit-company-state"
                      maxLength={2}
                      value={editState}
                      onChange={(e) => setEditState(e.target.value)}
                      disabled={isPending}
                    />
                  </FormField>
                </div>

                <div className="sm:col-span-2">
                  <FormField id="edit-company-zip" label="CEP">
                    <Input
                      id="edit-company-zip"
                      value={editZipCode}
                      onChange={(e) => setEditZipCode(e.target.value)}
                      disabled={isPending}
                    />
                  </FormField>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingCompany(null)}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending}>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Salvar Alterações
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Tabela de Empresas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Empresas e Pessoas Jurídicas</CardTitle>
              <CardDescription>
                Relação de CNPJs, inscrições, endereços e estrutura societária (holding e
                controladas) por cliente.
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono">
              {companies.length} {companies.length === 1 ? 'empresa' : 'empresas'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {companies.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="Nenhuma empresa encontrada"
              description="Cadastre a primeira pessoa jurídica vinculada a um cliente ou ajuste os filtros acima."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Razão Social / Nome Fantasia</TableHead>
                  <TableHead>CNPJ / Inscrições</TableHead>
                  <TableHead>Cliente / Grupo Empresarial</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => {
                  const locationSummary = [company.addressCity, company.addressState]
                    .filter(Boolean)
                    .join('/');

                  return (
                    <TableRow key={company.id}>
                      <TableCell>
                        <p className="text-xs font-medium text-slate-900">{company.legalName}</p>
                        {company.tradeName ? (
                          <p className="text-[11px] text-slate-500">{company.tradeName}</p>
                        ) : null}
                      </TableCell>

                      <TableCell>
                        <p className="font-mono text-xs font-medium text-slate-800">
                          {formatCnpjDisplay(company.cnpj)}
                        </p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {company.stateRegistration ? `IE: ${company.stateRegistration}` : ''}
                          {company.stateRegistration && company.municipalRegistration ? ' · ' : ''}
                          {company.municipalRegistration
                            ? `IM: ${company.municipalRegistration}`
                            : ''}
                          {!company.stateRegistration && !company.municipalRegistration
                            ? 'Sem IE/IM'
                            : ''}
                        </p>
                      </TableCell>

                      <TableCell>
                        <p className="text-xs font-medium text-slate-800">{company.clientName}</p>
                        {company.parentCompanyName ? (
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                            <GitBranch className="h-3 w-3 shrink-0 text-slate-400" />
                            <span>Holding: {company.parentCompanyName}</span>
                          </p>
                        ) : (
                          <p className="text-[11px] text-slate-400">Matriz / Independente</p>
                        )}
                      </TableCell>

                      <TableCell>
                        {locationSummary ? (
                          <div>
                            <p className="text-xs text-slate-800">{locationSummary}</p>
                            {company.addressStreet ? (
                              <p className="truncate text-[11px] text-slate-500">
                                {company.addressStreet}
                                {company.addressNumber ? `, ${company.addressNumber}` : ''}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Não informado</span>
                        )}
                      </TableCell>

                      <TableCell>
                        {company.status === 'active' ? (
                          <Badge variant="emerald">Ativa</Badge>
                        ) : (
                          <Badge variant="warning">Inativa</Badge>
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
                              onClick={() => startEditCompany(company)}
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
                              onClick={() => handleToggleStatus(company)}
                            >
                              <Power className="mr-1 h-3 w-3" />
                              {company.status === 'active' ? 'Inativar' : 'Ativar'}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
