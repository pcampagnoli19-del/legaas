import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCurrentSessionFromCookies } from '@/server/auth/session';
import { assertPermission } from '@/server/authz/permissions';
import { resolveOfficeTenantContext } from '@/server/context/tenant-context';
import { getAppDb } from '@/server/db/client';
import { documents } from '@/server/db/schema';
import { withTenant } from '@/server/db/tenant';
import { readDocumentBuffer } from '@/server/modules/certificates/storage';

export async function GET(
  _request: Request,
  context: { params: Promise<{ orgSlug: string; documentId: string }> },
) {
  const { orgSlug, documentId } = await context.params;

  const session = await getCurrentSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  let tenantCtx;
  try {
    tenantCtx = await resolveOfficeTenantContext({
      userId: session.userId,
      orgSlug,
    });
    assertPermission(tenantCtx, 'document.read');
  } catch {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  const db = await getAppDb();
  const doc = await withTenant(
    db,
    {
      organizationId: tenantCtx.organizationId,
      userId: tenantCtx.userId,
      membershipId: tenantCtx.membershipId,
    },
    async (tx) => {
      const [row] = await tx
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.organizationId, tenantCtx.organizationId),
            eq(documents.id, documentId),
            isNull(documents.archivedAt),
          ),
        )
        .limit(1);
      return row ?? null;
    },
  );

  if (!doc) {
    return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });
  }

  const storedBuffer = await readDocumentBuffer(doc.storageKey);
  if (!storedBuffer) {
    return NextResponse.json(
      {
        error:
          'Arquivo binário não disponível no storage local (registro criado via metadados/seed).',
      },
      { status: 404 },
    );
  }

  const safeName = doc.originalName.replace(/[^a-zA-Z0-9._-]+/g, '_');

  return new NextResponse(new Uint8Array(storedBuffer), {
    status: 200,
    headers: {
      'Content-Type': doc.mimeType || 'application/pdf',
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
