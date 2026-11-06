'use client';

import {
  AlertCircle,
  BellRing,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  FileCheck2,
  FileUp,
  Filter,
  FolderKanban,
  Landmark,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useTransition } from 'react';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { FormField } from '@/components/shared/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  type AnalyzeCertificatePdfActionResult,
  analyzeCertificatePdfAction,
  archiveCertificateAction,
  updateCertificateAction,
  uploadAndRegisterCertificateAction,
} from '@/server/modules/certificates/actions';
import {
  CERTIFICATE_TYPE_LABELS,
  CERTIFICATE_TYPES,
  type CertificateTypeCode,
} from '@/server/modules/certificates/types';
import type {
  CertificateValidityStatus,
  ExpirationAlertsDashboard,
} from '@/server/modules/certificates/service';

export interface SerializedCertificateItem {
  id: string;
  title: string;
  categoryName: string | null;
  certificateType: CertificateTypeCode;
  certificateTypeLabel: string;
  issuingAuthority: string | null;
  issueDate: string | null;
  expirationDate: string | null;
  daysUntilExpiration: number | null;
  validityStatus: CertificateValidityStatus;
  activeAlertThreshold: number | null;
  alertDaysBefore: number[];
  controlCode: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  visibility: 'internal' | 'shared';
  clientId: string | null;
  clientName: string | null;
  companyId: string | null;
  companyLegalName: string | null;
  companyCnpj: string | null;
  demandId: string | null;
  demandCode: string | null;
  demandTitle: string | null;
  extractedMetadata: Record<string, unknown>;
  uploadedByName: string;
  createdAt: string;
}

export interface CertificateClientOption {
  id: string;
  name: string;
}

export interface CertificateCompanyOption {
  id: string;
  clientId: string;
  legalName: string;
  cnpj: string;
}

export interface CertificateDemandOption {
  id: string;
  code: string;
  title: string;
  clientId: string;
  companyId: string | null;
}

interface CertificatesManagementClientProps {
  orgSlug: string;
  canWriteDocuments: boolean;
  groqConfigured: boolean;
  groqModel: string;
  certificates: SerializedCertificateItem[];
  alertsDashboard: ExpirationAlertsDashboard;
  clients: CertificateClientOption[];
  companies: CertificateCompanyOption[];
  demands: CertificateDemandOption[];
  initialFilters: {
    search: string;
    clientId: string;
    companyId: string;
    certificateType: string;
    validityStatus: string;
  };
}

export const VALIDITY_STATUS_LABELS: Record<CertificateValidityStatus, string> = {
  expired: 'Vencida',
  expiring_soon: 'Vencendo (Alerta)',
  valid: 'Regular / Vigente',
  no_expiration: 'Sem Vencimento',
};

export const VALIDITY_STATUS_BADGE: Record<
  CertificateValidityStatus,
  'danger' | 'warning' | 'emerald' | 'outline'
> = {
  expired: 'danger',
  expiring_soon: 'warning',
  valid: 'emerald',
  no_expiration: 'outline',
};

function formatDateBr(isoDate: string | null): string {
  if (!isoDate) return '—';
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatCnpj(raw: string | null | undefined): string {
  if (!raw) return '—';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }
  return raw;
}

function formatRemainingDaysBadge(days: number | null): string {
  if (days === null) return 'Indeterminado';
  if (days < 0) return `Vencida há ${Math.abs(days)}d`;
  if (days === 0) return 'Vence HOJE';
  return `Vence em ${days}d`;
}

export function CertificatesManagementClient({
  orgSlug,
  canWriteDocuments,
  groqConfigured,
  groqModel,
  certificates,
  alertsDashboard,
  clients,
  companies,
  demands,
  initialFilters,
}: CertificatesManagementClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Filtros
  const [search, setSearch] = useState(initialFilters.search);
  const [filterClientId, setFilterClientId] = useState(initialFilters.clientId);
  const [filterCompanyId, setFilterCompanyId] = useState(initialFilters.companyId);
  const [filterCertType, setFilterCertType] = useState(initialFilters.certificateType);
  const [filterValidity, setFilterValidity] = useState(initialFilters.validityStatus);

  // Painel de upload + análise IA Groq
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedCertificateText, setPastedCertificateText] = useState('');
  const [aiAnalysisResult, setAiAnalysisResult] =
    useState<AnalyzeCertificatePdfActionResult | null>(null);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);

  // Campos do formulário de registro da certidão
  const [formTitle, setFormTitle] = useState('');
  const [formCertType, setFormCertType] = useState<CertificateTypeCode>('CND_RFB_PGFN');
  const [formIssuingAuthority, setFormIssuingAuthority] = useState('');
  const [formIssueDate, setFormIssueDate] = useState('');
  const [formExpirationDate, setFormExpirationDate] = useState('');
  const [formControlCode, setFormControlCode] = useState('');
  const [formAlertDays, setFormAlertDays] = useState('30, 15, 7');
  const [formClientId, setFormClientId] = useState(clients[0]?.id ?? '');
  const [formCompanyId, setFormCompanyId] = useState('');
  const [formDemandId, setFormDemandId] = useState('');
  const [formVisibility, setFormVisibility] = useState<'internal' | 'shared'>('shared');
  const [formCreateDeadline, setFormCreateDeadline] = useState(true);

  // Estado de edição de certidão existente
  const [editingCert, setEditingCert] = useState<SerializedCertificateItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCertType, setEditCertType] = useState<CertificateTypeCode>('CND_RFB_PGFN');
  const [editIssuingAuthority, setEditIssuingAuthority] = useState('');
  const [editIssueDate, setEditIssueDate] = useState('');
  const [editExpirationDate, setEditExpirationDate] = useState('');
  const [editControlCode, setEditControlCode] = useState('');
  const [editAlertDays, setEditAlertDays] = useState('30, 15, 7');

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const formCompanyOptions = useMemo(() => {
    if (!formClientId) return companies;
    return companies.filter((c) => c.clientId === formClientId);
  }, [companies, formClientId]);

  const formDemandOptions = useMemo(() => {
    if (!formClientId) return demands;
    return demands.filter((d) => d.clientId === formClientId);
  }, [demands, formClientId]);

  function applyExtractedFields(data: AnalyzeCertificatePdfActionResult) {
    setAiAnalysisResult(data);
    if (data.title) setFormTitle(data.title);
    if (data.certificateType) setFormCertType(data.certificateType);
    if (data.issuingAuthority) setFormIssuingAuthority(data.issuingAuthority);
    if (data.issueDate) setFormIssueDate(data.issueDate);
    if (data.expirationDate) setFormExpirationDate(data.expirationDate);
    if (data.controlCode) setFormControlCode(data.controlCode);
    if (data.matchedClientId) {
      setFormClientId(data.matchedClientId);
    }
    if (data.matchedCompanyId) {
      setFormCompanyId(data.matchedCompanyId);
    }
  }

  async function triggerGroqExtraction(fileToAnalyze: File | null, textOverride?: string) {
    if (!fileToAnalyze && !textOverride?.trim()) {
      setFeedback({
        type: 'error',
        message: 'Selecione um arquivo PDF ou cole o texto da certidão para extrair com a IA.',
      });
      return;
    }

    setIsAnalyzingAi(true);
    setFeedback(null);

    try {
      const fd = new FormData();
      fd.set('orgSlug', orgSlug);
      if (fileToAnalyze) {
        fd.set('file', fileToAnalyze);
      }
      if (textOverride?.trim()) {
        fd.set('pastedText', textOverride.trim());
      }

      const result = await analyzeCertificatePdfAction(fd);
      if (!result.ok) {
        setFeedback({ type: 'error', message: result.error.message });
        return;
      }

      applyExtractedFields(result.data);
      const engineLabel =
        result.data.extractionEngine === 'groq-llm'
          ? `IA Groq (${result.data.extractionModel})`
          : 'Motor Determinístico (Fallback Local)';

      setFeedback({
        type: 'success',
        message: `Extração concluída via ${engineLabel}: validade ${
          result.data.expirationDate ? formatDateBr(result.data.expirationDate) : 'não identificada'
        }${
          result.data.matchedCompanyLegalName
            ? ` · Empresa vinculada pelo CNPJ: ${result.data.matchedCompanyLegalName}`
            : ''
        }. Revise os campos abaixo e salve.`,
      });
    } finally {
      setIsAnalyzingAi(false);
    }
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (file) {
      void triggerGroqExtraction(file, pastedCertificateText);
    }
  }

  function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    startTransition(async () => {
      const fd = new FormData();
      fd.set('orgSlug', orgSlug);
      if (selectedFile) {
        fd.set('file', selectedFile);
        fd.set('originalName', selectedFile.name);
      } else {
        fd.set('originalName', `${formCertType.toLowerCase()}.pdf`);
      }
      fd.set('title', formTitle);
      fd.set('certificateType', formCertType);
      fd.set('issuingAuthority', formIssuingAuthority);
      fd.set('issueDate', formIssueDate);
      fd.set('expirationDate', formExpirationDate);
      fd.set('controlCode', formControlCode);
      fd.set('alertDaysBefore', formAlertDays);
      fd.set('clientId', formClientId);
      fd.set('companyId', formCompanyId);
      fd.set('demandId', formDemandId);
      fd.set('visibility', formVisibility);
      fd.set('createLinkedDeadline', String(formCreateDeadline));
      fd.set('extractionEngine', aiAnalysisResult?.extractionEngine ?? 'manual');
      fd.set('extractionModel', aiAnalysisResult?.extractionModel ?? '');
      fd.set('extractedCnpj', aiAnalysisResult?.cnpj ?? '');

      const res = await uploadAndRegisterCertificateAction(fd);
      if (!res.ok) {
        setFeedback({ type: 'error', message: res.error.message });
        return;
      }

      setFeedback({
        type: 'success',
        message: `Certidão "${res.data.title}" registrada com sucesso${
          res.data.linkedDeadlineId
            ? ' e prazo de renovação adicionado automaticamente à demanda vinculada'
            : ''
        }.`,
      });
      setShowUploadPanel(false);
      setSelectedFile(null);
      setPastedCertificateText('');
      setAiAnalysisResult(null);
      setFormTitle('');
      setFormIssuingAuthority('');
      setFormIssueDate('');
      setFormExpirationDate('');
      setFormControlCode('');
      router.refresh();
    });
  }

  function openEditModal(cert: SerializedCertificateItem) {
    setEditingCert(cert);
    setEditTitle(cert.title);
    setEditCertType(cert.certificateType);
    setEditIssuingAuthority(cert.issuingAuthority ?? '');
    setEditIssueDate(cert.issueDate ?? '');
    setEditExpirationDate(cert.expirationDate ?? '');
    setEditControlCode(cert.controlCode ?? '');
    setEditAlertDays(cert.alertDaysBefore.join(', '));
  }

  function handleUpdateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCert) return;
    setFeedback(null);

    const parsedAlerts = editAlertDays
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 365);

    startTransition(async () => {
      const res = await updateCertificateAction({
        orgSlug,
        documentId: editingCert.id,
        title: editTitle,
        certificateType: editCertType,
        issuingAuthority: editIssuingAuthority || null,
        issueDate: editIssueDate || null,
        expirationDate: editExpirationDate || null,
        controlCode: editControlCode || null,
        alertDaysBefore: parsedAlerts.length > 0 ? parsedAlerts : [30, 15, 7],
      });

      if (!res.ok) {
        setFeedback({ type: 'error', message: res.error.message });
        return;
      }

      setFeedback({
        type: 'success',
        message: `Validade e metadados de "${res.data.title}" atualizados com sucesso.`,
      });
      setEditingCert(null);
      router.refresh();
    });
  }

  function handleArchive(cert: SerializedCertificateItem) {
    setFeedback(null);
    startTransition(async () => {
      const res = await archiveCertificateAction({
        orgSlug,
        documentId: cert.id,
      });
      if (!res.ok) {
        setFeedback({ type: 'error', message: res.error.message });
        return;
      }
      setFeedback({
        type: 'success',
        message: `Certidão "${cert.title}" arquivada e registrada na auditoria.`,
      });
      router.refresh();
    });
  }

  function handleApplyFilters(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (filterClientId) params.set('clientId', filterClientId);
    if (filterCompanyId) params.set('companyId', filterCompanyId);
    if (filterCertType) params.set('type', filterCertType);
    if (filterValidity) params.set('status', filterValidity);
    const qs = params.toString();
    router.push(`/${orgSlug}/certidoes${qs ? `?${qs}` : ''}`);
  }

  function handleClearFilters() {
    setSearch('');
    setFilterClientId('');
    setFilterCompanyId('');
    setFilterCertType('');
    setFilterValidity('');
    router.push(`/${orgSlug}/certidoes`);
  }

  const columns: DataTableColumn<SerializedCertificateItem>[] = [
    {
      key: 'certificate',
      header: 'Certidão e Órgão Emissor',
      cell: (row) => (
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-slate-900">{row.title}</span>
            {row.extractedMetadata?.extractionEngine === 'groq-llm' ? (
              <Badge variant="default" title="Metadados extraídos via IA Groq">
                <Sparkles className="mr-1 h-2.5 w-2.5" />
                Groq IA
              </Badge>
            ) : null}
          </div>
          <p className="text-[11px] text-slate-500">
            {row.certificateTypeLabel}
            {row.issuingAuthority ? ` · ${row.issuingAuthority}` : ''}
          </p>
          {row.controlCode ? (
            <p className="font-mono text-[10px] text-slate-400">
              Controle/Autenticidade: {row.controlCode}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'clientCompanyDemand',
      header: 'Cliente / Empresa / Demanda',
      cell: (row) => (
        <div className="space-y-0.5">
          {row.clientName ? (
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>{row.clientName}</span>
            </div>
          ) : null}
          {row.companyLegalName ? (
            <div className="flex items-center gap-1 text-[11px] text-slate-600">
              <Landmark className="h-3 w-3 shrink-0 text-slate-400" />
              <span>{row.companyLegalName}</span>
              {row.companyCnpj ? (
                <span className="font-mono text-[10px] text-slate-400">
                  ({formatCnpj(row.companyCnpj)})
                </span>
              ) : null}
            </div>
          ) : null}
          {row.demandId && row.demandCode ? (
            <Link
              href={`/${orgSlug}/demandas/${row.demandId}`}
              className="text-brand-navy inline-flex items-center gap-1 font-mono text-[11px] font-semibold hover:underline"
            >
              <FolderKanban className="h-3 w-3" />
              {row.demandCode}
            </Link>
          ) : null}
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Emissão e Validade',
      cell: (row) => (
        <div className="space-y-0.5 text-xs">
          <div className="text-[11px] text-slate-500">
            Emissão: <span className="font-mono text-slate-700">{formatDateBr(row.issueDate)}</span>
          </div>
          <div
            className={`flex items-center gap-1 font-mono font-semibold ${
              row.validityStatus === 'expired'
                ? 'text-red-700'
                : row.validityStatus === 'expiring_soon'
                  ? 'text-amber-800'
                  : 'text-slate-900'
            }`}
          >
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>{formatDateBr(row.expirationDate)}</span>
          </div>
          <p className="text-[10px] text-slate-400">
            Alertas: {row.alertDaysBefore.join('d, ')}d antes
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status e Alerta',
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <Badge variant={VALIDITY_STATUS_BADGE[row.validityStatus]}>
            {VALIDITY_STATUS_LABELS[row.validityStatus]}
          </Badge>
          <span
            className={`font-mono text-[11px] font-semibold ${
              row.validityStatus === 'expired'
                ? 'text-red-700'
                : row.validityStatus === 'expiring_soon'
                  ? 'text-amber-700'
                  : 'text-emerald-700'
            }`}
          >
            {formatRemainingDaysBadge(row.daysUntilExpiration)}
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Ações',
      className: 'text-right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <a
            href={`/api/office/${orgSlug}/documents/${row.id}/download`}
            target="_blank"
            rel="noreferrer"
            title="Baixar / visualizar PDF original"
          >
            <Button type="button" variant="outline" size="sm">
              <Download className="h-3.5 w-3.5" />
              PDF
            </Button>
          </a>
          {canWriteDocuments ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openEditModal(row)}
                title="Revisar validade e metadados"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleArchive(row)}
                disabled={isPending}
                title="Arquivar certidão"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs Reais do Motor de Alertas de Vencimento */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase">
              Certidões Monitoradas
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {alertsDashboard.summary.totalTrackedCertificates}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">Com controle de validade ativo</p>
          </CardContent>
        </Card>

        <Card
          className={alertsDashboard.summary.expiredCount > 0 ? 'border-red-300 bg-red-50/30' : ''}
        >
          <CardContent className="p-4">
            <p className="text-[11px] font-medium text-red-700 uppercase">Certidões Vencidas</p>
            <p className="mt-1 text-2xl font-semibold text-red-700">
              {alertsDashboard.summary.expiredCount}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-600">Exigem renovação imediata</p>
          </CardContent>
        </Card>

        <Card
          className={
            alertsDashboard.summary.critical7DaysCount > 0 ? 'border-amber-300 bg-amber-50/30' : ''
          }
        >
          <CardContent className="p-4">
            <p className="text-[11px] font-medium text-amber-800 uppercase">
              Críticas (Até 7 Dias)
            </p>
            <p className="mt-1 text-2xl font-semibold text-amber-800">
              {alertsDashboard.summary.critical7DaysCount}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-600">Vencimento iminente</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase">
              Alerta Preventivo (30d)
            </p>
            <p className="text-brand-navy mt-1 text-2xl font-semibold">
              {alertsDashboard.summary.warning30DaysCount}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">Na janela de renovação</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium text-slate-500 uppercase">Regulares / Vigentes</p>
            <p className="text-brand-emerald mt-1 text-2xl font-semibold">
              {alertsDashboard.summary.validCount}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">Dentro do prazo legal</p>
          </CardContent>
        </Card>
      </div>

      {/* Painel do Motor de Alertas de Vencimento Ativos */}
      {alertsDashboard.alerts.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/25">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm text-slate-900">
                <BellRing className="h-4 w-4 text-amber-600" />
                Motor de Alertas de Vencimento ({alertsDashboard.alerts.length}{' '}
                {alertsDashboard.alerts.length === 1 ? 'alerta ativo' : 'alertas ativos'})
              </CardTitle>
              <Badge variant="warning">Monitoramento Contínuo de CNDs, FGTS e Licenças</Badge>
            </div>
            <CardDescription>
              Certidões e obrigações vencidas ou que atingiram os gatilhos preventivos de vencimento
              configurados na organização.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {alertsDashboard.alerts.slice(0, 6).map((alert) => (
                <div
                  key={`${alert.sourceType}-${alert.id}`}
                  className={`flex flex-col justify-between rounded-md border p-3 ${
                    alert.severity === 'expired'
                      ? 'border-red-200 bg-red-50/70'
                      : alert.severity === 'critical'
                        ? 'border-amber-300 bg-amber-50/80'
                        : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Badge
                        variant={
                          alert.severity === 'expired'
                            ? 'danger'
                            : alert.severity === 'critical'
                              ? 'warning'
                              : 'default'
                        }
                      >
                        {formatRemainingDaysBadge(alert.daysRemaining)}
                      </Badge>
                      <span className="font-mono text-[11px] font-semibold text-slate-700">
                        {formatDateBr(alert.dueDate)}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-900">{alert.title}</p>
                    <p className="text-[11px] text-slate-600">{alert.subtitle}</p>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between border-t border-slate-200/70 pt-2 text-[11px] text-slate-600">
                    <span className="truncate">
                      {alert.companyLegalName ?? alert.clientName ?? 'Organização'}
                    </span>
                    {alert.demandId && alert.demandCode ? (
                      <Link
                        href={`/${orgSlug}/demandas/${alert.demandId}`}
                        className="text-brand-navy font-mono font-semibold hover:underline"
                      >
                        {alert.demandCode}
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Feedback de operação */}
      {feedback ? (
        <div
          role="status"
          className={`flex items-center justify-between gap-2 rounded-md border px-4 py-3 text-xs font-medium ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline opacity-80 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      ) : null}

      {/* Barra de Filtros + Botão de Upload com IA Groq */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              <span className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
                Filtros de Certidões e Regularidade Fiscal
              </span>
              <Badge variant={groqConfigured ? 'emerald' : 'outline'}>
                <Sparkles className="mr-1 h-3 w-3" />
                {groqConfigured
                  ? `Extração IA Groq Ativa (${groqModel})`
                  : 'IA Groq em Modo Fallback Determinístico (configure GROQ_API_KEY no .env)'}
              </Badge>
            </div>

            {canWriteDocuments ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => setShowUploadPanel((prev) => !prev)}
              >
                <FileUp className="h-3.5 w-3.5" />
                {showUploadPanel ? 'Fechar Upload IA' : 'Enviar Certidão PDF (Extração IA Groq)'}
              </Button>
            ) : null}
          </div>

          <form onSubmit={handleApplyFilters} className="space-y-3">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
              <div className="relative">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar CND, órgão, CNPJ ou controle..."
                  className="pl-8"
                />
              </div>

              <select
                value={filterClientId}
                onChange={(e) => {
                  setFilterClientId(e.target.value);
                  setFilterCompanyId('');
                }}
                aria-label="Filtrar por cliente"
                className="focus-visible:ring-brand-navy h-9 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 focus-visible:ring-2 focus-visible:outline-hidden"
              >
                <option value="">Todos os clientes</option>
                {clients.map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.name}
                  </option>
                ))}
              </select>

              <select
                value={filterCompanyId}
                onChange={(e) => setFilterCompanyId(e.target.value)}
                aria-label="Filtrar por empresa"
                className="focus-visible:ring-brand-navy h-9 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 focus-visible:ring-2 focus-visible:outline-hidden"
              >
                <option value="">Todas as empresas (PJ)</option>
                {companies
                  .filter((c) => !filterClientId || c.clientId === filterClientId)
                  .map((comp) => (
                    <option key={comp.id} value={comp.id}>
                      {comp.legalName} ({formatCnpj(comp.cnpj)})
                    </option>
                  ))}
              </select>

              <select
                value={filterCertType}
                onChange={(e) => setFilterCertType(e.target.value)}
                aria-label="Filtrar por tipo de certidão"
                className="focus-visible:ring-brand-navy h-9 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 focus-visible:ring-2 focus-visible:outline-hidden"
              >
                <option value="">Todos os tipos de certidão</option>
                {CERTIFICATE_TYPES.map((code) => (
                  <option key={code} value={code}>
                    {CERTIFICATE_TYPE_LABELS[code]}
                  </option>
                ))}
              </select>

              <select
                value={filterValidity}
                onChange={(e) => setFilterValidity(e.target.value)}
                aria-label="Filtrar por status de validade"
                className="focus-visible:ring-brand-navy h-9 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 focus-visible:ring-2 focus-visible:outline-hidden"
              >
                <option value="">Todos os status de validade</option>
                <option value="expired">Vencidas</option>
                <option value="expiring_soon">Vencendo em breve (Alerta)</option>
                <option value="valid">Regulares / Vigentes</option>
                <option value="no_expiration">Sem vencimento</option>
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={handleClearFilters}>
                Limpar filtros
              </Button>
              <Button type="submit" variant="outline" size="sm">
                Aplicar filtros
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Painel de Upload de PDF e Extração Automática via IA Groq */}
      {showUploadPanel && canWriteDocuments ? (
        <Card className="border-brand-navy/30 shadow-xs">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="text-brand-emerald h-4 w-4" />
              Upload de Certidão PDF com Extração Automática de Validade (IA Groq)
            </CardTitle>
            <CardDescription>
              Selecione o PDF da certidão (CND Federal RFB/PGFN, CRF FGTS, CNDT Trabalhista,
              Estadual, Municipal, Junta Comercial ou AVCB). O sistema extrai automaticamente o
              órgão emissor, CNPJ, data de emissão, data de validade e código de controle, e vincula
              a empresa correspondente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Etapa 1: Seleção do PDF e Disparo da Extração IA */}
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/70 p-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="certificate-pdf-file"
                    className="block text-xs font-semibold text-slate-800"
                  >
                    1. Selecionar Arquivo PDF da Certidão
                  </label>
                  <input
                    ref={fileInputRef}
                    id="certificate-pdf-file"
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handleFileSelected}
                    className="block w-full text-xs text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-800"
                  />
                  <p className="text-[11px] text-slate-500">
                    Ao selecionar o PDF, a leitura e extração de validade iniciam automaticamente.
                  </p>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="certificate-pasted-text"
                    className="block text-xs font-semibold text-slate-800"
                  >
                    Ou cole o texto da certidão (opcional para PDFs digitalizados sem camada OCR):
                  </label>
                  <div className="flex gap-2">
                    <textarea
                      id="certificate-pasted-text"
                      value={pastedCertificateText}
                      onChange={(e) => setPastedCertificateText(e.target.value)}
                      rows={2}
                      placeholder="Ex.: CERTIFICADO DE REGULARIDADE DO FGTS - CRF ... CNPJ: 12.345.678/0001-90 ... Validade: 01/11/2026 a 30/11/2026"
                      className="focus-visible:ring-brand-navy flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus-visible:ring-2 focus-visible:outline-hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isAnalyzingAi}
                      onClick={() => triggerGroqExtraction(selectedFile, pastedCertificateText)}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {isAnalyzingAi ? 'Extraindo...' : 'Extrair com IA'}
                    </Button>
                  </div>
                </div>
              </div>

              {aiAnalysisResult ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xs border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[11px] text-emerald-950">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="emerald">
                      {aiAnalysisResult.extractionEngine === 'groq-llm'
                        ? `Groq LLM (${aiAnalysisResult.extractionModel})`
                        : 'Fallback Regex Determinístico'}
                    </Badge>
                    <span>
                      Confiança:{' '}
                      <strong className="uppercase">{aiAnalysisResult.confidence}</strong>
                    </span>
                    {aiAnalysisResult.cnpj ? (
                      <span className="font-mono">
                        CNPJ lido: {formatCnpj(aiAnalysisResult.cnpj)}
                      </span>
                    ) : null}
                    <span className="font-mono text-[10px] text-slate-500">
                      SHA-256: {aiAnalysisResult.sha256.slice(0, 16)}...
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Etapa 2: Formulário de Revisão e Vínculo Multi-Tenant */}
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2">
                  <FormField label="Título da Certidão / Documento" id="cert-title" required>
                    <Input
                      id="cert-title"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="Ex.: Certidão Conjunta Negativa de Débitos Federais (RFB/PGFN)"
                      required
                    />
                  </FormField>
                </div>

                <FormField label="Classificação da Certidão" id="cert-type" required>
                  <select
                    id="cert-type"
                    value={formCertType}
                    onChange={(e) => setFormCertType(e.target.value as CertificateTypeCode)}
                    className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                    required
                  >
                    {CERTIFICATE_TYPES.map((code) => (
                      <option key={code} value={code}>
                        {CERTIFICATE_TYPE_LABELS[code]}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Órgão Emissor" id="cert-authority">
                  <Input
                    id="cert-authority"
                    value={formIssuingAuthority}
                    onChange={(e) => setFormIssuingAuthority(e.target.value)}
                    placeholder="Ex.: Receita Federal do Brasil / PGFN"
                  />
                </FormField>

                <FormField label="Data de Emissão (Extraída)" id="cert-issue-date">
                  <Input
                    id="cert-issue-date"
                    type="date"
                    value={formIssueDate}
                    onChange={(e) => setFormIssueDate(e.target.value)}
                  />
                </FormField>

                <FormField
                  label="Data de Validade / Vencimento (Extraída)"
                  id="cert-expiration-date"
                  hint="Aciona automaticamente o motor de alertas de vencimento."
                >
                  <Input
                    id="cert-expiration-date"
                    type="date"
                    value={formExpirationDate}
                    onChange={(e) => setFormExpirationDate(e.target.value)}
                  />
                </FormField>

                <FormField label="Código de Controle / Autenticidade" id="cert-control-code">
                  <Input
                    id="cert-control-code"
                    value={formControlCode}
                    onChange={(e) => setFormControlCode(e.target.value)}
                    placeholder="Ex.: A1B2.C3D4.E5F6.9900"
                  />
                </FormField>

                <FormField
                  label="Gatilhos de Alerta Antes do Vencimento (dias)"
                  id="cert-alert-days"
                  hint="Dias separados por vírgula (padrão: 30, 15, 7)."
                >
                  <Input
                    id="cert-alert-days"
                    value={formAlertDays}
                    onChange={(e) => setFormAlertDays(e.target.value)}
                    placeholder="30, 15, 7"
                  />
                </FormField>

                <FormField label="Visibilidade no Portal do Cliente" id="cert-visibility">
                  <select
                    id="cert-visibility"
                    value={formVisibility}
                    onChange={(e) =>
                      setFormVisibility(e.target.value === 'shared' ? 'shared' : 'internal')
                    }
                    className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                  >
                    <option value="shared">Compartilhada com o Cliente no Portal</option>
                    <option value="internal">Restrita à Equipe Interna (Office)</option>
                  </select>
                </FormField>

                <FormField label="Cliente Vinculado" id="cert-client">
                  <select
                    id="cert-client"
                    value={formClientId}
                    onChange={(e) => {
                      setFormClientId(e.target.value);
                      setFormCompanyId('');
                      setFormDemandId('');
                    }}
                    className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                  >
                    <option value="">Selecione o cliente...</option>
                    {clients.map((cl) => (
                      <option key={cl.id} value={cl.id}>
                        {cl.name}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField
                  label="Empresa Contribuinte (PJ — FK Cliente)"
                  id="cert-company"
                  hint="Preenchida automaticamente quando o CNPJ consta no PDF."
                >
                  <select
                    id="cert-company"
                    value={formCompanyId}
                    onChange={(e) => setFormCompanyId(e.target.value)}
                    className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                  >
                    <option value="">Sem PJ específica</option>
                    {formCompanyOptions.map((comp) => (
                      <option key={comp.id} value={comp.id}>
                        {comp.legalName} ({formatCnpj(comp.cnpj)})
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField
                  label="Demanda / Ordem de Serviço Relacionada"
                  id="cert-demand"
                  hint="Opcional. Permite criar obrigação automática em deadlines."
                >
                  <select
                    id="cert-demand"
                    value={formDemandId}
                    onChange={(e) => setFormDemandId(e.target.value)}
                    className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-2xs focus-visible:ring-2 focus-visible:outline-hidden"
                  >
                    <option value="">Sem demanda específica</option>
                    {formDemandOptions.map((dem) => (
                      <option key={dem.id} value={dem.id}>
                        {dem.code} — {dem.title}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              {formDemandId && formExpirationDate ? (
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={formCreateDeadline}
                    onChange={(e) => setFormCreateDeadline(e.target.checked)}
                    className="rounded-xs border-slate-300"
                  />
                  <span>
                    Registrar também uma obrigação legal de renovação na tabela{' '}
                    <code className="font-mono text-[11px]">deadlines</code> da demanda selecionada
                    (Decisão A7)
                  </span>
                </label>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowUploadPanel(false)}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="default" disabled={isPending || isAnalyzingAi}>
                  <FileCheck2 className="h-3.5 w-3.5" />
                  {isPending ? 'Registrando certidão...' : 'Confirmar e Monitorar Validade'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Modal/Card de Edição de Certidão Existente */}
      {editingCert ? (
        <Card className="border-brand-navy/40 bg-slate-50/60">
          <CardHeader>
            <CardTitle className="text-sm">
              Revisar Validade e Metadados · {editingCert.title}
            </CardTitle>
            <CardDescription>
              Atualize a data de vencimento, código de controle ou gatilhos de alerta desta
              certidão.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField label="Título da Certidão" id="edit-cert-title" required>
                  <Input
                    id="edit-cert-title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    required
                  />
                </FormField>

                <FormField label="Tipo de Certidão" id="edit-cert-type" required>
                  <select
                    id="edit-cert-type"
                    value={editCertType}
                    onChange={(e) => setEditCertType(e.target.value as CertificateTypeCode)}
                    className="focus-visible:ring-brand-navy flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900"
                  >
                    {CERTIFICATE_TYPES.map((code) => (
                      <option key={code} value={code}>
                        {CERTIFICATE_TYPE_LABELS[code]}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Órgão Emissor" id="edit-cert-authority">
                  <Input
                    id="edit-cert-authority"
                    value={editIssuingAuthority}
                    onChange={(e) => setEditIssuingAuthority(e.target.value)}
                  />
                </FormField>

                <FormField label="Data de Emissão" id="edit-cert-issue">
                  <Input
                    id="edit-cert-issue"
                    type="date"
                    value={editIssueDate}
                    onChange={(e) => setEditIssueDate(e.target.value)}
                  />
                </FormField>

                <FormField label="Data de Validade" id="edit-cert-expiration">
                  <Input
                    id="edit-cert-expiration"
                    type="date"
                    value={editExpirationDate}
                    onChange={(e) => setEditExpirationDate(e.target.value)}
                  />
                </FormField>

                <FormField label="Código de Controle" id="edit-cert-code">
                  <Input
                    id="edit-cert-code"
                    value={editControlCode}
                    onChange={(e) => setEditControlCode(e.target.value)}
                  />
                </FormField>

                <FormField label="Alertas (dias antes)" id="edit-cert-alerts">
                  <Input
                    id="edit-cert-alerts"
                    value={editAlertDays}
                    onChange={(e) => setEditAlertDays(e.target.value)}
                  />
                </FormField>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditingCert(null)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="default" disabled={isPending}>
                  Salvar Alterações
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Tabela de Certidões e Documentos Regulatórios */}
      <section aria-labelledby="certificates-table-heading" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2
            id="certificates-table-heading"
            className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-600 uppercase"
          >
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            Repositório de Certidões e Controle de Validades
          </h2>
          <span className="font-mono text-[11px] text-slate-500">
            {certificates.length} {certificates.length === 1 ? 'certidão' : 'certidões'}
          </span>
        </div>

        <DataTable
          columns={columns}
          data={certificates}
          getRowKey={(row) => row.id}
          emptyMessage="Nenhuma certidão encontrada para os filtros selecionados. Utilize o botão 'Enviar Certidão PDF (Extração IA Groq)' para iniciar o monitoramento."
        />
      </section>
    </div>
  );
}
