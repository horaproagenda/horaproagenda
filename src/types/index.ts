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