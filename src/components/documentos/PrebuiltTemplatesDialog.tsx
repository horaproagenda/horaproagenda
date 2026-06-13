import { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Stethoscope, 
  Heart, 
  Sparkles, 
  FileSignature, 
  Plus, 
  Eye,
  CheckCircle2
} from 'lucide-react';
import { TemplateFormData } from '@/hooks/useDocumentTemplatesManagement';

interface PrebuiltTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (template: TemplateFormData) => Promise<void>;
}

const prebuiltTemplates = {
  anamnese: [
    {
      title: 'Anamnese Facial Completa',
      description: 'Avaliação completa para tratamentos faciais',
      category: 'facial',
      variables: ['nome', 'cpf', 'data', 'telefone', 'email', 'nascimento'],
      content: `FICHA DE ANAMNESE FACIAL

Data: {data}

DADOS PESSOAIS
Nome Completo: {nome}
CPF: {cpf}
Data de Nascimento: {nascimento}
Telefone: {telefone}
Email: {email}

HISTÓRICO DE SAÚDE
( ) Diabetes
( ) Hipertensão
( ) Problemas cardíacos
( ) Epilepsia
( ) Problemas renais
( ) Hepatite
( ) HIV
( ) Câncer
( ) Queloides
( ) Alergias: _______________________
( ) Uso de medicamentos: _______________________

HISTÓRICO ESTÉTICO
Já realizou procedimentos estéticos faciais? ( ) Sim ( ) Não
Se sim, quais? _______________________
Há quanto tempo? _______________________
Qual seu tipo de pele? ( ) Normal ( ) Seca ( ) Oleosa ( ) Mista ( ) Sensível
Possui manchas na pele? ( ) Sim ( ) Não
Possui acne? ( ) Sim ( ) Não
Usa protetor solar diariamente? ( ) Sim ( ) Não
Usa produtos ácidos? ( ) Sim ( ) Não

AVALIAÇÃO PROFISSIONAL
Fototipo: _______________________
Biotipo cutâneo: _______________________
Textura da pele: _______________________
Hidratação: _______________________
Lesões observadas: _______________________
Observações: _______________________

TRATAMENTO PROPOSTO
_______________________

TERMO DE RESPONSABILIDADE
Declaro que as informações prestadas são verdadeiras e me comprometo a seguir as orientações do profissional.

_________________________________
Assinatura do Cliente

_________________________________
Assinatura do Profissional`,
    },
    {
      title: 'Anamnese Corporal Completa',
      description: 'Avaliação para tratamentos corporais',
      category: 'corporal',
      variables: ['nome', 'cpf', 'data', 'telefone', 'email', 'nascimento'],
      content: `FICHA DE ANAMNESE CORPORAL

Data: {data}

DADOS PESSOAIS
Nome Completo: {nome}
CPF: {cpf}
Data de Nascimento: {nascimento}
Telefone: {telefone}
Email: {email}

HISTÓRICO DE SAÚDE
( ) Diabetes
( ) Hipertensão
( ) Problemas circulatórios
( ) Varizes
( ) Trombose
( ) Problemas cardíacos
( ) Próteses metálicas
( ) Marca-passo
( ) Gestante/Lactante
( ) DIU
( ) Alergias: _______________________
( ) Uso de medicamentos: _______________________

HISTÓRICO CORPORAL
Peso: _______ kg
Altura: _______ cm
IMC: _______
Pratica atividade física? ( ) Sim ( ) Não - Qual/Frequência: _______________________
Alimentação: ( ) Saudável ( ) Regular ( ) Inadequada
Ingestão de água diária: _______ litros
Função intestinal: ( ) Regular ( ) Irregular

AVALIAÇÃO FÍSICA
Gordura localizada: ( ) Abdômen ( ) Flancos ( ) Costas ( ) Braços ( ) Coxas ( ) Glúteos
Celulite: ( ) Grau I ( ) Grau II ( ) Grau III ( ) Grau IV
Flacidez: ( ) Muscular ( ) Tissular
Estrias: ( ) Brancas ( ) Rosadas
Retenção de líquido: ( ) Sim ( ) Não
Observações: _______________________

MEDIDAS (cm)
Busto: _______
Cintura: _______
Abdômen: _______
Quadril: _______
Coxa D: _______ Coxa E: _______
Braço D: _______ Braço E: _______

TRATAMENTO PROPOSTO
_______________________

TERMO DE RESPONSABILIDADE
Declaro que as informações prestadas são verdadeiras e me comprometo a seguir as orientações do profissional.

_________________________________
Assinatura do Cliente

_________________________________
Assinatura do Profissional`,
    },
    {
      title: 'Anamnese Micropigmentação',
      description: 'Avaliação para micropigmentação de sobrancelhas, olhos e lábios',
      category: 'facial',
      variables: ['nome', 'cpf', 'data', 'telefone', 'email'],
      content: `FICHA DE ANAMNESE - MICROPIGMENTAÇÃO

Data: {data}

DADOS PESSOAIS
Nome Completo: {nome}
CPF: {cpf}
Telefone: {telefone}
Email: {email}

PROCEDIMENTO DESEJADO
( ) Sobrancelhas - Fio a fio
( ) Sobrancelhas - Shadow
( ) Sobrancelhas - Ombré
( ) Delineado olhos
( ) Lábios

HISTÓRICO DE SAÚDE
( ) Diabetes
( ) Hemofilia
( ) Herpes labial (para lábios)
( ) Hepatite
( ) HIV
( ) Epilepsia
( ) Queloides
( ) Vitiligo
( ) Psoríase
( ) Gestante/Lactante
( ) Uso de anticoagulantes
( ) Uso de Roacutan (últimos 6 meses)
( ) Quimioterapia/Radioterapia
( ) Alergias: _______________________

HISTÓRICO DE MICROPIGMENTAÇÃO
Já realizou micropigmentação antes? ( ) Sim ( ) Não
Há quanto tempo? _______________________
Teve alguma reação? _______________________

CUIDADOS PRÉ E PÓS-PROCEDIMENTO
Recebi e compreendi todas as orientações de cuidados pré e pós-procedimento.
( ) Sim

TERMO DE CONSENTIMENTO
Declaro que fui informada sobre o procedimento, seus riscos e cuidados necessários.

_________________________________
Assinatura do Cliente

_________________________________
Assinatura do Profissional`,
    },
    {
      title: 'Anamnese Depilação a Laser',
      description: 'Avaliação para depilação a laser',
      category: 'corporal',
      variables: ['nome', 'cpf', 'data', 'telefone', 'email'],
      content: `FICHA DE ANAMNESE - DEPILAÇÃO A LASER

Data: {data}

DADOS PESSOAIS
Nome Completo: {nome}
CPF: {cpf}
Telefone: {telefone}
Email: {email}

ÁREAS A SEREM TRATADAS
( ) Rosto completo
( ) Buço
( ) Queixo
( ) Axilas
( ) Braços
( ) Meia perna
( ) Perna inteira
( ) Virilha simples
( ) Virilha completa
( ) Costas
( ) Abdômen
( ) Outras: _______________________

HISTÓRICO DE SAÚDE
( ) Diabetes
( ) Epilepsia
( ) Herpes
( ) Vitiligo
( ) Psoríase
( ) Lúpus
( ) Gestante/Lactante
( ) Uso de medicamentos fotossensíveis
( ) Uso de Roacutan
( ) Bronzeamento recente (últimos 30 dias)
( ) Queloides

FOTOTIPO (Fitzpatrick)
( ) I - Muito clara, sempre queima
( ) II - Clara, geralmente queima
( ) III - Morena clara, às vezes queima
( ) IV - Morena, raramente queima
( ) V - Morena escura, nunca queima
( ) VI - Negra, nunca queima

COR DOS PELOS
( ) Pretos ( ) Castanhos ( ) Loiros ( ) Ruivos ( ) Brancos

TERMO DE RESPONSABILIDADE
Declaro que as informações são verdadeiras e entendi os cuidados necessários.

_________________________________
Assinatura do Cliente`,
    },
    {
      title: 'Anamnese Peeling',
      description: 'Avaliação para procedimentos de peeling',
      category: 'facial',
      variables: ['nome', 'cpf', 'data', 'telefone', 'email'],
      content: `FICHA DE ANAMNESE - PEELING

Data: {data}

DADOS PESSOAIS
Nome Completo: {nome}
CPF: {cpf}
Telefone: {telefone}
Email: {email}

OBJETIVO DO TRATAMENTO
( ) Rejuvenescimento
( ) Manchas/Melasma
( ) Acne/Cicatrizes
( ) Textura da pele
( ) Poros dilatados
( ) Outros: _______________________

HISTÓRICO DE SAÚDE
( ) Diabetes
( ) Herpes labial/facial
( ) Doenças autoimunes
( ) Queloides
( ) Gestante/Lactante
( ) Uso de Roacutan (últimos 6 meses)
( ) Alergia a ácidos
( ) Sensibilidade ao sol
( ) Uso de medicamentos: _______________________

HISTÓRICO ESTÉTICO
Já realizou peeling antes? ( ) Sim ( ) Não
Tipo: _______________________ Há quanto tempo: _______________________
Teve reações adversas? _______________________
Usa ácidos em casa? ( ) Sim ( ) Não
Quais? _______________________
Exposição solar frequente? ( ) Sim ( ) Não

AVALIAÇÃO DA PELE
Fototipo: _______
Textura: ( ) Lisa ( ) Áspera ( ) Com poros dilatados
Manchas: ( ) Melasma ( ) Solar ( ) Pós-inflamatória ( ) Outras
Acne ativa? ( ) Sim ( ) Não

PROTOCOLO PROPOSTO
_______________________

TERMO DE CONSENTIMENTO
Fui orientada sobre os cuidados pré e pós-procedimento, incluindo uso obrigatório de protetor solar.

_________________________________
Assinatura do Cliente`,
    },
  ],
  contracts: [
    {
      title: 'Contrato de Prestação de Serviços Estéticos',
      description: 'Contrato padrão para serviços estéticos',
      category: 'contract',
      variables: ['nome', 'cpf', 'endereco', 'telefone', 'servico', 'valor', 'data', 'profissional'],
      content: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS ESTÉTICOS

CONTRATANTE:
Nome: {nome}
CPF: {cpf}
Endereço: {endereco}
Telefone: {telefone}

CONTRATADA:
[Nome da Clínica]
CNPJ: [CNPJ]
Endereço: [Endereço da Clínica]

CLÁUSULA PRIMEIRA - DO OBJETO
O presente contrato tem por objeto a prestação de serviços estéticos de {servico} a ser realizado pelo profissional {profissional}.

CLÁUSULA SEGUNDA - DO VALOR
O valor total dos serviços é de R$ {valor}, a ser pago conforme condições acordadas entre as partes.

CLÁUSULA TERCEIRA - DAS OBRIGAÇÕES DA CONTRATADA
I. Realizar os procedimentos com zelo e técnica adequada;
II. Utilizar materiais de qualidade e devidamente esterilizados;
III. Orientar o cliente sobre cuidados pré e pós-procedimento;
IV. Manter sigilo sobre informações pessoais e de saúde do cliente.

CLÁUSULA QUARTA - DAS OBRIGAÇÕES DO CONTRATANTE
I. Fornecer informações verdadeiras sobre seu estado de saúde;
II. Seguir as orientações do profissional;
III. Efetuar o pagamento conforme acordado;
IV. Comunicar qualquer reação adversa.

CLÁUSULA QUINTA - DO CANCELAMENTO
Cancelamentos devem ser realizados com no mínimo 24 horas de antecedência, sob pena de cobrança de taxa administrativa de 50% do valor da sessão.

CLÁUSULA SEXTA - DOS RESULTADOS
Os resultados podem variar de acordo com as características individuais de cada pessoa. A contratada não garante resultados específicos.

CLÁUSULA SÉTIMA - DO FORO
Fica eleito o foro da cidade de [Cidade] para dirimir quaisquer dúvidas oriundas deste contrato.

Local e Data: _________________, {data}

_________________________________
CONTRATANTE

_________________________________
CONTRATADA`,
    },
    {
      title: 'Termo de Consentimento Livre e Esclarecido',
      description: 'Termo padrão de consentimento para procedimentos',
      category: 'consent',
      variables: ['nome', 'cpf', 'data', 'servico', 'profissional'],
      content: `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO

Eu, {nome}, portador(a) do CPF {cpf}, declaro que fui devidamente informado(a) sobre:

1. A natureza do procedimento: {servico}
2. Os benefícios esperados do tratamento
3. Os possíveis riscos e complicações
4. As alternativas de tratamento existentes
5. Os cuidados pré e pós-procedimento necessários

Declaro ainda que:
( ) Tive a oportunidade de fazer perguntas e todas foram respondidas satisfatoriamente
( ) Compreendi as informações recebidas
( ) Recebi cópia da ficha de anamnese e orientações de cuidados

AUTORIZAÇÃO
Autorizo o(a) profissional {profissional} a realizar o procedimento de {servico}, estando ciente de que os resultados podem variar de pessoa para pessoa.

Estou ciente de que:
- Devo informar qualquer alteração no meu estado de saúde
- Devo seguir rigorosamente as orientações passadas
- Os resultados dependem também da minha colaboração
- Posso revogar este consentimento a qualquer momento antes do procedimento

Local e Data: _________________, {data}

_________________________________
Assinatura do Paciente

_________________________________
Assinatura do Profissional Responsável

_________________________________
Assinatura de Testemunha (opcional)`,
    },
    {
      title: 'Termo de Responsabilidade - Uso de Produtos',
      description: 'Termo para uso de produtos em casa',
      category: 'consent',
      variables: ['nome', 'cpf', 'data', 'profissional'],
      content: `TERMO DE RESPONSABILIDADE - USO DE PRODUTOS DOMICILIARES

IDENTIFICAÇÃO
Nome: {nome}
CPF: {cpf}
Data: {data}

DECLARAÇÃO
Declaro que recebi orientações detalhadas sobre o uso correto dos produtos prescritos para uso domiciliar, incluindo:

- Forma de aplicação
- Quantidade a ser utilizada
- Frequência de uso
- Horários recomendados
- Possíveis reações esperadas
- Quando suspender o uso
- Contato para dúvidas

Estou ciente de que:
1. Devo seguir rigorosamente as orientações de uso
2. Devo realizar teste de sensibilidade quando orientado
3. Não devo emprestar ou compartilhar os produtos
4. Devo armazenar os produtos conforme orientação
5. Qualquer reação adversa devo comunicar imediatamente
6. O uso incorreto pode comprometer o resultado do tratamento

COMPROMISSO
Comprometo-me a seguir todas as orientações recebidas e a entrar em contato em caso de dúvidas ou reações adversas.

_________________________________
Assinatura do Cliente

Profissional Responsável: {profissional}

_________________________________
Assinatura do Profissional`,
    },
    {
      title: 'Autorização de Uso de Imagem',
      description: 'Autorização para uso de fotos antes/depois',
      category: 'consent',
      variables: ['nome', 'cpf', 'data'],
      content: `AUTORIZAÇÃO PARA USO DE IMAGEM

Eu, {nome}, portador(a) do CPF {cpf}, AUTORIZO o uso da minha imagem (fotografias e/ou vídeos) para fins de:

( ) Acompanhamento do meu próprio tratamento
( ) Divulgação em redes sociais da clínica
( ) Material publicitário
( ) Fins científicos/educacionais
( ) Portfólio profissional

CONDIÇÕES:
1. As imagens serão utilizadas sem identificação do meu nome completo
2. Não haverá qualquer remuneração pela cessão de imagem
3. A autorização é por tempo indeterminado
4. Posso solicitar a revogação desta autorização a qualquer momento, mediante comunicação por escrito

( ) AUTORIZO todas as opções acima
( ) AUTORIZO apenas as opções marcadas

Local e Data: _________________, {data}

_________________________________
Assinatura

NÃO AUTORIZO o uso da minha imagem para nenhum fim além do acompanhamento do meu tratamento.

( ) NÃO AUTORIZO

_________________________________
Assinatura`,
    },
    {
      title: 'Contrato de Pacote de Sessões',
      description: 'Contrato para venda de pacotes de tratamento',
      category: 'contract',
      variables: ['nome', 'cpf', 'telefone', 'servico', 'valor', 'data'],
      content: `CONTRATO DE AQUISIÇÃO DE PACOTE DE TRATAMENTO

DADOS DO CLIENTE
Nome: {nome}
CPF: {cpf}
Telefone: {telefone}

DADOS DO PACOTE
Tratamento: {servico}
Valor Total: R$ {valor}
Data de Aquisição: {data}

CONDIÇÕES GERAIS

1. VALIDADE
O pacote tem validade de 12 (doze) meses a partir da data de aquisição.

2. AGENDAMENTO
- As sessões devem ser agendadas com antecedência mínima de 24 horas
- O intervalo entre sessões deve seguir a recomendação do profissional

3. CANCELAMENTO DE SESSÕES
- Cancelamentos com menos de 24h de antecedência: perda da sessão
- 2 faltas sem aviso prévio: perda das sessões

4. TRANSFERÊNCIA
- O pacote é pessoal e intransferível
- Não é permitida a transferência para terceiros

5. REEMBOLSO
- Após o início do tratamento, não há reembolso de valores
- Em caso de desistência antes do início, será retido 20% do valor como taxa administrativa

6. RESULTADOS
Os resultados podem variar de acordo com as características individuais de cada cliente.

Declaro ter lido e concordo com todas as condições acima.

_________________________________
Assinatura do Cliente

_________________________________
Responsável pela Clínica`,
    },
  ],
};

export function PrebuiltTemplatesDialog({ 
  open, 
  onOpenChange, 
  onSelectTemplate 
}: PrebuiltTemplatesDialogProps) {
  const [selectedPreview, setSelectedPreview] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const resolveCategory = (template: any): 'anamnese' | 'contract' | 'consent' => {
    // Inside the "anamnese" group every prebuilt is an anamnese template;
    // inside "contracts" group the local `category` is already 'contract' or 'consent'.
    const c = template?.category as string | undefined;
    if (c === 'contract') return 'contract';
    if (c === 'consent') return 'consent';
    return 'anamnese';
  };

  const handleSelect = async (template: any) => {
    setIsLoading(true);
    try {
      await onSelectTemplate({
        title: template.title,
        description: template.description,
        content: template.content,
        variables: template.variables,
        is_active: true,
        category: resolveCategory(template),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[850px] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-base">Modelos Prontos</DialogTitle>
          <DialogDescription className="text-sm">
            Selecione um modelo pré-configurado para sua clínica de estética
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="anamnese" className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="px-6 pt-3 shrink-0">
            <TabsList className="h-9">
              <TabsTrigger value="anamnese" className="text-xs gap-1.5">
                <Stethoscope className="h-3.5 w-3.5" />
                Anamneses
              </TabsTrigger>
              <TabsTrigger value="contracts" className="text-xs gap-1.5">
                <FileSignature className="h-3.5 w-3.5" />
                Contratos/Termos
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-6 py-4">
              {['anamnese', 'contracts'].map(tab => (
                <TabsContent key={tab} value={tab} className="mt-0 space-y-3">
                  {prebuiltTemplates[tab as keyof typeof prebuiltTemplates].map((template, index) => (
                    <Card key={index} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-sm">{template.title}</CardTitle>
                            <CardDescription className="text-xs mt-1">
                              {template.description}
                            </CardDescription>
                          </div>
                          <div className="flex gap-1.5 shrink-0 ml-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setSelectedPreview(selectedPreview?.title === template.title ? null : template)}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              {selectedPreview?.title === template.title ? 'Ocultar' : 'Ver'}
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleSelect(template)}
                              disabled={isLoading}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Usar
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {template.variables.slice(0, 4).map((v, i) => (
                            <Badge key={i} variant="outline" className="text-[10px]">
                              {'{' + v + '}'}
                            </Badge>
                          ))}
                          {template.variables.length > 4 && (
                            <Badge variant="outline" className="text-[10px]">
                              +{template.variables.length - 4}
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      {selectedPreview?.title === template.title && (
                        <CardContent className="pt-2">
                          <ScrollArea className="h-[200px]">
                            <pre className="text-xs bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">
                              {template.content}
                            </pre>
                          </ScrollArea>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </TabsContent>
              ))}
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
