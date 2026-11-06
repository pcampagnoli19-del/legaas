'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createOfficeAction } from '@/server/context/action';
import { createCompany, setCompanyStatus, updateCompany } from './service';

const entityStatusSchema = z.enum(['active', 'inactive']);

export const createCompanyAction = createOfficeAction({
  name: 'companies.create',
  permission: 'company.write',
  schema: z.object({
    orgSlug: z.string().min(1),
    clientId: z.string().uuid('Selecione o cliente vinculado.'),
    parentCompanyId: z.string().uuid().optional(),
    cnpj: z.string().trim().min(14, 'Informe o CNPJ com 14 dígitos.').max(20),
    legalName: z.string().trim().min(2, 'Informe a razão social da empresa.').max(200),
    tradeName: z.string().trim().max(160).optional(),
    stateRegistration: z.string().trim().max(40).optional(),
    municipalRegistration: z.string().trim().max(40).optional(),
    addressStreet: z.string().trim().max(160).optional(),
    addressNumber: z.string().trim().max(30).optional(),
    addressComplement: z.string().trim().max(80).optional(),
    addressDistrict: z.string().trim().max(80).optional(),
    addressCity: z.string().trim().max(80).optional(),
    addressState: z.string().trim().max(2).optional(),
    addressZipCode: z.string().trim().max(12).optional(),
  }),
  handler: async ({ ctx, input }) => {
    const created = await createCompany(ctx, {
      clientId: input.clientId,
      parentCompanyId: input.parentCompanyId,
      cnpj: input.cnpj,
      legalName: input.legalName,
      tradeName: input.tradeName,
      stateRegistration: input.stateRegistration,
      municipalRegistration: input.municipalRegistration,
      addressStreet: input.addressStreet,
      addressNumber: input.addressNumber,
      addressComplement: input.addressComplement,
      addressDistrict: input.addressDistrict,
      addressCity: input.addressCity,
      addressState: input.addressState,
      addressZipCode: input.addressZipCode,
    });

    revalidatePath(`/${ctx.orgSlug}/empresas`);
    revalidatePath(`/${ctx.orgSlug}/clientes`);
    return created;
  },
});

export const updateCompanyAction = createOfficeAction({
  name: 'companies.update',
  permission: 'company.write',
  schema: z.object({
    orgSlug: z.string().min(1),
    companyId: z.string().uuid('Empresa inválida.'),
    clientId: z.string().uuid('Selecione o cliente vinculado.'),
    parentCompanyId: z.string().uuid().optional(),
    cnpj: z.string().trim().min(14, 'Informe o CNPJ com 14 dígitos.').max(20),
    legalName: z.string().trim().min(2, 'Informe a razão social da empresa.').max(200),
    tradeName: z.string().trim().max(160).optional(),
    stateRegistration: z.string().trim().max(40).optional(),
    municipalRegistration: z.string().trim().max(40).optional(),
    addressStreet: z.string().trim().max(160).optional(),
    addressNumber: z.string().trim().max(30).optional(),
    addressComplement: z.string().trim().max(80).optional(),
    addressDistrict: z.string().trim().max(80).optional(),
    addressCity: z.string().trim().max(80).optional(),
    addressState: z.string().trim().max(2).optional(),
    addressZipCode: z.string().trim().max(12).optional(),
  }),
  handler: async ({ ctx, input }) => {
    const updated = await updateCompany(ctx, {
      companyId: input.companyId,
      clientId: input.clientId,
      parentCompanyId: input.parentCompanyId,
      cnpj: input.cnpj,
      legalName: input.legalName,
      tradeName: input.tradeName,
      stateRegistration: input.stateRegistration,
      municipalRegistration: input.municipalRegistration,
      addressStreet: input.addressStreet,
      addressNumber: input.addressNumber,
      addressComplement: input.addressComplement,
      addressDistrict: input.addressDistrict,
      addressCity: input.addressCity,
      addressState: input.addressState,
      addressZipCode: input.addressZipCode,
    });

    revalidatePath(`/${ctx.orgSlug}/empresas`);
    revalidatePath(`/${ctx.orgSlug}/clientes`);
    return updated;
  },
});

export const setCompanyStatusAction = createOfficeAction({
  name: 'companies.setStatus',
  permission: 'company.write',
  schema: z.object({
    orgSlug: z.string().min(1),
    companyId: z.string().uuid('Empresa inválida.'),
    status: entityStatusSchema,
  }),
  handler: async ({ ctx, input }) => {
    const updated = await setCompanyStatus(ctx, {
      companyId: input.companyId,
      status: input.status,
    });

    revalidatePath(`/${ctx.orgSlug}/empresas`);
    revalidatePath(`/${ctx.orgSlug}/clientes`);
    return updated;
  },
});
