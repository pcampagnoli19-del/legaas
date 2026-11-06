export const CERTIFICATE_TYPES = [
  'CND_RFB_PGFN',
  'CRF_FGTS',
  'CNDT_TST',
  'CND_ESTADUAL',
  'CND_MUNICIPAL',
  'CERTIDAO_SIMPLIFICADA_JUNTA',
  'AVCB_CLCB_BOMBEIROS',
  'ALVARA_FUNCIONAMENTO',
  'LICENCA_SANITARIA_AMBIENTAL',
  'OUTRA_CERTIDAO',
] as const;

export type CertificateTypeCode = (typeof CERTIFICATE_TYPES)[number];

export const CERTIFICATE_TYPE_LABELS: Record<CertificateTypeCode, string> = {
  CND_RFB_PGFN: 'CND / CPEND Federal (RFB e PGFN)',
  CRF_FGTS: 'CRF — Regularidade do FGTS (Caixa)',
  CNDT_TST: 'CNDT — Débitos Trabalhistas (TST)',
  CND_ESTADUAL: 'Certidão Negativa Estadual (SEFAZ / PGE)',
  CND_MUNICIPAL: 'Certidão de Tributos Municipais / ISS',
  CERTIDAO_SIMPLIFICADA_JUNTA: 'Certidão Simplificada / Inteiro Teor (Junta Comercial)',
  AVCB_CLCB_BOMBEIROS: 'AVCB / CLCB — Corpo de Bombeiros',
  ALVARA_FUNCIONAMENTO: 'Alvará de Localização e Funcionamento',
  LICENCA_SANITARIA_AMBIENTAL: 'Licença Sanitária / Ambiental',
  OUTRA_CERTIDAO: 'Outra Certidão / Documento Regulatório',
};

export interface ExtractedCertificateData {
  title: string;
  certificateType: CertificateTypeCode;
  issuingAuthority: string | null;
  cnpj: string | null;
  companyName: string | null;
  issueDate: string | null;
  expirationDate: string | null;
  controlCode: string | null;
  confidence: 'high' | 'medium' | 'low';
  extractionEngine: 'groq-llm' | 'deterministic-regex';
  extractionModel: string;
  rawTextExcerpt: string;
}
