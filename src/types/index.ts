export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export type AppRole = 'admin' | 'receptionist' | 'professional' | 'super_admin';

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  cpf: string | null;
  birthdate: string | null;
  notes: string | null;
  complementary_info: string | null;
  is_active: boolean;
  referral_source: string | null;
  credit_balance: number;
  assigned_professional_id: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  registration_source?: string | null;
  assigned_professional?: Professional;
}

export interface Room {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  equipment: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Professional {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  birthdate: string | null;
  specialties: string[];
  bio: string | null;
  avatar_url: string | null;
  agenda_color: string | null;
  app_role: string | null;
  is_commission_based: boolean | null;
  commission_percentage: number | null;
  commission_type: string | null;
  commission_fixed_value: number | null;
  commission_frequency: string | null;
  commission_payment_day: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export interface ServiceComponent {
  service_id: string;
  interval_days: number;
  price: number;
}


export interface Service {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  price: number;
  category: string;
  return_days: number | null;
  is_active: boolean;
  room_id: string | null;
  professional_id: string | null;
  equipment: string[];
  component_service_ids?: string[];
  service_components?: ServiceComponent[] | any;
  created_at: string;
  updated_at: string;
  room?: Room;
  professional?: Professional;
}

export interface PackageTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  total_sessions: number;
  price: number;
  duration: number;
  interval_days: number | null;
  service_id?: string | null;
  package_type?: 'standard' | 'sequential';
  professional_id: string | null;
  room_id: string | null;
  equipment: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  professional?: Professional;
  room?: Room;
  steps?: PackageTemplateStep[];
}

export interface PackageTemplateStep {
  id: string;
  template_id: string;
  service_id: string;
  sequence_order: number;
  interval_after_days: number;
  service?: Service;
}

export interface ServicePackage {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  client_id: string | null;
  template_id: string | null;
  service_id: string | null;
  package_type?: 'standard' | 'sequential';
  total_sessions: number;
  sessions_scheduled: number;
  interval_days: number | null;
  auto_schedule: boolean;
  preferred_day_of_week: number | null;
  preferred_time: string | null;
  total_price: number;
  payment_method: string | null;
  payment_methods: string[];
  payment_type: 'full' | 'per_session' | null;
  whatsapp_reminder: boolean;
  professional_id: string | null;
  room_id: string | null;
  duration: number;
  equipment: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  client?: Client;
  template?: PackageTemplate;
  professional?: Professional;
  room?: Room;
  service?: Service;
  appointments?: PackageAppointment[];
  steps?: PackageTemplateStep[];
}

export type PackageAppointmentStatus = 'pending' | 'scheduled' | 'completed' | 'cancelled' | 'missed' | 'rescheduled';

export interface PackageAppointment {
  id: string;
  package_id: string;
  appointment_id: string | null;
  service_id?: string | null;
  session_number: number;
  original_session_number?: number;
  sequence_order?: number | null;
  interval_after_days?: number | null;
  scheduled_date: string | null;
  status: PackageAppointmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  appointment?: Appointment;
  package?: ServicePackage;
}

export interface DocumentTemplate {
  id: string;
  title: string;
  description: string | null;
  content: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'missed' | 'rescheduled';

export type PaymentStatus = 'pending' | 'partial' | 'paid';

export interface Appointment {
  id: string;
  client_id: string;
  service_id: string | null;
  professional_id: string | null;
  room_id: string | null;
  package_appointment_id: string | null;
  recurring_group_id: string | null;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  payment_status: PaymentStatus;
  payment_methods: string[];
  amount_paid: number;
  notes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  // Joined data
  client?: Client;
  service?: Service;
  professional?: Professional;
  room?: Room;
  package_appointment?: PackageAppointment;
  additional_items?: AppointmentAdditionalItem[];
  created_by_profile?: { full_name: string } | null;
  updated_by_profile?: { full_name: string } | null;
}

export interface AppointmentAdditionalItem {
  id?: string;
  appointment_id?: string;
  item_type: 'service' | 'product';
  service_id?: string | null;
  product_id?: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  notes?: string | null;
  service?: Pick<Service, 'id' | 'name'> | null;
  product?: { id: string; name: string } | null;
}

export interface AppointmentEditLock {
  id: string;
  appointment_id: string;
  user_id: string;
  user_email: string | null;
  holder_name: string | null;
  session_id: string;
  locked_at: string;
  expires_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export type DocumentType = 'anamnese' | 'contract' | 'quote' | 'photo' | 'other';

export interface ClientDocument {
  id: string;
  client_id: string;
  type: DocumentType;
  title: string;
  description: string | null;
  file_path: string | null;
  file_url: string | null;
  content?: string | null;
  template_id?: string | null;
  filled_variables?: Record<string, unknown> | null;
  signed_at?: string | null;
  signed_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type TreatmentStage = 'before' | 'during' | 'after';

export interface TreatmentPhoto {
  id: string;
  client_id: string;
  appointment_id: string | null;
  stage: TreatmentStage;
  file_path: string;
  file_url: string | null;
  notes: string | null;
  taken_at: string;
  created_at: string;
  appointment?: Appointment;
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

export interface QuoteItem {
  service_id: string;
  service_name: string;
  item_type?: 'service' | 'package';
  discount_amount?: number;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Quote {
  id: string;
  client_id: string;
  status: QuoteStatus;
  items: QuoteItem[];
  total_amount: number;
  notes: string | null;
  sent_via: string | null;
  sent_at: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
}