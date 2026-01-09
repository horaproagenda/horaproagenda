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
  payment_status: 'pending' | 'partial' | 'paid';
  client_credit?: number; // Saldo: troco em dinheiro que fica como crédito (registrado no caixa/financeiro)
  courtesy_credit?: number; // Cortesia: brinde/presente sem entrada de dinheiro
  used_client_credit?: number;
  cash_register_id?: string;
  card_fee_amount?: number;
  installments?: number;
}

interface ValidationError {
  field: string;
  message: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getUser(token);
    if (claimsError || !claimsData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.user.id;
    const body = await req.json() as PaymentRequest;
    const errors: ValidationError[] = [];

    // 1. Validate required fields
    if (!body.appointment_id || typeof body.appointment_id !== 'string') {
      errors.push({ field: 'appointment_id', message: 'Appointment ID is required' });
    }

    if (!Array.isArray(body.payment_methods) || body.payment_methods.length === 0) {
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
    const { data: appointment, error: aptError } = await supabase
      .from('appointments')
      .select(`
        *,
        client:clients(id, name, credit_balance),
        service:services(id, name, price),
        package_appointment:package_appointments(
          id,
          package_id,
          session_number,
          package:service_packages(id, name, total_price, payment_methods)
        )
      `)
      .eq('id', body.appointment_id)
      .single();

    if (aptError || !appointment) {
      return new Response(
        JSON.stringify({ success: false, error: 'Appointment not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine if this is a package appointment and get correct pricing
    const isPackageAppointment = !!appointment.package_appointment;
    const packageData = appointment.package_appointment?.package;
    const isPackageAlreadyPaid = packageData?.payment_methods && packageData.payment_methods.length > 0;
    
    // For packages: use full package price. For services: use service price
    const totalRequiredAmount = isPackageAppointment 
      ? (isPackageAlreadyPaid ? 0 : (packageData?.total_price || 0))
      : (appointment.service?.price || 0);

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

    // 7. Handle client credit - ADD or DEDUCT
    const clientName = appointment.client?.name || 'Cliente';
    // Use package name if package appointment, otherwise use service name
    const serviceName = isPackageAppointment 
      ? (packageData?.name || 'Pacote')
      : (appointment.service?.name || 'Serviço');
    const today = new Date().toISOString().split('T')[0];
    const primaryPaymentMethodId = body.payment_methods[0] || null;

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
      const newBalance = Math.max(0, Number(currentBalance) - body.used_client_credit);

      const { error: clientError } = await supabase
        .from('clients')
        .update({ credit_balance: newBalance })
        .eq('id', appointment.client.id);

      if (clientError) {
        console.error('Error deducting client credit:', clientError);
      }

      // Create financial entry for credit usage
      const { error: creditEntryError } = await supabase.from('financial_entries').insert({
        type: 'receivable',
        description: `Uso de crédito: ${serviceName} - ${clientName}`,
        amount: body.used_client_credit,
        due_date: today,
        paid_date: today,
        status: 'paid',
        client_id: appointment.client.id,
        appointment_id: body.appointment_id,
        notes: 'Pagamento com crédito do cliente',
        created_by: userId,
      });

      if (creditEntryError) {
        console.error('Error creating credit usage financial entry:', creditEntryError);
      }

      // Create cash transaction for credit usage if register is open
      if (body.cash_register_id) {
        const { error: creditCashError } = await supabase.from('cash_transactions').insert({
          cash_register_id: body.cash_register_id,
          type: 'income',
          category: 'credit_usage',
          description: `Uso de crédito: ${serviceName} - ${clientName}`,
          amount: body.used_client_credit,
          payment_method: null,
          reference_id: body.appointment_id,
          reference_type: 'appointment',
          created_by: userId,
        });

        if (creditCashError) {
          console.error('Error creating credit usage cash transaction:', creditCashError);
        }
      }
    }

    // 8. Create financial entries and cash transactions for actual payments
    if (newPaymentAmount > 0) {
      // Create financial entry
      const { error: entryError } = await supabase.from('financial_entries').insert({
        type: 'receivable',
        description: `Pagamento: ${serviceName} - ${clientName}`,
        amount: newPaymentAmount,
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

      // Create cash transaction if register is open
      if (body.cash_register_id) {
        const { error: cashError } = await supabase.from('cash_transactions').insert({
          cash_register_id: body.cash_register_id,
          type: 'income',
          category: 'sale',
          description: `${serviceName} - ${clientName}`,
          amount: newPaymentAmount,
          payment_method: primaryPaymentMethodId,
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: updatedAppointment,
        payment_details: {
          previous_amount: previousAmountPaid,
          new_payment: newPaymentAmount,
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
