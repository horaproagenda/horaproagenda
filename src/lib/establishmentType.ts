// Tipos de estabelecimento suportados no cadastro/configurações.
// Usado para que o app se refira ao negócio com a nomenclatura correta
// (ex: "Sua clínica", "Seu salão", "Seu consultório").

export type EstablishmentType =
  | 'clinica'
  | 'salao'
  | 'barbearia'
  | 'odontologia'
  | 'psicologia'
  | 'fisioterapia'
  | 'fonoaudiologia'
  | 'nutricao'
  | 'estetica'
  | 'podologia'
  | 'veterinaria'
  | 'terapia'
  | 'consultorio'
  | 'spa'
  | 'outro';

export interface EstablishmentTypeOption {
  value: EstablishmentType;
  /** Nome próprio do tipo (ex: "Clínica de Estética"). */
  label: string;
  /** Substantivo singular para frases ("clínica", "salão"). */
  noun: string;
  /** Artigo definido feminino ou masculino ("a", "o"). */
  article: 'a' | 'o';
}

export const ESTABLISHMENT_TYPES: EstablishmentTypeOption[] = [
  { value: 'clinica',       label: 'Clínica',                    noun: 'clínica',     article: 'a' },
  { value: 'consultorio',   label: 'Consultório',                noun: 'consultório', article: 'o' },
  { value: 'salao',         label: 'Salão de beleza',            noun: 'salão',       article: 'o' },
  { value: 'barbearia',     label: 'Barbearia',                  noun: 'barbearia',   article: 'a' },
  { value: 'estetica',      label: 'Clínica de estética',        noun: 'clínica',     article: 'a' },
  { value: 'odontologia',   label: 'Odontologia',                noun: 'clínica',     article: 'a' },
  { value: 'psicologia',    label: 'Psicologia',                 noun: 'consultório', article: 'o' },
  { value: 'fisioterapia',  label: 'Fisioterapia',               noun: 'clínica',     article: 'a' },
  { value: 'fonoaudiologia',label: 'Fonoaudiologia',             noun: 'consultório', article: 'o' },
  { value: 'nutricao',      label: 'Nutrição',                   noun: 'consultório', article: 'o' },
  { value: 'podologia',     label: 'Podologia',                  noun: 'clínica',     article: 'a' },
  { value: 'terapia',       label: 'Terapias / Bem-estar',       noun: 'espaço',      article: 'o' },
  { value: 'spa',           label: 'Spa',                        noun: 'spa',         article: 'o' },
  { value: 'veterinaria',   label: 'Clínica veterinária',        noun: 'clínica',     article: 'a' },
  { value: 'outro',         label: 'Outra área da saúde',        noun: 'estabelecimento', article: 'o' },
];

const BY_VALUE: Record<string, EstablishmentTypeOption> = Object.fromEntries(
  ESTABLISHMENT_TYPES.map((t) => [t.value, t]),
);

export function getEstablishmentType(value?: string | null): EstablishmentTypeOption | null {
  if (!value) return null;
  return BY_VALUE[value] ?? null;
}

/**
 * Retorna o substantivo a ser usado no app para esse negócio.
 * Ex.: "clínica", "salão", "consultório". Quando o usuário escolheu
 * "outro" com um rótulo livre, usa o rótulo (em minúsculo).
 */
export function establishmentNoun(
  type?: string | null,
  customLabel?: string | null,
  fallback = 'estabelecimento',
): string {
  const opt = getEstablishmentType(type);
  if (opt && opt.value !== 'outro') return opt.noun;
  const custom = (customLabel || '').trim();
  if (custom) return custom.toLowerCase();
  return fallback;
}

/** Ex.: "Sua clínica", "Seu salão". */
export function establishmentPossessive(
  type?: string | null,
  customLabel?: string | null,
): string {
  const opt = getEstablishmentType(type);
  const noun = establishmentNoun(type, customLabel);
  const article = opt?.article ?? 'o';
  const possessive = article === 'a' ? 'Sua' : 'Seu';
  return `${possessive} ${noun}`;
}

/** Ex.: "a clínica", "o salão". */
export function establishmentWithArticle(
  type?: string | null,
  customLabel?: string | null,
): string {
  const opt = getEstablishmentType(type);
  const noun = establishmentNoun(type, customLabel);
  const article = opt?.article ?? 'o';
  return `${article} ${noun}`;
}
