import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AppointmentRequest {
  client_id: string;
  service_id?: string;
  professional_id?: string;
  room_id?: string;
  start_time: string;
  end_time: string;
  notes?: string;
  package_appointment_id?: string;
  status?: string;
}

interface ValidationError {
  field: string;
  message: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Create client with user's auth token
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getUser(token);
    if (claimsError || !claimsData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.user.id;

    // Parse request body
    const body = await req.json() as AppointmentRequest;
    const errors: ValidationError[] = [];

    // 1. Basic input validation
    if (!body.client_id || typeof body.client_id !== 'string') {
      errors.push({ field: 'client_id', message: 'Client ID is required' });
    }
    if (!body.start_time || typeof body.start_time !== 'string') {
      errors.push({ field: 'start_time', message: 'Start time is required' });
    }
    if (!body.end_time || typeof body.end_time !== 'string') {
      errors.push({ field: 'end_time', message: 'End time is required' });
    }

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ success: false, errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse dates
    const startTime = new Date(body.start_time);
    const endTime = new Date(body.end_time);

    // 2. Validate time logic
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      errors.push({ field: 'time', message: 'Invalid date format' });
    } else if (endTime <= startTime) {
      errors.push({ field: 'end_time', message: 'End time must be after start time' });
    }
    // Note: We allow past appointments for flexibility (retroactive entries, timezone differences)

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ success: false, errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Fetch business settings for validation
    const { data: businessSettings } = await supabase
      .from('business_settings')
      .select('*')
      .limit(1)
      .single();

    if (businessSettings) {
      const startHour = startTime.getHours();
      const startMinutes = startTime.getMinutes();
      const endHour = endTime.getHours();
      const endMinutes = endTime.getMinutes();
      
      const [openHour, openMinute] = businessSettings.opening_time.split(':').map(Number);
      const [closeHour, closeMinute] = businessSettings.closing_time.split(':').map(Number);

      const startInMinutes = startHour * 60 + startMinutes;
      const endInMinutes = endHour * 60 + endMinutes;
      const openInMinutes = openHour * 60 + openMinute;
      const closeInMinutes = closeHour * 60 + closeMinute;

      if (startInMinutes < openInMinutes || endInMinutes > closeInMinutes) {
        errors.push({ 
          field: 'time', 
          message: `Appointment must be within business hours (${businessSettings.opening_time} - ${businessSettings.closing_time})` 
        });
      }

      // Check day of week
      const dayOfWeek = startTime.getDay();
      if (dayOfWeek === 0 && !businessSettings.work_sundays) {
        errors.push({ field: 'start_time', message: 'Business is closed on Sundays' });
      }
      if (dayOfWeek === 6 && !businessSettings.work_saturdays) {
        errors.push({ field: 'start_time', message: 'Business is closed on Saturdays' });
      }
    }

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ success: false, errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Verify client exists
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', body.client_id)
      .single();

    if (clientError || !client) {
      errors.push({ field: 'client_id', message: 'Client not found' });
    }

    // 5. Verify service exists if provided
    if (body.service_id) {
      const { data: service, error: serviceError } = await supabase
        .from('services')
        .select('id, name, is_active')
        .eq('id', body.service_id)
        .single();

      if (serviceError || !service) {
        errors.push({ field: 'service_id', message: 'Service not found' });
      } else if (!service.is_active) {
        errors.push({ field: 'service_id', message: 'Service is not active' });
      }
    }

    // 6. Verify professional exists and is active if provided
    if (body.professional_id) {
      const { data: professional, error: profError } = await supabase
        .from('professionals')
        .select('id, name, is_active')
        .eq('id', body.professional_id)
        .single();

      if (profError || !professional) {
        errors.push({ field: 'professional_id', message: 'Professional not found' });
      } else if (!professional.is_active) {
        errors.push({ field: 'professional_id', message: 'Professional is not active' });
      }
    }

    // 7. Verify room exists and is active if provided
    if (body.room_id) {
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('id, name, is_active')
        .eq('id', body.room_id)
        .single();

      if (roomError || !room) {
        errors.push({ field: 'room_id', message: 'Room not found' });
      } else if (!room.is_active) {
        errors.push({ field: 'room_id', message: 'Room is not active' });
      }
    }

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ success: false, errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 8. Check for professional time conflicts
    if (body.professional_id) {
      const { data: conflicts } = await supabase
        .from('appointments')
        .select('id, start_time, end_time')
        .eq('professional_id', body.professional_id)
        .not('status', 'eq', 'cancelled')
        .or(`and(start_time.lt.${body.end_time},end_time.gt.${body.start_time})`);

      if (conflicts && conflicts.length > 0) {
        errors.push({ 
          field: 'professional_id', 
          message: 'Professional has a conflicting appointment at this time' 
        });
      }
    }

    // 9. Check for room conflicts
    if (body.room_id) {
      const { data: roomConflicts } = await supabase
        .from('appointments')
        .select('id, start_time, end_time')
        .eq('room_id', body.room_id)
        .not('status', 'eq', 'cancelled')
        .or(`and(start_time.lt.${body.end_time},end_time.gt.${body.start_time})`);

      if (roomConflicts && roomConflicts.length > 0) {
        errors.push({ 
          field: 'room_id', 
          message: 'Room is already booked at this time' 
        });
      }
    }

    // 10. Check for professional absences
    if (body.professional_id) {
      const { data: absences } = await supabase
        .from('professional_absences')
        .select('id, start_time, end_time, reason')
        .eq('professional_id', body.professional_id)
        .or(`and(start_time.lt.${body.end_time},end_time.gt.${body.start_time})`);

      if (absences && absences.length > 0) {
        const absence = absences[0];
        errors.push({ 
          field: 'professional_id', 
          message: `Professional is unavailable during this time${absence.reason ? `: ${absence.reason}` : ''}` 
        });
      }
    }

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ success: false, errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 11. All validations passed - create the appointment
    const { data: appointment, error: insertError } = await supabase
      .from('appointments')
      .insert({
        client_id: body.client_id,
        service_id: body.service_id || null,
        professional_id: body.professional_id || null,
        room_id: body.room_id || null,
        start_time: body.start_time,
        end_time: body.end_time,
        notes: body.notes || null,
        package_appointment_id: body.package_appointment_id || null,
        status: body.status || 'scheduled',
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create appointment', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: appointment }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Appointment creation error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
