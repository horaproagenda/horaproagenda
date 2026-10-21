// Campos obrigatórios do cadastro de serviço avulso (não-kit):
// retorno em dias, profissional e — quando a clínica tem salas ativas — sala.
export function validateServiceRequiredFields(
  data: { return_days?: number | null; professional_id?: string | null; room_id?: string | null },
  hasActiveRooms: boolean,
): string | null {
  const r = Number(data.return_days);
  if (!Number.isFinite(r) || r < 1 || r > 365) return 'Informe o retorno em dias (entre 1 e 365).';
  if (!data.professional_id) return 'Selecione o profissional do serviço.';
  if (hasActiveRooms && !data.room_id) return 'Selecione a sala do serviço.';
  return null;
}
