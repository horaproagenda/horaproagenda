import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { getEstablishmentType, establishmentNoun } from '@/lib/establishmentType';

/**
 * Nomenclatura do negócio conforme o tipo escolhido no cadastro
 * (business_settings.business_type). Ex.: barbearia → "barbearia",
 * "da barbearia", "Sua barbearia".
 */
export function useEstablishment() {
  const { settings } = useBusinessSettings();
  const s = (settings || {}) as { business_type?: string | null; business_type_label?: string | null };
  return establishmentLabels(s.business_type, s.business_type_label);
}

export function establishmentLabels(type?: string | null, customLabel?: string | null) {
  const opt = getEstablishmentType(type);
  const noun = establishmentNoun(type || 'clinica', customLabel, 'clínica');
  const article = opt?.article ?? (type ? 'o' : 'a');
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return {
    type: (type || 'clinica') as string,
    label: opt?.label || cap(noun),
    noun,
    Noun: cap(noun),
    /** "da barbearia" / "do salão" */
    of: `${article === 'a' ? 'da' : 'do'} ${noun}`,
    /** "na barbearia" / "no salão" */
    in: `${article === 'a' ? 'na' : 'no'} ${noun}`,
    /** "Sua barbearia" / "Seu salão" */
    your: `${article === 'a' ? 'Sua' : 'Seu'} ${noun}`,
    yourLower: `${article === 'a' ? 'sua' : 'seu'} ${noun}`,
    /** "configurada" / "configurado" */
    suffix: article === 'a' ? 'a' : 'o',
  };
}

/** Troca menções fixas a "clínica" pelo nome do negócio (ex.: "da clínica" → "da barbearia"). */
export function adaptClinicText(text: string, est: ReturnType<typeof establishmentLabels>): string {
  if (!text || est.type === 'clinica') return text;
  const fem = est.suffix === 'a';
  return text
    .replace(/desta clínica/g, `${fem ? 'desta' : 'deste'} ${est.noun}`)
    .replace(/da clínica/g, est.of)
    .replace(/na clínica/g, est.in)
    .replace(/à clínica/g, `${fem ? 'à' : 'ao'} ${est.noun}`)
    .replace(/a clínica/g, `${fem ? 'a' : 'o'} ${est.noun}`)
    .replace(/Clínica/g, est.Noun)
    .replace(/clínica/g, est.noun);
}
