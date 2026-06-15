---
name: Sale cascade cleanup
description: Excluir uma venda (ou apagar todas as parcelas de boleto) limpa em cascata pacote, serviços disponíveis, agendamentos, lançamentos financeiros e caixa via RPC purge_single_sale_cascade
type: feature
---
Regra:
- single_sales é a fonte da verdade da venda. Quando uma venda é desfeita, TUDO que ela gerou some.
- Cascata: appointments (via package_appointments do pacote), package_appointments, service_packages (se não houver outra venda), client_services com sale_id, financial_entries com sale_id, cash_transactions reference_type=single_sale.
- financial_entries criado em useSingleSales DEVE incluir sale_id para permitir cleanup.
- Trigger AFTER DELETE em boleto_installments aciona purge automaticamente quando a última parcela é apagada.
- Painel "Integridade Financeiro × Agenda" em Configurações lista órfãos via audit_sale_flow_integrity().
- RPC pública: purge_single_sale_cascade(_sale_id uuid) e audit_sale_flow_integrity().
