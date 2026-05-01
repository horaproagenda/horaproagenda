import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PaymentRequest {
  appointment_id: string;
  payment_methods: string[];
  amount_paid: number;
  payment_delta?: number;
  payment_status: 'pending' | 'partial' | 'paid';
  additional_items?: Array<{
    item_type: 'service' | 'product';
    service_id?: string | null;
    product_id?: string | null;
    quantity: number;
    unit_price: number;
    total_amount: number;
  }>;
  client_credit?: number; // Saldo: troco em dinheiro que fica como crédito (registrado no caixa/financeiro)
  courtesy_credit?: number; // Cortesia: brinde/presente sem entrada de dinheiro
  used_client_credit?: number;
  cash_register_id?: string;
  card_fee_amount?: number;
  installments?: number;
  discount_amount?: number; // Desconto aplicado pelo usuário
  payment_method_name?: string; // Nome da forma de pagamento para registro
}

interface ValidationError {
  field: string;
  message: string;
}

// Helper function to check user role
async function checkUserRole(supabase: ReturnType<typeof createClient>, userId: string): Promise<{ hasPermission: boolean; roles: string[] }> {
  const { data: userRoles, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching user roles:', error);
    return { hasPermission: false, roles: [] };
  }

  const roles = userRoles?.map(r => r.role) || [];
  // Only admin and receptionist can process payments
  const hasPermission = roles.includes('admin') || roles.includes('receptionist');
  
  return { hasPermission, roles };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - Missing token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Use anon key for auth verification
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getUser(token);
    if (claimsError || !claimsData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const userId = claimsData.user.id;

    // SECURITY: Check role-based authorization
    const { hasPermission, roles } = await checkUserRole(authClient, userId);
    if (!hasPermission) {
      console.log(`User ${userId} with roles [${roles.join(', ')}] attempted payment processing without permission`);
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden - Insufficient permissions. Only admin or receptionist can process payments.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`User ${userId} with roles [${roles.join(', ')}] authorized for payment processing`);

    // Use service role key for database operations to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json() as PaymentRequest;
    const errors: ValidationError[] = [];

    // 1. Validate required fields
    if (!body.appointment_id || typeof body.appointment_id !== 'string') {
      errors.push({ field: 'appointment_id', message: 'Appointment ID is required' });
    }

    // Payment methods are required UNLESS this is courtesy-only or using existing client credit only
    const isCourtesyOnly = body.courtesy_credit && body.courtesy_credit > 0 && (!body.amount_paid || body.amount_paid === 0);
    const isClientCreditOnly = body.used_client_credit && body.used_client_credit > 0 && (!Array.isArray(body.payment_methods) || body.payment_methods.length === 0);
    
    if (!isCourtesyOnly && !isClientCreditOnly && (!Array.isArray(body.payment_methods) || body.payment_methods.length === 0)) {
      errors.push({ field: 'payment_methods', message: 'At least one payment method is required' });
    }

    if (typeof body.amount_paid !== 'number' || body.amount_paid < 0) {
      errors.push({ field: 'amount_paid', message: 'Amount paid must be a positive number' });
    }

    if (!['pending', 'partial', 'paid'].includes(body.payment_status)) {
      errors.push({ field: 'payment_status', message: 'Invalid payment status' });
    }

    if (body.client_credit && (typeof body.client_credit !== 'number' || body.client_credit < 0)) {
      errors.push({ field: 'client_credit', message: 'Client credit (saldo/troco) must be a positive number' });
    }

    if (body.courtesy_credit && (typeof body.courtesy_credit !== 'number' || body.courtesy_credit < 0)) {
      errors.push({ field: 'courtesy_credit', message: 'Courtesy credit (cortesia) must be a positive number' });
    }

    if (body.used_client_credit && (typeof body.used_client_credit !== 'number' || body.used_client_credit < 0)) {
      errors.push({ field: 'used_client_credit', message: 'Used client credit must be a positive number' });
    }

    if (body.used_client_credit && body.used_client_credit > 0 && body.used_client_credit > body.amount_paid) {
      errors.push({ field: 'used_client_credit', message: 'Used client credit cannot exceed the paid amount' });
    }

    if (body.card_fee_amount && (typeof body.card_fee_amount !== 'number' || body.card_fee_amount < 0)) {
      errors.push({ field: 'card_fee_amount', message: 'Card fee must be a positive number' });
    }

    if (body.installments && (typeof body.installments !== 'number' || body.installments < 1 || body.installments > 24)) {
      errors.push({ field: 'installments', message: 'Installments must be between 1 and 24' });
    }

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ success: false, errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Verify appointment exists and get details including package info
    console.log('Looking for appointment:', body.appointment_id);
    
    const { data: appointment, error: aptError } = await supabase
      .from('appointments')
      .select(`
        *,
        client:clients(id, name, credit_balance),
        service:services(id, name, price),
        package_appointment:package_appointments!appointments_package_appointment_id_fkey(
          id,
          package_id,
          session_number,
          package:service_packages(id, name, total_price, payment_methods)
        )
      `)
      .eq('id', body.appointment_id)
      .single();

    console.log('Appointment query result:', { data: appointment, error: aptError });

    if (aptError || !appointment) {
      console.error('Appointment not found. Error:', aptError);
      return new Response(
        JSON.stringify({ success: false, error: 'Appointment not found', details: aptError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const additionalItems = Array.isArray(body.additional_items) ? body.additional_items : [];
    for (const [index, item] of additionalItems.entries()) {
      if (!['service', 'product'].includes(item.item_type)) {
        errors.push({ field: `additional_items.${index}.item_type`, message: 'Invalid additional item type' });
      }
      if (item.item_type === 'service' && !item.service_id) {
        errors.push({ field: `additional_items.${index}.service_id`, message: 'Service is required' });
      }
      if (item.item_type === 'product' && !item.product_id) {
        errors.push({ field: `additional_items.${index}.product_id`, message: 'Product is required' });
      }
      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        errors.push({ field: `additional_items.${index}.quantity`, message: 'Quantity must be greater than zero' });
      }
      if (typeof item.unit_price !== 'number' || item.unit_price < 0 || typeof item.total_amount !== 'number' || item.total_amount < 0) {
        errors.push({ field: `additional_items.${index}.amount`, message: 'Item amounts must be valid positive numbers' });
      }
    }

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ success: false, errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const newAdditionalItemsTotal = additionalItems.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);

    const { data: existingAdditionalItems, error: additionalItemsError } = await supabase
      .from('appointment_additional_items')
      .select('total_amount')
      .eq('appointment_id', body.appointment_id);

    if (additionalItemsError) {
      console.error('Error fetching existing additional items:', additionalItemsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to calculate additional items', details: additionalItemsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const existingAdditionalItemsTotal = (existingAdditionalItems || []).reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const additionalItemsTotal = existingAdditionalItemsTotal + newAdditionalItemsTotal;

    // Determine if this is a package appointment and get correct pricing
    const isPackageAppointment = !!appointment.package_appointment;
    const packageData = appointment.package_appointment?.package;
    const isPackageAlreadyPaid = packageData?.payment_methods && packageData.payment_methods.length > 0;
    
    // For packages: use full package price. For services: use service price
    const baseRequiredAmount = isPackageAppointment 
      ? (isPackageAlreadyPaid ? 0 : (packageData?.total_price || 0))
      : (appointment.service?.price || 0);
    const totalRequiredAmount = baseRequiredAmount + additionalItemsTotal;

    if (body.used_client_credit && body.used_client_credit > 0) {
      const currentBalance = Number(appointment.client?.credit_balance || 0);
      if (!appointment.client?.id || body.used_client_credit > currentBalance) {
        return new Response(
          JSON.stringify({ success: false, errors: [{ field: 'used_client_credit', message: 'Crédito utilizado maior que o saldo disponível do cliente' }] }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 3. Verify cash register is open if provided
    if (body.cash_register_id) {
      const { data: cashRegister, error: cashError } = await supabase
        .from('cash_registers')
        .select('id, status')
        .eq('id', body.cash_register_id)
        .single();

      if (cashError || !cashRegister) {
        errors.push({ field: 'cash_register_id', message: 'Cash register not found' });
      } else if (cashRegister.status !== 'open') {
        errors.push({ field: 'cash_register_id', message: 'Cash register is not open' });
      }

      if (errors.length > 0) {
        return new Response(
          JSON.stringify({ success: false, errors }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 4. Verify payment methods exist
    for (const pmId of body.payment_methods) {
      const { data: pm, error: pmError } = await supabase
        .from('payment_methods')
        .select('id, is_active')
        .eq('id', pmId)
        .single();

      if (pmError || !pm) {
        errors.push({ field: 'payment_methods', message: `Payment method ${pmId} not found` });
      } else if (!pm.is_active) {
        errors.push({ field: 'payment_methods', message: `Payment method ${pmId} is not active` });
      }
    }

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ success: false, errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Calculate payment amounts using the correct total price
    const previousAmountPaid = appointment.amount_paid || 0;
    const newPaymentAmount = body.amount_paid - previousAmountPaid;
    const newCashPaymentAmount = Math.max(0, newPaymentAmount - (body.used_client_credit || 0));
    const remainingAfterPayment = Math.max(0, totalRequiredAmount - body.amount_paid);

    // Note: We allow payments exceeding service price for flexibility
    // (tips, advance payments, package adjustments, different negotiated prices, etc.)

    // 6. Update appointment payment
    const { data: updatedAppointment, error: updateError } = await supabase
      .from('appointments')
      .update({
        payment_methods: body.payment_methods,
        amount_paid: body.amount_paid,
        payment_status: body.payment_status,
        updated_by: userId,
      })
      .eq('id', body.appointment_id)
      .select()
      .single();

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update payment', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Propagate payment_status to all sibling appointments in the same package
    if (appointment.package_appointment?.package_id) {
      const packageId = appointment.package_appointment.package_id;
      
      // Get all package_appointments for this package
      const { data: siblingPAs } = await supabase
        .from('package_appointments')
        .select('appointment_id')
        .eq('package_id', packageId)
        .not('appointment_id', 'is', null);

      if (siblingPAs && siblingPAs.length > 0) {
        const siblingIds = siblingPAs
          .map((pa: any) => pa.appointment_id)
          .filter((id: string) => id !== body.appointment_id);

        if (siblingIds.length > 0) {
          const { error: propagateError } = await supabase
            .from('appointments')
            .update({
              payment_status: body.payment_status,
              amount_paid: body.amount_paid,
              payment_methods: body.payment_methods,
              updated_by: userId,
            })
            .in('id', siblingIds);

          if (propagateError) {
            console.error('Error propagating payment to siblings:', propagateError);
          } else {
            console.log(`Propagated payment (status='${body.payment_status}', amount=${body.amount_paid}) to ${siblingIds.length} sibling appointments in package ${packageId}`);
          }
        }
      }
    }

    if (additionalItems.length > 0) {
      const rows = additionalItems.map((item) => ({
        appointment_id: body.appointment_id,
        item_type: item.item_type,
        service_id: item.item_type === 'service' ? item.service_id : null,
        product_id: item.item_type === 'product' ? item.product_id : null,
        professional_id: appointment.professional_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_amount: item.total_amount,
        created_by: userId,
      }));

      const { error: itemsError } = await supabase
        .from('appointment_additional_items')
        .insert(rows);

      if (itemsError) {
        console.error('Error inserting additional items:', itemsError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to save additional items', details: itemsError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      for (const item of additionalItems.filter((entry) => entry.item_type === 'product' && entry.product_id)) {
        const { data: product } = await supabase
          .from('products')
          .select('current_stock')
          .eq('id', item.product_id)
          .single();

        if (product) {
          const { error: stockError } = await supabase
            .from('products')
            .update({ current_stock: Math.max(0, Number(product.current_stock || 0) - Number(item.quantity || 0)) })
            .eq('id', item.product_id);

          if (stockError) {
            console.error('Error updating product stock for additional item:', stockError);
          }
        }
      }
    }

    // 7. Handle client credit - ADD or DEDUCT
    const clientName = appointment.client?.name || 'Cliente';
    // Use package name if package appointment, otherwise use service name
    const serviceName = isPackageAppointment 
      ? (packageData?.name || 'Pacote')
      : (appointment.service?.name || 'Serviço');
    const today = new Date().toISOString().split('T')[0];
    const primaryPaymentMethodId = body.payment_methods[0] || null;

    // Resolve payment method name from ID for proper categorization in cash register
    let primaryPaymentMethodName = body.payment_method_name || null;
    if (primaryPaymentMethodId && !primaryPaymentMethodName) {
      const { data: pmData } = await supabase
        .from('payment_methods')
        .select('name')
        .eq('id', primaryPaymentMethodId)
        .single();
      if (pmData?.name) {
        primaryPaymentMethodName = pmData.name;
      }
    }

    // If this is a package payment and package exists, update its payment_methods
    if (isPackageAppointment && packageData?.id && body.payment_status === 'paid' && !isPackageAlreadyPaid) {
      const { error: updatePackageError } = await supabase
        .from('service_packages')
        .update({ payment_methods: body.payment_methods })
        .eq('id', packageData.id);
      
      if (updatePackageError) {
        console.error('Error updating package payment_methods:', updatePackageError);
      }
    }

    // 7a. Add SALDO (client_credit) - excess payment stored as credit - REGISTERED in cash/financial
    // This is real money that becomes a credit for the client
    if (body.client_credit && body.client_credit > 0 && appointment.client?.id) {
      const currentBalance = appointment.client.credit_balance || 0;
      const newBalance = Number(currentBalance) + body.client_credit;

      const { error: clientError } = await supabase
        .from('clients')
        .update({ credit_balance: newBalance })
        .eq('id', appointment.client.id);

      if (clientError) {
        console.error('Error adding client credit (saldo):', clientError);
      }

      // Create financial entry for the credit (saldo/troco is real money)
      const { error: creditEntryError } = await supabase.from('financial_entries').insert({
        type: 'receivable',
        description: `Saldo/Troco: ${serviceName} - ${clientName}`,
        amount: body.client_credit,
        due_date: today,
        paid_date: today,
        status: 'paid',
        client_id: appointment.client.id,
        appointment_id: body.appointment_id,
        notes: 'Troco deixado como saldo do cliente',
        created_by: userId,
      });

      if (creditEntryError) {
        console.error('Error creating saldo financial entry:', creditEntryError);
      }

      // Create cash transaction for the credit (saldo/troco)
      if (body.cash_register_id) {
        const { error: creditCashError } = await supabase.from('cash_transactions').insert({
          cash_register_id: body.cash_register_id,
          type: 'income',
          category: 'client_credit',
          description: `Saldo/Troco: ${serviceName} - ${clientName}`,
          amount: body.client_credit,
          payment_method: null,
          reference_id: body.appointment_id,
          reference_type: 'appointment',
          created_by: userId,
        });

        if (creditCashError) {
          console.error('Error creating saldo cash transaction:', creditCashError);
        }
      }
    }

    // 7a2. Add COURTESY (courtesy_credit) - gift/bonus - NOT registered in cash/financial
    // This is a gift/bonus without real money entering
    if (body.courtesy_credit && body.courtesy_credit > 0 && appointment.client?.id) {
      const currentBalance = appointment.client.credit_balance || 0;
      const newBalance = Number(currentBalance) + body.courtesy_credit;

      const { error: clientError } = await supabase
        .from('clients')
        .update({ credit_balance: newBalance })
        .eq('id', appointment.client.id);

      if (clientError) {
        console.error('Error adding courtesy credit:', clientError);
      }

      // No financial entry or cash transaction for courtesy - it's a gift
      console.log(`Courtesy credit of ${body.courtesy_credit} added to client ${clientName} - no financial entry`);
    }

    // 7b. Deduct credit from client (using existing credit for payment)
    if (body.used_client_credit && body.used_client_credit > 0 && appointment.client?.id) {
      const currentBalance = appointment.client.credit_balance || 0;
      if (body.used_client_credit > Number(currentBalance)) {
        return new Response(
          JSON.stringify({ success: false, errors: [{ field: 'used_client_credit', message: 'Crédito utilizado maior que o saldo disponível do cliente' }] }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const newBalance = Math.max(0, Number(currentBalance) - body.used_client_credit);

      const { error: clientError } = await supabase
        .from('clients')
        .update({ credit_balance: newBalance })
        .eq('id', appointment.client.id);

      if (clientError) {
        console.error('Error deducting client credit:', clientError);
      }
      // Resolve professional that performed the baixa: prefer the user's linked professional, fallback to the appointment's
      let baixaProfessionalId: string | null = appointment.professional_id || null;
      try {
        const { data: profRow } = await supabase
          .from('professionals')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();
        if (profRow?.id) baixaProfessionalId = profRow.id;
      } catch (_e) { /* keep fallback */ }

      const { error: creditHistoryError } = await supabase
        .from('client_credit_transactions')
        .insert({
          client_id: appointment.client.id,
          appointment_id: body.appointment_id,
          transaction_type: 'credit_used',
          amount: body.used_client_credit,
          previous_balance: Number(currentBalance),
          new_balance: newBalance,
          description: `Uso de crédito na baixa: ${serviceName} - ${clientName} (R$ ${Number(body.used_client_credit).toFixed(2)})`,
          created_by: userId,
          professional_id: baixaProfessionalId,
        });

      if (creditHistoryError) {
        console.error('Error recording client credit history:', creditHistoryError);
      }
      console.log(`Client credit used: ${body.used_client_credit} for ${clientName} - not registered in cash flow`);
    }

    // 8. Create financial entries and cash transactions for actual payments
    // First, handle discount registration if any
    const discountAmount = body.discount_amount || 0;
    if (discountAmount > 0 && body.cash_register_id) {
      // Register discount as a separate entry for auditing/reporting purposes
      const { error: discountEntryError } = await supabase.from('financial_entries').insert({
        type: 'expense',
        description: `Desconto: ${serviceName} - ${clientName}`,
        amount: discountAmount,
        due_date: today,
        paid_date: today,
        status: 'paid',
        client_id: appointment.client?.id,
        appointment_id: body.appointment_id,
        notes: 'Desconto concedido ao cliente',
        created_by: userId,
      });

      if (discountEntryError) {
        console.error('Error creating discount financial entry:', discountEntryError);
      }

      // Register discount as cash transaction for cash register tracking
      const { error: discountCashError } = await supabase.from('cash_transactions').insert({
        cash_register_id: body.cash_register_id,
        type: 'expense',
        category: 'discount',
        description: `Desconto: ${serviceName} - ${clientName}`,
        amount: discountAmount,
        payment_method: null,
        reference_id: body.appointment_id,
        reference_type: 'appointment',
        created_by: userId,
      });

      if (discountCashError) {
        console.error('Error creating discount cash transaction:', discountCashError);
      }
    }

    if (newCashPaymentAmount > 0) {
      // Create financial entry
      const { error: entryError } = await supabase.from('financial_entries').insert({
        type: 'receivable',
        description: `Pagamento: ${serviceName} - ${clientName}`,
        amount: newCashPaymentAmount,
        due_date: today,
        paid_date: today,
        status: 'paid',
        client_id: appointment.client?.id,
        appointment_id: body.appointment_id,
        payment_method_id: primaryPaymentMethodId,
        created_by: userId,
      });

      if (entryError) {
        console.error('Error creating financial entry:', entryError);
      }

      // Create cash transaction if register is open - use payment_method_name for proper categorization
      if (body.cash_register_id) {
        const { error: cashError } = await supabase.from('cash_transactions').insert({
          cash_register_id: body.cash_register_id,
          type: 'income',
          category: 'sale',
          description: `${serviceName} - ${clientName}${additionalItemsTotal > 0 ? ` + adicionais R$ ${additionalItemsTotal.toFixed(2)}` : ''}`,
          amount: newCashPaymentAmount,
          payment_method: primaryPaymentMethodName || primaryPaymentMethodId,
          reference_id: body.appointment_id,
          reference_type: 'appointment',
          card_fee_amount: body.card_fee_amount || 0,
          installments: body.installments || 1,
          created_by: userId,
        });

        if (cashError) {
          console.error('Error creating cash transaction:', cashError);
        }
      }

      // Create pending receivable for partial payments
      if (remainingAfterPayment > 0 && body.payment_status === 'partial') {
        const { error: pendingError } = await supabase.from('financial_entries').insert({
          type: 'receivable',
          description: `Saldo pendente: ${serviceName} - ${clientName}`,
          amount: remainingAfterPayment,
          due_date: today,
          paid_date: null,
          status: 'pending',
          client_id: appointment.client?.id,
          appointment_id: body.appointment_id,
          created_by: userId,
        });

        if (pendingError) {
          console.error('Error creating pending receivable:', pendingError);
        }
      }

      // Mark pending entries as paid if fully paid
      if (body.payment_status === 'paid') {
        const { error: updatePendingError } = await supabase
          .from('financial_entries')
          .update({ status: 'paid', paid_date: today })
          .eq('appointment_id', body.appointment_id)
          .eq('status', 'pending');

        if (updatePendingError) {
          console.error('Error updating pending entries:', updatePendingError);
        }
      }
    }

    // Log audit entry for payment processing
    await supabase.from('audit_logs').insert({
      action: 'payment_processed',
      table_name: 'appointments',
      record_id: body.appointment_id,
      user_id: userId,
      new_data: {
        amount_paid: body.amount_paid,
        payment_status: body.payment_status,
        payment_methods: body.payment_methods,
        used_client_credit: body.used_client_credit || 0,
        discount_amount: discountAmount,
        additional_items_total: additionalItemsTotal,
        additional_items_count: additionalItems.length,
        user_roles: roles,
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: updatedAppointment,
        payment_details: {
          previous_amount: previousAmountPaid,
          new_payment: newCashPaymentAmount,
          total_paid: body.amount_paid,
          remaining: remainingAfterPayment
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Payment processing error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
