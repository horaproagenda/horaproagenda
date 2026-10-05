// Modelos prontos de documentos e categorias sugeridas por tipo de estabelecimento.
import { establishmentLabels } from '@/hooks/useEstablishment';

export interface SegmentTemplate {
  title: string;
  description: string;
  category: 'anamnese' | 'contract' | 'consent';
  variables: string[];
  content: string;
}

const BASE_VARS = ['nome', 'cpf', 'data', 'telefone', 'email', 'nascimento'];

const header = (title: string) => `${title}

Data: {data}
Nome: {nome}
CPF: {cpf}
Nascimento: {nascimento}
Telefone: {telefone}
E-mail: {email}
`;

const sign = `
_________________________________
Assinatura do Cliente`;

const ANAMNESE_BY_TYPE: Record<string, { title: string; description: string; body: string }> = {
  barbearia: {
    title: 'Ficha do Cliente — Barbearia',
    description: 'Preferências de corte, barba e cuidados com couro cabeludo',
    body: `
PREFERÊNCIAS
Tipo de corte preferido: ____________
Máquina (altura): ____  Tesoura: ( ) Sim ( ) Não
Barba: ( ) Completa ( ) Desenhada ( ) Raspada ( ) Não faz
Sobrancelha: ( ) Sim ( ) Não

SAÚDE DO COURO CABELUDO E PELE
( ) Caspa / dermatite seborreica  ( ) Queda de cabelo
( ) Foliculite / pelos encravados  ( ) Pele sensível
Alergia a produtos (pomada, loção, lâmina)? ( ) Não ( ) Sim: ________

OBSERVAÇÕES: ____________________`,
  },
  salao: {
    title: 'Ficha do Cliente — Salão de Beleza',
    description: 'Histórico capilar, química e alergias',
    body: `
HISTÓRICO CAPILAR
Tipo de cabelo: ( ) Liso ( ) Ondulado ( ) Cacheado ( ) Crespo
Química nos últimos 6 meses: ( ) Coloração ( ) Progressiva ( ) Descoloração ( ) Nenhuma
Teste de mecha realizado? ( ) Sim ( ) Não

SAÚDE
Alergia a tintas/produtos? ( ) Não ( ) Sim: ________
Gestante? ( ) Sim ( ) Não
Problemas no couro cabeludo: ________

OBSERVAÇÕES: ____________________`,
  },
  odontologia: {
    title: 'Anamnese Odontológica',
    description: 'Histórico médico e odontológico do paciente',
    body: `
QUEIXA PRINCIPAL: ____________________

HISTÓRICO MÉDICO
( ) Hipertensão ( ) Diabetes ( ) Cardiopatia ( ) Problemas de coagulação
( ) Gestante ( ) Fumante ( ) Uso de anticoagulantes
Alergia a medicamentos/anestésicos? ( ) Não ( ) Sim: ________
Medicamentos em uso: ________

HISTÓRICO ODONTOLÓGICO
Último tratamento: ________
Sangramento gengival? ( ) Sim ( ) Não
Sensibilidade? ( ) Sim ( ) Não
Bruxismo? ( ) Sim ( ) Não

Declaro que as informações acima são verdadeiras.`,
  },
  psicologia: {
    title: 'Ficha de Acolhimento — Psicologia',
    description: 'Primeira entrevista e dados do paciente',
    body: `
MOTIVO DA BUSCA POR ATENDIMENTO: ____________________

HISTÓRICO
Já fez acompanhamento psicológico? ( ) Sim ( ) Não
Acompanhamento psiquiátrico? ( ) Sim ( ) Não
Medicamentos em uso: ________
Contato de emergência: ________

Declaro estar ciente do sigilo profissional previsto no Código de Ética.`,
  },
  fisioterapia: {
    title: 'Avaliação Fisioterapêutica',
    description: 'Queixa, histórico e avaliação inicial',
    body: `
QUEIXA PRINCIPAL: ____________________
Início dos sintomas: ________
Intensidade da dor (0 a 10): ____

HISTÓRICO
( ) Cirurgias  ( ) Fraturas  ( ) Hipertensão  ( ) Diabetes
Exames trazidos: ________
Medicamentos em uso: ________
Atividade física: ________

OBJETIVOS DO TRATAMENTO: ____________________`,
  },
  fonoaudiologia: {
    title: 'Anamnese Fonoaudiológica',
    description: 'Queixa, desenvolvimento e hábitos',
    body: `
QUEIXA PRINCIPAL: ____________________
Área: ( ) Linguagem ( ) Voz ( ) Audição ( ) Motricidade orofacial ( ) Fluência
Histórico de otites/problemas auditivos? ( ) Sim ( ) Não
Hábitos: ( ) Chupeta ( ) Respiração oral ( ) Ronco
Observações: ________`,
  },
  nutricao: {
    title: 'Anamnese Nutricional',
    description: 'Hábitos alimentares, objetivos e saúde',
    body: `
OBJETIVO: ( ) Emagrecimento ( ) Ganho de massa ( ) Saúde ( ) Performance
Peso atual: ____ Altura: ____
Restrições/alergias alimentares: ________
Patologias: ( ) Diabetes ( ) Hipertensão ( ) Colesterol ( ) Outras: ____
Refeições por dia: ____  Água por dia: ____
Atividade física: ________`,
  },
  podologia: {
    title: 'Ficha de Avaliação Podológica',
    description: 'Avaliação dos pés e histórico de saúde',
    body: `
QUEIXA: ( ) Unha encravada ( ) Calosidade ( ) Micose ( ) Fissuras ( ) Outra: ____
Diabético? ( ) Sim ( ) Não
Problemas circulatórios? ( ) Sim ( ) Não
Alergias: ________
Calçado de uso diário: ________`,
  },
  veterinaria: {
    title: 'Ficha Clínica do Animal',
    description: 'Dados do tutor e histórico do animal',
    body: `
Tutor: {nome}
Nome do animal: ________  Espécie: ________  Raça: ________
Idade: ____  Peso: ____  Sexo: ( ) M ( ) F  Castrado: ( ) Sim ( ) Não
Vacinas em dia? ( ) Sim ( ) Não
Vermifugação: ________
Queixa principal: ________
Alergias/medicamentos: ________`,
  },
  terapia: {
    title: 'Ficha de Acolhimento — Terapias',
    description: 'Objetivos, saúde e contraindicações',
    body: `
OBJETIVO DA TERAPIA: ____________________
Condições de saúde: ( ) Hipertensão ( ) Gestante ( ) Lesões ( ) Outras: ____
Medicamentos em uso: ________
Alergias (óleos, essências): ________`,
  },
};

const GENERIC = {
  title: 'Ficha de Cadastro e Anamnese',
  description: 'Dados do cliente, saúde e observações',
  body: `
MOTIVO DO ATENDIMENTO: ____________________
Condições de saúde relevantes: ________
Alergias: ________
Medicamentos em uso: ________
Observações: ________`,
};

/** Tipos que já usam o conjunto original de modelos de estética. */
export const AESTHETIC_TYPES = ['clinica', 'estetica', 'spa'];

export function segmentTemplates(type?: string | null, customLabel?: string | null): SegmentTemplate[] {
  const l = establishmentLabels(type, customLabel);
  const a = ANAMNESE_BY_TYPE[l.type] ?? GENERIC;
  return [
    {
      title: a.title,
      description: a.description,
      category: 'anamnese',
      variables: BASE_VARS,
      content: header(a.title.toUpperCase()) + a.body + '\n' + sign,
    },
    {
      title: `Contrato de Prestação de Serviços — ${l.label}`,
      description: `Contrato padrão para serviços ${l.of}`,
      category: 'contract',
      variables: ['nome', 'cpf', 'endereco', 'telefone', 'servico', 'valor', 'data', 'profissional'],
      content: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS

CONTRATANTE: {nome}, CPF {cpf}, residente em {endereco}, telefone {telefone}.
CONTRATADO(A): {profissional}, ${l.noun}.

1. OBJETO: prestação do serviço {servico}.
2. VALOR: {valor}.
3. AGENDAMENTO: faltas sem aviso com 24h de antecedência poderão ser cobradas.
4. O(A) CONTRATANTE declara ter recebido as orientações necessárias.

Data: {data}
${sign}

_________________________________
Responsável ${l.of}`,
    },
    {
      title: 'Termo de Consentimento e Uso de Imagem',
      description: 'Autorização de atendimento e uso de fotos',
      category: 'consent',
      variables: ['nome', 'cpf', 'data', 'servico'],
      content: `TERMO DE CONSENTIMENTO

Eu, {nome}, CPF {cpf}, autorizo a realização do serviço {servico} ${l.in} e declaro ter sido informado(a) sobre o procedimento, cuidados e possíveis riscos.

Uso de imagem: ( ) Autorizo ( ) Não autorizo o uso de fotos para registro e divulgação, sem identificação.

Data: {data}
${sign}`,
    },
  ];
}

/** Categorias de serviços sugeridas para cada área. */
const CATEGORIES_BY_TYPE: Record<string, string[]> = {
  barbearia: ['Corte', 'Barba', 'Combo', 'Química', 'Sobrancelha', 'Outros'],
  salao: ['Cabelo', 'Coloração', 'Tratamentos', 'Manicure e Pedicure', 'Maquiagem', 'Outros'],
  odontologia: ['Avaliação', 'Prevenção', 'Restauração', 'Endodontia', 'Ortodontia', 'Estética dental', 'Cirurgia', 'Outros'],
  psicologia: ['Psicoterapia individual', 'Casal', 'Infantil', 'Avaliação', 'Outros'],
  fisioterapia: ['Avaliação', 'Ortopédica', 'Neurológica', 'Pilates', 'RPG', 'Outros'],
  fonoaudiologia: ['Avaliação', 'Linguagem', 'Voz', 'Audição', 'Outros'],
  nutricao: ['Consulta', 'Retorno', 'Bioimpedância', 'Plano alimentar', 'Outros'],
  podologia: ['Avaliação', 'Podoprofilaxia', 'Unha encravada', 'Órtese', 'Outros'],
  veterinaria: ['Consulta', 'Vacinação', 'Banho e tosa', 'Exames', 'Cirurgia', 'Outros'],
  terapia: ['Massoterapia', 'Acupuntura', 'Reiki', 'Aromaterapia', 'Outros'],
};

export function suggestedServiceCategories(type?: string | null): string[] | null {
  if (!type) return null;
  return CATEGORIES_BY_TYPE[type] ?? null;
}
