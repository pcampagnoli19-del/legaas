import crypto from 'node:crypto';
import zlib from 'node:zlib';
import 'server-only';
import { z } from 'zod';
import { getServerEnv } from '@/env';
import { logger } from '@/server/logger';

export * from './types';
import {
  CERTIFICATE_TYPES,
  type CertificateTypeCode,
  type ExtractedCertificateData,
} from './types';

const groqExtractionResponseSchema = z.object({
  title: z.string().min(2).optional(),
  certificateType: z.enum(CERTIFICATE_TYPES).optional(),
  issuingAuthority: z.string().nullable().optional(),
  cnpj: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  issueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  expirationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  controlCode: z.string().nullable().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
});

/**
 * Decodifica sequências literais de string PDF `(texto)` e hexadecimais `<4142>`.
 */
function decodePdfStringLiterals(chunk: string): string {
  const parts: string[] = [];

  // Strings entre parênteses (...)
  const literalRegex = /\((?:\\.|[^\\()])*\)/g;
  for (const match of chunk.matchAll(literalRegex)) {
    const inner = match[0]
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
      .replace(/\\([0-7]{1,3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)));
    if (inner.trim()) {
      parts.push(inner);
    }
  }

  return parts.join(' ');
}

/**
 * Extrai texto legível de um buffer PDF (incluindo descompressão de streams FlateDecode
 * e leitura de blocos BT...ET e strings de conteúdo).
 */
export function extractTextFromPdfBuffer(buffer: Buffer): string {
  if (!buffer || buffer.length === 0) {
    return '';
  }

  const rawLatin1 = buffer.toString('latin1');
  const collectedChunks: string[] = [];

  // 1. Tenta descomprimir streams FlateDecode presentes no PDF
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  for (const match of rawLatin1.matchAll(streamRegex)) {
    const streamBody = match[1];
    if (!streamBody || streamBody.length > 2_000_000) continue;
    const streamBytes = Buffer.from(streamBody, 'latin1');
    try {
      const inflated = zlib.inflateSync(streamBytes).toString('latin1');
      const decoded = decodePdfStringLiterals(inflated);
      if (decoded.trim()) {
        collectedChunks.push(decoded);
      } else {
        const printable = inflated.replace(/[^\x20-\x7EÀ-ÿ\n]/g, ' ');
        if (printable.trim()) {
          collectedChunks.push(printable);
        }
      }
    } catch {
      // Stream não comprimido com Flate padrão ou com parâmetros próprios; extrai literais diretos
      const decoded = decodePdfStringLiterals(streamBody);
      if (decoded.trim()) {
        collectedChunks.push(decoded);
      }
    }
  }

  // 2. Extrai literais de texto diretamente do corpo do PDF
  const directDecoded = decodePdfStringLiterals(rawLatin1);
  if (directDecoded.trim()) {
    collectedChunks.push(directDecoded);
  }

  // 3. Caso o arquivo seja texto/UTF-8 ou possua metadados em texto claro
  const utf8Printable = buffer
    .toString('utf8')
    .replace(/[^\x20-\x7EÀ-ÿ\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (utf8Printable.length > 0) {
    collectedChunks.push(utf8Printable);
  }

  const combined = collectedChunks.join('\n').replace(/\s+/g, ' ').trim();

  return combined.slice(0, 18_000);
}

const MONTH_NAME_MAP: Record<string, string> = {
  janeiro: '01',
  fevereiro: '02',
  marco: '03',
  março: '03',
  abril: '04',
  maio: '05',
  junho: '06',
  julho: '07',
  agosto: '08',
  setembro: '09',
  outubro: '10',
  novembro: '11',
  dezembro: '12',
};

function parseBrazilianDateToIso(rawDate: string): string | null {
  const trimmed = rawDate.trim();

  // Formato DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY
  const dmyMatch = trimmed.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})$/);
  if (dmyMatch) {
    const [, dd, mm, yyyy] = dmyMatch;
    const month = Number(mm);
    const day = Number(dd);
    const year = Number(yyyy);
    if (year >= 1990 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  // Formato ISO YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }

  // Formato por extenso: "15 de dezembro de 2026"
  const extMatch = trimmed.toLowerCase().match(/(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/);
  if (extMatch) {
    const day = extMatch[1]!.padStart(2, '0');
    const monthName = extMatch[2]!;
    const year = extMatch[3]!;
    const mm = MONTH_NAME_MAP[monthName];
    if (mm) {
      return `${year}-${mm}-${day}`;
    }
  }

  return null;
}

/**
 * Motor determinístico de extração de metadados de certidões brasileiras (Regex).
 * Usado como base e fallback confiável quando `GROQ_API_KEY` não estiver configurada
 * ou para complementar campos ausentes.
 */
export function extractCertificateMetadataDeterministic(
  text: string,
  originalFileName: string,
): ExtractedCertificateData {
  const combinedSource = `${originalFileName}\n${text}`;
  const lower = combinedSource.toLowerCase();

  let certificateType: CertificateTypeCode = 'OUTRA_CERTIDAO';
  let issuingAuthority: string | null = null;
  let suggestedTitle = originalFileName
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  if (
    lower.includes('fgts') ||
    lower.includes('regularidade do fgts') ||
    lower.includes('caixa economica') ||
    lower.includes('caixa econômica') ||
    lower.includes('crf')
  ) {
    certificateType = 'CRF_FGTS';
    issuingAuthority = 'Caixa Econômica Federal (FGTS)';
    suggestedTitle = 'Certificado de Regularidade do FGTS — CRF';
  } else if (
    lower.includes('trabalhista') ||
    lower.includes('cndt') ||
    lower.includes('justiça do trabalho') ||
    lower.includes('justica do trabalho') ||
    lower.includes('tribunal superior do trabalho')
  ) {
    certificateType = 'CNDT_TST';
    issuingAuthority = 'Poder Judiciário — Justiça do Trabalho (TST)';
    suggestedTitle = 'Certidão Negativa de Débitos Trabalhistas — CNDT';
  } else if (
    lower.includes('receita federal') ||
    lower.includes('pgfn') ||
    lower.includes('tributos federais') ||
    lower.includes('dívida ativa da união') ||
    lower.includes('divida ativa da uniao') ||
    lower.includes('rfb')
  ) {
    certificateType = 'CND_RFB_PGFN';
    issuingAuthority = 'Secretaria da Receita Federal do Brasil / PGFN';
    suggestedTitle = 'Certidão Conjunta de Débitos Relativos a Tributos Federais e Dívida Ativa';
  } else if (
    lower.includes('bombeiro') ||
    lower.includes('avcb') ||
    lower.includes('clcb') ||
    lower.includes('vistoria do corpo de bombeiros')
  ) {
    certificateType = 'AVCB_CLCB_BOMBEIROS';
    issuingAuthority = 'Corpo de Bombeiros Militar';
    suggestedTitle = 'Auto de Vistoria do Corpo de Bombeiros (AVCB / CLCB)';
  } else if (
    lower.includes('junta comercial') ||
    lower.includes('jucesp') ||
    lower.includes('jucerja') ||
    lower.includes('jucemg') ||
    lower.includes('certidão simplificada') ||
    lower.includes('certidao simplificada')
  ) {
    certificateType = 'CERTIDAO_SIMPLIFICADA_JUNTA';
    issuingAuthority = 'Junta Comercial Estadual';
    suggestedTitle = 'Certidão Simplificada da Junta Comercial';
  } else if (
    lower.includes('alvará') ||
    lower.includes('alvara') ||
    lower.includes('licença de funcionamento') ||
    lower.includes('licenca de funcionamento')
  ) {
    certificateType = 'ALVARA_FUNCIONAMENTO';
    issuingAuthority = 'Prefeitura Municipal';
    suggestedTitle = 'Alvará de Localização e Funcionamento';
  } else if (
    lower.includes('vigilância sanitária') ||
    lower.includes('vigilancia sanitaria') ||
    lower.includes('cetesb') ||
    lower.includes('licença ambiental') ||
    lower.includes('licenca ambiental') ||
    lower.includes('anvisa')
  ) {
    certificateType = 'LICENCA_SANITARIA_AMBIENTAL';
    issuingAuthority = 'Órgão de Vigilância Sanitária / Meio Ambiente';
    suggestedTitle = 'Licença Sanitária / Ambiental de Operação';
  } else if (
    lower.includes('sefaz') ||
    lower.includes('icms') ||
    lower.includes('fazenda estadual') ||
    lower.includes('procuradoria geral do estado') ||
    lower.includes('cnd estadual')
  ) {
    certificateType = 'CND_ESTADUAL';
    issuingAuthority = 'Secretaria da Fazenda Estadual (SEFAZ / PGE)';
    suggestedTitle = 'Certidão Negativa de Débitos Estaduais';
  } else if (
    lower.includes('prefeitura') ||
    lower.includes('tributos mobiliários') ||
    lower.includes('tributos mobiliarios') ||
    lower.includes('issqn') ||
    lower.includes('cnd municipal') ||
    lower.includes('tributos municipais')
  ) {
    certificateType = 'CND_MUNICIPAL';
    issuingAuthority = 'Secretaria Municipal de Finanças';
    suggestedTitle = 'Certidão Negativa de Tributos Municipais';
  }

  // Extração de CNPJ
  let cnpj: string | null = null;
  const cnpjFormattedMatch = combinedSource.match(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/);
  if (cnpjFormattedMatch) {
    cnpj = cnpjFormattedMatch[1]!.replace(/\D/g, '');
  } else {
    const cnpjRawMatch = combinedSource.match(/(?:cnpj|inscri[çc][ãa]o)[:\s]*(\d{14})\b/i);
    if (cnpjRawMatch) {
      cnpj = cnpjRawMatch[1]!;
    }
  }

  // Extração de Datas contextualizadas (Validade / Vencimento vs Emissão / Expedição)
  let expirationDate: string | null = null;
  let issueDate: string | null = null;

  // Padrão de intervalo "Validade: 01/11/2026 a 30/11/2026" (muito comum no CRF FGTS)
  const rangeMatch = combinedSource.match(
    /validade\s*[:\s]*(\d{2}[/.-]\d{2}[/.-]\d{4})\s*(?:a|até|ate|-)\s*(\d{2}[/.-]\d{2}[/.-]\d{4})/i,
  );
  if (rangeMatch) {
    issueDate = parseBrazilianDateToIso(rangeMatch[1]!);
    expirationDate = parseBrazilianDateToIso(rangeMatch[2]!);
  }

  if (!expirationDate) {
    const expPatterns = [
      /(?:v[áa]lid[ao]\s+at[ée]|validade\s*[:\s]*at[ée]?|vencimento\s*[:\s]*|expira\s+em\s*[:\s]*|data\s+de\s+validade\s*[:\s]*|validade\s*[:\s]*)[^\d]{0,20}(\d{2}[/.-]\d{2}[/.-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+de\s+[a-zç]+\s+de\s+\d{4})/i,
    ];
    for (const pattern of expPatterns) {
      const m = combinedSource.match(pattern);
      if (m?.[1]) {
        const parsed = parseBrazilianDateToIso(m[1]);
        if (parsed) {
          expirationDate = parsed;
          break;
        }
      }
    }
  }

  if (!issueDate) {
    const issuePatterns = [
      /(?:emitid[ao]\s+em|emiss[ãa]o\s*[:\s]*|expedi[çc][ãa]o\s*[:\s]*|data\s+da\s+emiss[ãa]o\s*[:\s]*)[^\d]{0,20}(\d{2}[/.-]\d{2}[/.-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+de\s+[a-zç]+\s+de\s+\d{4})/i,
    ];
    for (const pattern of issuePatterns) {
      const m = combinedSource.match(pattern);
      if (m?.[1]) {
        const parsed = parseBrazilianDateToIso(m[1]);
        if (parsed) {
          issueDate = parsed;
          break;
        }
      }
    }
  }

  // Caso não tenha rótulo explícito mas haja datas DD/MM/YYYY no documento, ordena cronologicamente
  if (!expirationDate) {
    const allDates = Array.from(
      combinedSource.matchAll(/\b(\d{2}[/.-]\d{2}[/.-]\d{4}|\d{4}-\d{2}-\d{2})\b/g),
    )
      .map((m) => parseBrazilianDateToIso(m[1]!))
      .filter((d): d is string => Boolean(d))
      .sort();

    if (allDates.length >= 2) {
      issueDate = issueDate ?? allDates[0]!;
      expirationDate = allDates[allDates.length - 1]!;
    } else if (allDates.length === 1) {
      expirationDate = allDates[0]!;
    }
  }

  // Código de controle / autenticidade
  let controlCode: string | null = null;
  const codePatterns = [
    /(?:c[óo]digo\s+de\s+controle(?:\s+da\s+certid[ãa]o)?|c[óo]digo\s+de\s+autenticidade|c[óo]digo\s+verificador)[:\s]*([A-Z0-9./-]{6,32})/i,
    /(?:autenticidade|chave\s+de\s+autentica[çc][ãa]o)[:\s]*([A-Z0-9./-]{6,32})/i,
    /(?:certid[ãa]o\s+n[º°o.]+|n[úu]mero\s+da\s+certid[ãa]o)[:\s]*([A-Z0-9./-]{6,32})/i,
  ];
  for (const pattern of codePatterns) {
    const match = combinedSource.match(pattern);
    if (match?.[1]) {
      controlCode = match[1].trim();
      break;
    }
  }

  const confidence: 'high' | 'medium' | 'low' =
    expirationDate && certificateType !== 'OUTRA_CERTIDAO'
      ? 'high'
      : expirationDate || certificateType !== 'OUTRA_CERTIDAO'
        ? 'medium'
        : 'low';

  return {
    title: suggestedTitle || 'Certidão / Documento Regulatório',
    certificateType,
    issuingAuthority,
    cnpj,
    companyName: null,
    issueDate,
    expirationDate,
    controlCode,
    confidence,
    extractionEngine: 'deterministic-regex',
    extractionModel: 'regex-ptbr-v1',
    rawTextExcerpt: text.slice(0, 600),
  };
}

/**
 * Analisa o PDF de uma Certidão via API da Groq (`https://api.groq.com/openai/v1/chat/completions`)
 * com `response_format: { type: 'json_object' }`.
 * Caso `GROQ_API_KEY` não esteja configurada no ambiente ou a chamada externa falhe,
 * utiliza o motor determinístico como fallback seguro.
 */
export async function analyzeCertificatePdfWithGroq(params: {
  pdfBuffer: Buffer;
  originalFileName: string;
  extractedTextOverride?: string;
}): Promise<ExtractedCertificateData> {
  const extractedText =
    params.extractedTextOverride !== undefined
      ? params.extractedTextOverride
      : extractTextFromPdfBuffer(params.pdfBuffer);

  const deterministicBaseline = extractCertificateMetadataDeterministic(
    extractedText,
    params.originalFileName,
  );

  let apiKey: string | undefined = process.env.GROQ_API_KEY?.trim();
  let model: string = process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile';

  if (!apiKey) {
    try {
      const env = getServerEnv();
      apiKey = env.GROQ_API_KEY?.trim();
      model = env.GROQ_MODEL || model;
    } catch {
      // Ignora falhas de parseamento do ambiente completo em testes isolados
    }
  }

  if (!apiKey) {
    return deterministicBaseline;
  }

  const systemPrompt = [
    'Você é um especialista jurídico e paralegal brasileiro encarregado de extrair metadados estruturados de Certidões Negativas de Débitos (CND, CPEND, CRF FGTS, CNDT, SEFAZ, Prefeitura, Junta Comercial, AVCB/CLCB e Licenças).',
    'Responda EXCLUSIVAMENTE com um objeto JSON válido seguindo exatamente estas chaves:',
    '{',
    '  "title": "Título formal e claro da certidão em português",',
    `  "certificateType": "Um dos valores: ${CERTIFICATE_TYPES.join(' | ')}",`,
    '  "issuingAuthority": "Nome do órgão emissor (ex: Receita Federal do Brasil / PGFN, Caixa Econômica Federal, TST, SEFAZ-SP, Prefeitura) ou null",',
    '  "cnpj": "Apenas os 14 dígitos numéricos do CNPJ do contribuinte ou null",',
    '  "companyName": "Razão social do contribuinte identificada na certidão ou null",',
    '  "issueDate": "Data de emissão/expedição no formato YYYY-MM-DD ou null",',
    '  "expirationDate": "Data de validade/vencimento no formato YYYY-MM-DD ou null",',
    '  "controlCode": "Código de controle/autenticidade/número da certidão ou null",',
    '  "confidence": "high | medium | low"',
    '}',
    'Atenção especial: converta qualquer data brasileira (DD/MM/YYYY ou por extenso, ex: 15 de dezembro de 2026) para o formato ISO YYYY-MM-DD.',
  ].join('\n');

  const userPrompt = [
    `Nome do arquivo enviado: ${params.originalFileName}`,
    'Texto extraído do PDF:',
    extractedText || '(Nenhum texto embutido extraído; infira a partir do nome do arquivo)',
  ].join('\n\n');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn(
        { status: response.status, model },
        'Groq API retornou status não-OK na extração de certidão; utilizando fallback determinístico.',
      );
      return deterministicBaseline;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return deterministicBaseline;
    }

    const parsedJson = JSON.parse(content) as unknown;
    const validated = groqExtractionResponseSchema.safeParse(parsedJson);
    if (!validated.success) {
      logger.warn(
        { issues: validated.error.issues },
        'Resposta JSON da Groq fora do schema esperado; utilizando fallback determinístico.',
      );
      return deterministicBaseline;
    }

    const groqData = validated.data;
    const cleanedCnpj = groqData.cnpj ? groqData.cnpj.replace(/\D/g, '') : null;

    return {
      title: groqData.title?.trim() || deterministicBaseline.title,
      certificateType: groqData.certificateType ?? deterministicBaseline.certificateType,
      issuingAuthority: groqData.issuingAuthority ?? deterministicBaseline.issuingAuthority,
      cnpj: cleanedCnpj && cleanedCnpj.length === 14 ? cleanedCnpj : deterministicBaseline.cnpj,
      companyName: groqData.companyName ?? deterministicBaseline.companyName,
      issueDate: groqData.issueDate ?? deterministicBaseline.issueDate,
      expirationDate: groqData.expirationDate ?? deterministicBaseline.expirationDate,
      controlCode: groqData.controlCode ?? deterministicBaseline.controlCode,
      confidence: groqData.confidence ?? 'high',
      extractionEngine: 'groq-llm',
      extractionModel: model,
      rawTextExcerpt: extractedText.slice(0, 600),
    };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Falha ao consultar API da Groq; utilizando extração determinística de fallback.',
    );
    return deterministicBaseline;
  }
}

/**
 * Calcula o hash SHA-256 hexadecimal de um buffer de arquivo para auditoria de integridade documental.
 */
export function computeBufferSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
