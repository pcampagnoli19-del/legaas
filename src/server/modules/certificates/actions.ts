'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentSessionFromCookies } from '@/server/auth/session';
import { assertPermission } from '@/server/authz/permissions';
import { type ActionResult, runAction } from '@/server/context/action';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import { UnauthorizedError, ValidationError } from '@/server/errors/app-error';
import { listOrganizationCompanies } from '@/server/modules/companies/service';
import {
  analyzeCertificatePdfWithGroq,
  type CertificateTypeCode,
  computeBufferSha256,
  type ExtractedCertificateData,
} from './groq-extractor';
import {
  archiveCertificateDocument,
  type CertificateValidityStatus,
  registerCertificateDocument,
  updateCertificateDocument,
} from './service';

async function requireOfficeContext(orgSlug: string) {
  const session = await getCurrentSessionFromCookies();
  if (!session) {
    throw new UnauthorizedError('Sessão expirada ou não autenticada.');
  }

  return resolveOfficeTenantContext({
    userId: session.userId,
    orgSlug,
  });
}

export interface AnalyzeCertificatePdfActionResult extends ExtractedCertificateData {
  sha256: string;
  sizeBytes: number;
  matchedCompanyId: string | null;
  matchedClientId: string | null;
  matchedCompanyLegalName: string | null;
}

/**
 * Server Action que recebe o `FormData` com o arquivo PDF (e texto extraído opcional),
 * executa a extração estruturada via API da Groq (`llama-3.3-70b-versatile`) com fallback
 * determinístico e cruza automaticamente o CNPJ extraído com as Empresas (`companies`)
 * cadastradas na organização do usuário.
 */
export async function analyzeCertificatePdfAction(
  formData: FormData,
): Promise<ActionResult<AnalyzeCertificatePdfActionResult>> {
  return runAction('certificates.analyzePdf', async () => {
    const orgSlug = String(formData.get('orgSlug') ?? '').trim();
    if (!orgSlug) {
      throw new ValidationError('Organização não informada.');
    }

    const ctx = await requireOfficeContext(orgSlug);
    assertPermission(ctx, 'document.write');

    const fileEntry = formData.get('file');
    const pastedText = String(formData.get('pastedText') ?? '').trim();

    let buffer: Buffer;
    let originalFileName = 'certidao.pdf';

    if (fileEntry && typeof fileEntry === 'object' && 'arrayBuffer' in fileEntry) {
      const arrayBuf = await (fileEntry as File).arrayBuffer();
      buffer = Buffer.from(arrayBuf);
      originalFileName = (fileEntry as File).name || 'certidao.pdf';
    } else if (pastedText) {
      buffer = Buffer.from(pastedText, 'utf8');
      originalFileName = 'certidao-texto.pdf';
    } else {
      throw new ValidationError('Selecione um arquivo PDF de certidão para análise.');
    }

    if (buffer.byteLength > 15 * 1024 * 1024) {
      throw new ValidationError('O arquivo excede o tamanho máximo permitido de 15 MB.');
    }

    const extracted = await analyzeCertificatePdfWithGroq({
      pdfBuffer: buffer,
      originalFileName,
      extractedTextOverride: pastedText ? pastedText : undefined,
    });

    // Se um CNPJ de 14 dígitos foi identificado na certidão, busca automaticamente a Empresa correspondente no tenant
    let matchedCompanyId: string | null = null;
    let matchedClientId: string | null = null;
    let matchedCompanyLegalName: string | null = null;

    if (extracted.cnpj) {
      const orgCompanies = await listOrganizationCompanies(ctx, { status: 'active' });
      const found = orgCompanies.find((c) => c.cnpj === extracted.cnpj);
      if (found) {
        matchedCompanyId = found.id;
        matchedClientId = found.clientId;
        matchedCompanyLegalName = found.legalName;
      }
    }

    return {
      ...extracted,
      sha256: computeBufferSha256(buffer),
      sizeBytes: buffer.byteLength,
      matchedCompanyId,
      matchedClientId,
      matchedCompanyLegalName,
    };
  });
}

/**
 * Server Action que realiza o upload completo e registro da Certidão (com metadados revisados
 * pelo usuário ou extraídos pela IA Groq) e revalida o Painel e a tela de Certidões.
 */
export async function uploadAndRegisterCertificateAction(
  formData: FormData,
): Promise<
  ActionResult<{
    id: string;
    title: string;
    certificateType: CertificateTypeCode;
    expirationDate: string | null;
    validityStatus: CertificateValidityStatus;
    daysUntilExpiration: number | null;
    linkedDeadlineId: string | null;
  }>
> {
  return runAction('certificates.uploadAndRegister', async () => {
    const orgSlug = String(formData.get('orgSlug') ?? '').trim();
    if (!orgSlug) {
      throw new ValidationError('Organização não informada.');
    }

    const ctx = await requireOfficeContext(orgSlug);

    const fileEntry = formData.get('file');
    let fileBuffer: Buffer | undefined;
    let originalName = String(formData.get('originalName') ?? '').trim() || 'certidao.pdf';
    let mimeType = 'application/pdf';

    if (fileEntry && typeof fileEntry === 'object' && 'arrayBuffer' in fileEntry) {
      const f = fileEntry as File;
      if (f.size > 0) {
        const arrayBuf = await f.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuf);
        originalName = f.name || originalName;
        mimeType = f.type || 'application/pdf';
      }
    }

    const title = String(formData.get('title') ?? '').trim();
    const certificateType = String(
      formData.get('certificateType') ?? 'OUTRA_CERTIDAO',
    ) as CertificateTypeCode;
    const issuingAuthority = String(formData.get('issuingAuthority') ?? '').trim() || null;
    const issueDate = String(formData.get('issueDate') ?? '').trim() || null;
    const expirationDate = String(formData.get('expirationDate') ?? '').trim() || null;
    const controlCode = String(formData.get('controlCode') ?? '').trim() || null;
    const clientId = String(formData.get('clientId') ?? '').trim() || null;
    const companyId = String(formData.get('companyId') ?? '').trim() || null;
    const demandId = String(formData.get('demandId') ?? '').trim() || null;
    const visibilityRaw = String(formData.get('visibility') ?? 'internal');
    const visibility = visibilityRaw === 'shared' ? 'shared' : 'internal';
    const createLinkedDeadline = formData.get('createLinkedDeadline') !== 'false';

    const alertDaysRaw = String(formData.get('alertDaysBefore') ?? '30,15,7');
    const alertDaysBefore = alertDaysRaw
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 365);

    const extractionEngine = String(formData.get('extractionEngine') ?? '').trim();
    const extractionModel = String(formData.get('extractionModel') ?? '').trim();
    const extractedCnpj = String(formData.get('extractedCnpj') ?? '').trim();

    const created = await registerCertificateDocument(ctx, {
      title,
      certificateType,
      issuingAuthority,
      issueDate,
      expirationDate,
      alertDaysBefore: alertDaysBefore.length > 0 ? alertDaysBefore : [30, 15, 7],
      controlCode,
      visibility,
      clientId,
      companyId,
      demandId,
      originalName,
      mimeType,
      fileBuffer,
      createLinkedDeadline,
      extractedMetadata: {
        extractionEngine: extractionEngine || 'manual',
        extractionModel: extractionModel || null,
        extractedCnpj: extractedCnpj || null,
      },
    });

    revalidatePath(`/${ctx.orgSlug}`);
    revalidatePath(`/${ctx.orgSlug}/certidoes`);
    if (demandId) {
      revalidatePath(`/${ctx.orgSlug}/demandas/${demandId}`);
    }

    return created;
  });
}

export async function updateCertificateAction(input: {
  orgSlug: string;
  documentId: string;
  title: string;
  certificateType: CertificateTypeCode;
  issuingAuthority?: string | null;
  issueDate?: string | null;
  expirationDate?: string | null;
  alertDaysBefore?: number[];
  controlCode?: string | null;
  visibility?: 'internal' | 'shared';
}): Promise<
  ActionResult<{
    id: string;
    title: string;
    expirationDate: string | null;
    validityStatus: CertificateValidityStatus;
  }>
> {
  return runAction('certificates.update', async () => {
    const ctx = await requireOfficeContext(input.orgSlug);
    const updated = await updateCertificateDocument(ctx, {
      documentId: input.documentId,
      title: input.title,
      certificateType: input.certificateType,
      issuingAuthority: input.issuingAuthority,
      issueDate: input.issueDate,
      expirationDate: input.expirationDate,
      alertDaysBefore: input.alertDaysBefore,
      controlCode: input.controlCode,
      visibility: input.visibility,
    });

    revalidatePath(`/${ctx.orgSlug}`);
    revalidatePath(`/${ctx.orgSlug}/certidoes`);
    return updated;
  });
}

export async function archiveCertificateAction(input: {
  orgSlug: string;
  documentId: string;
}): Promise<ActionResult<{ id: string }>> {
  return runAction('certificates.archive', async () => {
    const ctx = await requireOfficeContext(input.orgSlug);
    const archived = await archiveCertificateDocument(ctx, input.documentId);
    revalidatePath(`/${ctx.orgSlug}`);
    revalidatePath(`/${ctx.orgSlug}/certidoes`);
    return archived;
  });
}
