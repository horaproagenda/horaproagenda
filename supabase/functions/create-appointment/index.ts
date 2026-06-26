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
  /**
   * Legacy mode: when true, skips business-hours, conflict, absence and
   * equipment validations. Used for retroactive registration of appointments
   * that happened BEFORE the user adopted this system.
   */
  legacy?: boolean;
}

interface ValidationError {
  field: string;
  message: string;
}

// Brazil timezone offsets (in hours from UTC)
const TIMEZONE_OFFSETS: Record<string, number> = {
  'America/Sao_Paulo': -3,      // Brasília, São Paulo, Rio
  'America/Manaus': -4,         // Manaus, Amazonas
  'America/Rio_Branco': -5,     // Acre
  'America/Noronha': -2,        // Fernando de Noronha
  'America/Cuiaba': -4,         // Mato Grosso
  'America/Porto_Velho': -4,    // Rondônia
  'America/Boa_Vista': -4,      // Roraima
  'America/Belem': -3,          // Pará (leste)
  'America/Fortaleza': -3,      // Nordeste
  'America/Recife': -3,         // Pernambuco
  'America/Bahia': -3,          // Bahia
};

// Get timezone offset in hours
function getTimezoneOffset(timezone: string | null): number {
  if (!timezone || !TIMEZONE_OFFSETS[timezone]) {
    return -3; // Default to Brasília time
  }
  return TIMEZONE_OFFSETS[timezone];
}

// Helper to extract LOCAL time from UTC ISO string by applying timezone offset
function extractLocalTimeFromUTC(isoString: string, timezoneOffset: number): { hours: number; minutes: number } {
  const date = new Date(isoString);
  // Get UTC hours and apply timezone offset
  let hours = date.getUTCHours() + timezoneOffset;
  const minutes = date.getUTCMinutes();
  
  // Handle day wrap-around
  if (hours < 0) {
    hours += 24;
  } else if (hours >= 24) {
    hours -= 24;
  }
  
  return { hours, minutes };
}

// Helper to get day of week in local timezone from UTC ISO string
function getLocalDayOfWeekFromUTC(isoString: string, timezoneOffset: number): number {
  const date = new Date(isoString);
  // Apply timezone offset to get local day
  const localDate = new Date(date.getTime() + (timezoneOffset * 60 * 60 * 1000));
  return localDate.getUTCDay(); // 0 = Sunday, 6 = Saturday
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
  // Admin, receptionist, and professional can create appointments
  const hasPermission = roles.includes('admin') || roles.includes('receptionist') || roles.includes('professional');
  
  return { hasPermission, roles };
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

    // Verify user
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
      console.log(`User ${userId} with roles [${roles.join(', ')}] attempted appointment creation without permission`);
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden - Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`User ${userId} with roles [${roles.join(', ')}] authorized for appointment creation`);

    // Use service role for database operations to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve caller tenant for cross-tenant safety on service-role queries.
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('account_owner_id')
      .eq('id', userId)
      .maybeSingle();
    const callerOwner = (callerProfile as any)?.account_owner_id || userId;

    // Parse request body
    const body = await req.json() as AppointmentRequest;
    const errors: ValidationError[] = [];

    // SECURITY: Scope check for professional-only callers (admins/receptionists are unrestricted).
    const isAdminOrReceptionist = roles.includes('admin') || roles.includes('receptionist');
    if (!isAdminOrReceptionist && roles.includes('professional')) {
      // Resolve caller's professional record
      const { data: callerProf, error: callerProfError } = await supabase
        .from('professionals')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (callerProfError || !callerProf) {
        return new Response(
          JSON.stringify({ success: false, error: 'Forbidden - Professional record not found' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const callerProfId = callerProf.id;

      // Must specify and match own professional_id
      if (!body.professional_id || body.professional_id !== callerProfId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Forbidden - Professionals can only book appointments for themselves' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Must have access to the client (assigned to them or has a prior appointment with them)
      if (body.client_id) {
        const { data: clientRow } = await supabase
          .from('clients')
          .select('id, assigned_professional_id')
          .eq('id', body.client_id)
          .maybeSingle();

        let allowed = clientRow?.assigned_professional_id === callerProfId;
        if (!allowed) {
          const { data: priorAppt } = await supabase
            .from('appointments')
            .select('id')
            .eq('client_id', body.client_id)
            .eq('professional_id', callerProfId)
            .limit(1)
            .maybeSingle();
          allowed = !!priorAppt;
        }

        if (!allowed) {
          return new Response(
            JSON.stringify({ success: false, error: 'Forbidden - Client is not assigned to this professional' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    console.log('Creating appointment with data:', JSON.stringify(body));

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

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ success: false, errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Fetch business settings for validation
    const { data: businessSettings, error: settingsError } = await supabase
      .from('business_settings')
      .select('*')
      .eq('account_owner_id', callerOwner)
      .limit(1)
      .maybeSingle();

    console.log('Business settings:', JSON.stringify(businessSettings));

    if (businessSettings && !body.legacy) {
      // Get timezone offset from settings
      const timezoneOffset = getTimezoneOffset(businessSettings.timezone);
      console.log(`Using timezone: ${businessSettings.timezone || 'America/Sao_Paulo'} (offset: ${timezoneOffset}h)`);

      // Extract LOCAL time from the appointment - convert UTC to local timezone
      const { hours: startHour, minutes: startMinutes } = extractLocalTimeFromUTC(body.start_time, timezoneOffset);
      const { hours: endHour, minutes: endMinutes } = extractLocalTimeFromUTC(body.end_time, timezoneOffset);

      // Per-day business hours: each weekday can override opening/closing (sunday/saturday slots).
      const dayOfWeek = getLocalDayOfWeekFromUTC(body.start_time, timezoneOffset);

      // Resolve per-professional override (professional_preferences) for day flags and hours.
      let proWorkSundays: boolean | null = null;
      let proWorkSaturdays: boolean | null = null;
      let proSundayOpen: string | null = null;
      let proSundayClose: string | null = null;
      let proSaturdayOpen: string | null = null;
      let proSaturdayClose: string | null = null;
      if (body.professional_id) {
        const { data: prefs } = await supabase
          .from('professional_preferences')
          .select('work_sundays, work_saturdays, sunday_opening_time, sunday_closing_time, saturday_opening_time, saturday_closing_time')
          .eq('professional_id', body.professional_id)
          .maybeSingle();
        if (prefs) {
          proWorkSundays = prefs.work_sundays;
          proWorkSaturdays = prefs.work_saturdays;
          proSundayOpen = prefs.sunday_opening_time;
          proSundayClose = prefs.sunday_closing_time;
          proSaturdayOpen = prefs.saturday_opening_time;
          proSaturdayClose = prefs.saturday_closing_time;
        }
      }

      // Effective day-of-week toggle: professional override wins; otherwise global setting.
      const effectiveWorkSundays = proWorkSundays !== null ? proWorkSundays : !!businessSettings.work_sundays;
      const effectiveWorkSaturdays = proWorkSaturdays !== null ? proWorkSaturdays : !!businessSettings.work_saturdays;

      if (dayOfWeek === 0 && !effectiveWorkSundays) {
        errors.push({ field: 'start_time', message: 'Profissional/estabelecimento não atende aos domingos.' });
      }
      if (dayOfWeek === 6 && !effectiveWorkSaturdays) {
        errors.push({ field: 'start_time', message: 'Profissional/estabelecimento não atende aos sábados.' });
      }

      // Resolve effective opening/closing for the day (per-day fields fall back to global hours).
      let dayOpen = businessSettings.opening_time;
      let dayClose = businessSettings.closing_time;
      if (dayOfWeek === 0) {
        dayOpen = proSundayOpen || businessSettings.sunday_opening_time || businessSettings.opening_time;
        dayClose = proSundayClose || businessSettings.sunday_closing_time || businessSettings.closing_time;
      } else if (dayOfWeek === 6) {
        dayOpen = proSaturdayOpen || businessSettings.saturday_opening_time || businessSettings.opening_time;
        dayClose = proSaturdayClose || businessSettings.saturday_closing_time || businessSettings.closing_time;
      }

      const [openHour, openMinute] = String(dayOpen).split(':').map(Number);
      const [closeHour, closeMinute] = String(dayClose).split(':').map(Number);
      const startInMinutes = startHour * 60 + startMinutes;
      const endInMinutes = endHour * 60 + endMinutes;
      const openInMinutes = openHour * 60 + openMinute;
      const closeInMinutes = closeHour * 60 + closeMinute;

      console.log(`Time validation: dow=${dayOfWeek} LOCAL start=${startHour}:${startMinutes}, end=${endHour}:${endMinutes}, open=${dayOpen}, close=${dayClose}`);

      if (startInMinutes < openInMinutes || endInMinutes > closeInMinutes) {
        errors.push({
          field: 'time',
          message: `Horário fora do funcionamento do dia (${dayOpen} - ${dayClose}).`
        });
      }

      // Block scheduling on professional absences (vacation/leave/blocked period).
      if (body.professional_id) {
        const { data: absences } = await supabase
          .from('professional_absences')
          .select('start_date, end_date, reason')
          .eq('professional_id', body.professional_id)
          .lte('start_date', body.end_time)
          .gte('end_date', body.start_time);
        if (absences && absences.length > 0) {
          const reason = absences[0].reason || 'ausência registrada';
          errors.push({ field: 'professional_id', message: `Profissional indisponível neste período (${reason}).` });
        }
      }
    }

    if (errors.length > 0) {
      console.log('Validation errors:', JSON.stringify(errors));
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

    // 8. Check for professional time conflicts (skipped in legacy mode)
    if (body.professional_id && !body.legacy) {
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

    // 9. Check for room conflicts (skipped in legacy mode)
    if (body.room_id && !body.legacy) {
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

    // 10. Check for professional absences (skipped in legacy mode)
    if (body.professional_id && !body.legacy) {
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

    // 11. Check for equipment conflicts (skipped in legacy mode)
    if (body.legacy) {
      // Skip equipment validation block entirely
    } else {
    // Get equipment from the room if specified
    let newAppointmentEquipment: string[] = [];
    
    if (body.room_id) {
      const { data: roomData } = await supabase
        .from('rooms')
        .select('equipment')
        .eq('id', body.room_id)
        .single();
      
      if (roomData?.equipment && Array.isArray(roomData.equipment)) {
        newAppointmentEquipment = [...roomData.equipment];
      }
    }
    
    // Remove duplicates
    newAppointmentEquipment = [...new Set(newAppointmentEquipment)];
    
    if (newAppointmentEquipment.length > 0) {
      console.log('Checking equipment conflicts for:', newAppointmentEquipment);
      
      // Find overlapping appointments with rooms that have equipment
      const { data: overlappingAppointments } = await supabase
        .from('appointments')
        .select('id, room_id')
        .not('status', 'eq', 'cancelled')
        .not('room_id', 'is', null)
        .or(`and(start_time.lt.${body.end_time},end_time.gt.${body.start_time})`);
      
      if (overlappingAppointments && overlappingAppointments.length > 0) {
        // Get rooms for overlapping appointments
        const roomIds = [...new Set(overlappingAppointments.map(a => a.room_id).filter(Boolean))];
        
        if (roomIds.length > 0) {
          const { data: roomsData } = await supabase
            .from('rooms')
            .select('id, name, equipment')
            .in('id', roomIds);
          
          if (roomsData) {
            for (const room of roomsData) {
              if (room.equipment && Array.isArray(room.equipment)) {
                const conflictingEquipment = newAppointmentEquipment.filter(eq => room.equipment.includes(eq));
                
                if (conflictingEquipment.length > 0 && room.id !== body.room_id) {
                  errors.push({
                    field: 'equipment',
                    message: `Equipamento(s) "${conflictingEquipment.join(', ')}" já está em uso neste horário na sala "${room.name}"`
                  });
                  break; // Only report first conflict
                }
              }
            }
          }
        }
      }
    }
    } // end !legacy equipment block

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
        account_owner_id: callerOwner,
      })
      .select()
      .single();

    if (insertError) {
      // Idempotent recovery: a parallel duplicate request (double-click / retry)
      // already inserted this exact appointment. Return the existing active row
      // instead of failing the user-facing call.
      if ((insertError as any).code === '23505' && body.professional_id) {
        const { data: existing } = await supabase
          .from('appointments')
          .select()
          .eq('professional_id', body.professional_id)
          .eq('start_time', body.start_time)
          .not('status', 'in', '(cancelled,rescheduled)')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing) {
          console.log('Idempotent return of existing appointment:', existing.id);
          return new Response(
            JSON.stringify({ success: true, data: existing, idempotent: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create appointment', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Appointment created successfully:', appointment.id);

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
