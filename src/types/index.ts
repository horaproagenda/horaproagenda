export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export type AppRole = 'admin' | 'receptionist' | 'professional';

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
  birthdate: string | null;
  notes: string | null;
  complementary_info: string | null;
  created_at: string;
  updated_at: string;
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
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
  room?: Room;
  professional?: Professional;
}

export interface PackageTemplate {
  id: string;
  name: string;
  description: string | null;
  total_sessions: number;
  price: number;
  duration: number;
  interval_days: number | null;
  professional_id: string | null;
  room_id: string | null;
  equipment: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  professional?: Professional;
  room?: Room;
}

export interface ServicePackage {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  client_id: string | null;
  template_id: string | null;
  total_sessions: number;
  sessions_scheduled: number;
  interval_days: number | null;
  auto_schedule: boolean;
  preferred_day_of_week: number | null;
  preferred_time: string | null;
  total_price: number;
  payment_method: string | null;
  payment_methods: string[];
  whatsapp_reminder: boolean;
  professional_id: string | null;
  room_id: string | null;
  duration: number;
  equipment: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  client?: Client;
  template?: PackageTemplate;
  professional?: Professional;
  room?: Room;
  appointments?: PackageAppointment[];
}

export type PackageAppointmentStatus = 'pending' | 'scheduled' | 'completed' | 'cancelled';

export interface PackageAppointment {
  id: string;
  package_id: string;
  appointment_id: string | null;
  session_number: number;
  scheduled_date: string | null;
  status: PackageAppointmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  appointment?: Appointment;
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

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled';

export interface Appointment {
  id: string;
  client_id: string;
  service_id: string;
  professional_id: string | null;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  client?: Client;
  service?: Service;
  professional?: Profile;
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