import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import 'server-only';

const STORAGE_ROOT_DIR = path.resolve(process.cwd(), '.storage-data', 'documents');

function sanitizeFileName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
}

/**
 * Gera uma `storageKey` única e isolada por `organizationId` (prevenindo colisão ou path traversal).
 */
export function buildTenantStorageKey(organizationId: string, originalName: string): string {
  const safeOrg = organizationId.replace(/[^a-fA-F0-9-]/g, '');
  const safeName = sanitizeFileName(originalName || 'certidao.pdf') || 'certidao.pdf';
  const uniqueId = crypto.randomUUID();
  return `org/${safeOrg}/certificates/${uniqueId}-${safeName}`;
}

function resolveSafeFilePath(storageKey: string): string {
  const normalizedKey = storageKey.replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(STORAGE_ROOT_DIR, normalizedKey);
  if (!resolved.startsWith(STORAGE_ROOT_DIR)) {
    throw new Error('VIOLAÇÃO DE SEGURANÇA: storageKey inválido fora do diretório permitido.');
  }
  return resolved;
}

/**
 * Persiste o buffer binário do documento no repositório privado isolado por tenant.
 */
export async function persistDocumentBuffer(
  storageKey: string,
  buffer: Buffer,
): Promise<{ filePath: string }> {
  const filePath = resolveSafeFilePath(storageKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
  return { filePath };
}

/**
 * Lê o buffer binário de um documento armazenado para download autenticado.
 */
export async function readDocumentBuffer(storageKey: string): Promise<Buffer | null> {
  try {
    const filePath = resolveSafeFilePath(storageKey);
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}
