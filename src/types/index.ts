export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  notes?: string;
  createdAt: Date;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  duration: number; // in minutes
  price: number;
  category: string;
  color: string;
}

export interface Appointment {
  id: string;
  clientId: string;
  client: Client;
  serviceId: string;
  service: Service;
  date: Date;
  time: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  notes?: string;
}

export type AppointmentStatus = Appointment['status'];
