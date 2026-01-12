import { z } from 'zod';
import { isValidCPF } from './cpfValidator';

// Common validation patterns for Brazilian data
const PHONE_REGEX = /^(\(\d{2}\)\s?)?\d{4,5}-?\d{4}$/;
const CNPJ_REGEX = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/;
const UF_VALUES = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const;

// Validate CNPJ format (basic format validation, not mathematical check)
export const validateCNPJ = (cnpj: string): boolean => {
  if (!cnpj) return true;
  const cleaned = cnpj.replace(/\D/g, '');
  return cleaned.length === 14;
};

// Client schema - matching the existing validation in NewClientDialog
export const clientSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome muito longo'),
  email: z.string().trim().email('Email inválido').max(255, 'Email muito longo').or(z.literal('')),
  phone: z.string().trim().min(10, 'Telefone deve ter pelo menos 10 dígitos').max(20, 'Telefone muito longo'),
  cpf: z.string().trim().optional().refine((val) => {
    if (!val || val === '') return true;
    return isValidCPF(val);
  }, 'CPF inválido'),
  birthdate: z.string().optional(),
  notes: z.string().trim().max(500, 'Observações muito longas').optional(),
  is_active: z.boolean().default(true),
  referral_source: z.string().optional(),
  assigned_professional_id: z.string().optional(),
});

// Supplier schema
export const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório').max(255, 'Nome muito longo'),
  company_name: z.string().trim().max(255, 'Razão social muito longa').optional().nullable(),
  cnpj: z.string().trim().optional().nullable().refine((val) => {
    if (!val || val === '') return true;
    return validateCNPJ(val);
  }, 'CNPJ inválido (deve ter 14 dígitos)'),
  uf: z.string().trim().max(2, 'UF deve ter 2 caracteres').optional().nullable().refine((val) => {
    if (!val || val === '') return true;
    return UF_VALUES.includes(val.toUpperCase() as typeof UF_VALUES[number]);
  }, 'UF inválida'),
  state_registration: z.string().trim().max(50, 'Inscrição estadual muito longa').optional().nullable(),
  municipal_registration: z.string().trim().max(50, 'Inscrição municipal muito longa').optional().nullable(),
  contact_name: z.string().trim().max(100, 'Nome do contato muito longo').optional().nullable(),
  email: z.string().trim().email('Email inválido').max(255, 'Email muito longo').optional().nullable().or(z.literal('')),
  phone: z.string().trim().max(20, 'Telefone muito longo').optional().nullable(),
  address: z.string().trim().max(500, 'Endereço muito longo').optional().nullable(),
  notes: z.string().trim().max(1000, 'Observações muito longas').optional().nullable(),
  is_active: z.boolean().default(true),
});

export type ClientFormData = z.infer<typeof clientSchema>;
export type SupplierFormData = z.infer<typeof supplierSchema>;
