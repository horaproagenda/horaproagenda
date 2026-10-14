DO $migration$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.create_multi_item_sale_atomic(jsonb,uuid)'::regprocedure) INTO d;
 d:=replace(d,'IF qty IS NULL OR qty<1 OR qty>1000 THEN', $s$IF qty IS NULL OR qty<1 OR qty>1000 OR (item->>'quantity')::numeric<>qty THEN$s$);
 d:=replace(d,'IF count_payments<1 OR count_payments>coalesce(method.max_installments,100) THEN','IF count_payments<1 OR count_payments>100 OR (lower(method.name) NOT LIKE ''%boleto%'' AND count_payments>coalesce(method.max_installments,100)) THEN');
 d:=replace(d,$s$IF NOT FOUND OR (lower(method.name) NOT LIKE '%cart%' AND lower(method.name) NOT LIKE '%card%') THEN$s$, $s$IF NOT FOUND OR (lower(method.name) NOT LIKE '%cart%' AND lower(method.name) NOT LIKE '%card%') OR (lower(translate(method.name,'éÉ','eE')) LIKE '%debito%' AND brand.type<>'debit') OR (lower(translate(method.name,'éÉ','eE')) LIKE '%credito%' AND brand.type<>'credit') THEN$s$);
 d:=replace(d,$s$IF credit AND coalesce(cl.credit_balance,0)<total THEN$s$, $s$IF credit AND (NOT public.can_access_client_record(client) OR coalesce(cl.credit_balance,0)<total) THEN$s$);
 d:=replace(d,'IF due_first IS NULL THEN', $s$IF nullif(_input->>'cheque_bank_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.banks WHERE id=(_input->>'cheque_bank_id')::uuid AND account_owner_id=owner) THEN RAISE EXCEPTION 'Banco não disponível.'; END IF;
 IF due_first IS NULL THEN$s$);
 d:=replace(d,$s$'Venda com vários itens - Qtd: '||qty$s$, $s$'Venda com vários itens - Qtd: '||qty||CASE WHEN lower(method.name) LIKE '%cheque%' THEN ' - Cheque: '||coalesce(_input->>'cheque_number','')||' - Banco: '||coalesce(_input->>'cheque_bank_id','') ELSE '' END$s$);
 EXECUTE d;
END $migration$;