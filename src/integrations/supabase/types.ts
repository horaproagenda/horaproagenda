export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          amount_paid: number | null
          client_id: string
          created_at: string
          end_time: string
          id: string
          notes: string | null
          payment_methods: string[] | null
          payment_status: string | null
          professional_id: string | null
          room_id: string | null
          service_id: string
          start_time: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_paid?: number | null
          client_id: string
          created_at?: string
          end_time: string
          id?: string
          notes?: string | null
          payment_methods?: string[] | null
          payment_status?: string | null
          professional_id?: string | null
          room_id?: string | null
          service_id: string
          start_time: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_paid?: number | null
          client_id?: string
          created_at?: string
          end_time?: string
          id?: string
          notes?: string | null
          payment_methods?: string[] | null
          payment_status?: string | null
          professional_id?: string | null
          room_id?: string | null
          service_id?: string
          start_time?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          closing_time: string
          created_at: string
          drag_and_drop_enabled: boolean
          id: string
          opening_time: string
          slot_interval: number
          updated_at: string
          work_saturdays: boolean
          work_sundays: boolean
        }
        Insert: {
          closing_time?: string
          created_at?: string
          drag_and_drop_enabled?: boolean
          id?: string
          opening_time?: string
          slot_interval?: number
          updated_at?: string
          work_saturdays?: boolean
          work_sundays?: boolean
        }
        Update: {
          closing_time?: string
          created_at?: string
          drag_and_drop_enabled?: boolean
          id?: string
          opening_time?: string
          slot_interval?: number
          updated_at?: string
          work_saturdays?: boolean
          work_sundays?: boolean
        }
        Relationships: []
      }
      client_documents: {
        Row: {
          client_id: string
          created_at: string
          description: string | null
          file_path: string | null
          file_url: string | null
          id: string
          title: string
          type: Database["public"]["Enums"]["document_type"]
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          description?: string | null
          file_path?: string | null
          file_url?: string | null
          id?: string
          title: string
          type: Database["public"]["Enums"]["document_type"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string | null
          file_path?: string | null
          file_url?: string | null
          id?: string
          title?: string
          type?: Database["public"]["Enums"]["document_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          assigned_professional_id: string | null
          birthdate: string | null
          complementary_info: string | null
          cpf: string | null
          created_at: string
          credit_balance: number
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string
          referral_source: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigned_professional_id?: string | null
          birthdate?: string | null
          complementary_info?: string | null
          cpf?: string | null
          created_at?: string
          credit_balance?: number
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone: string
          referral_source?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigned_professional_id?: string | null
          birthdate?: string | null
          complementary_info?: string | null
          cpf?: string | null
          created_at?: string
          credit_balance?: number
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string
          referral_source?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_assigned_professional_id_fkey"
            columns: ["assigned_professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          content: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          title: string
          updated_at: string
          updated_by: string | null
          variables: string[] | null
        }
        Insert: {
          content: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
          updated_by?: string | null
          variables?: string[] | null
        }
        Update: {
          content?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
          updated_by?: string | null
          variables?: string[] | null
        }
        Relationships: []
      }
      equipment: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          serial_number: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          serial_number?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          serial_number?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      package_appointments: {
        Row: {
          appointment_id: string | null
          created_at: string
          id: string
          notes: string | null
          package_id: string
          scheduled_date: string | null
          session_number: number
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          package_id: string
          scheduled_date?: string | null
          session_number: number
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          package_id?: string
          scheduled_date?: string | null
          session_number?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_appointments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_appointments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_templates: {
        Row: {
          created_at: string
          description: string | null
          duration: number
          equipment: string[] | null
          id: string
          interval_days: number | null
          is_active: boolean
          name: string
          price: number
          professional_id: string | null
          room_id: string | null
          total_sessions: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration?: number
          equipment?: string[] | null
          id?: string
          interval_days?: number | null
          is_active?: boolean
          name: string
          price: number
          professional_id?: string | null
          room_id?: string | null
          total_sessions?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration?: number
          equipment?: string[] | null
          id?: string
          interval_days?: number | null
          is_active?: boolean
          name?: string
          price?: number
          professional_id?: string | null
          room_id?: string | null
          total_sessions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_templates_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_templates_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          agenda_color: string | null
          app_role: string | null
          avatar_url: string | null
          bio: string | null
          birthdate: string | null
          commission_percentage: number | null
          cpf: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          is_commission_based: boolean | null
          name: string
          phone: string | null
          specialties: string[] | null
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          agenda_color?: string | null
          app_role?: string | null
          avatar_url?: string | null
          bio?: string | null
          birthdate?: string | null
          commission_percentage?: number | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_commission_based?: boolean | null
          name: string
          phone?: string | null
          specialties?: string[] | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          agenda_color?: string | null
          app_role?: string | null
          avatar_url?: string | null
          bio?: string | null
          birthdate?: string | null
          commission_percentage?: number | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_commission_based?: boolean | null
          name?: string
          phone?: string | null
          specialties?: string[] | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          client_id: string
          created_at: string
          id: string
          items: Json
          notes: string | null
          sent_at: string | null
          sent_via: string | null
          status: Database["public"]["Enums"]["quote_status"]
          total_amount: number
          updated_at: string
          updated_by: string | null
          valid_until: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          items?: Json
          notes?: string | null
          sent_at?: string | null
          sent_via?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          items?: Json
          notes?: string | null
          sent_at?: string | null
          sent_via?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          capacity: number | null
          created_at: string
          description: string | null
          equipment: string[] | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          equipment?: string[] | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          equipment?: string[] | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      service_packages: {
        Row: {
          auto_schedule: boolean
          category: string | null
          client_id: string | null
          created_at: string
          description: string | null
          duration: number | null
          equipment: string[] | null
          id: string
          interval_days: number | null
          is_active: boolean
          name: string
          payment_method: string | null
          payment_methods: string[] | null
          preferred_day_of_week: number | null
          preferred_time: string | null
          professional_id: string | null
          room_id: string | null
          sessions_scheduled: number
          template_id: string | null
          total_price: number
          total_sessions: number
          updated_at: string
          updated_by: string | null
          whatsapp_reminder: boolean
        }
        Insert: {
          auto_schedule?: boolean
          category?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          duration?: number | null
          equipment?: string[] | null
          id?: string
          interval_days?: number | null
          is_active?: boolean
          name: string
          payment_method?: string | null
          payment_methods?: string[] | null
          preferred_day_of_week?: number | null
          preferred_time?: string | null
          professional_id?: string | null
          room_id?: string | null
          sessions_scheduled?: number
          template_id?: string | null
          total_price: number
          total_sessions?: number
          updated_at?: string
          updated_by?: string | null
          whatsapp_reminder?: boolean
        }
        Update: {
          auto_schedule?: boolean
          category?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          duration?: number | null
          equipment?: string[] | null
          id?: string
          interval_days?: number | null
          is_active?: boolean
          name?: string
          payment_method?: string | null
          payment_methods?: string[] | null
          preferred_day_of_week?: number | null
          preferred_time?: string | null
          professional_id?: string | null
          room_id?: string | null
          sessions_scheduled?: number
          template_id?: string | null
          total_price?: number
          total_sessions?: number
          updated_at?: string
          updated_by?: string | null
          whatsapp_reminder?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "service_packages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_packages_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_packages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_packages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "package_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          category: string
          created_at: string
          description: string | null
          duration: number
          id: string
          is_active: boolean
          name: string
          price: number
          professional_id: string | null
          return_days: number | null
          room_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          duration?: number
          id?: string
          is_active?: boolean
          name: string
          price: number
          professional_id?: string | null
          return_days?: number | null
          room_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          duration?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          professional_id?: string | null
          return_days?: number | null
          room_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_photos: {
        Row: {
          appointment_id: string | null
          client_id: string
          created_at: string
          file_path: string
          file_url: string | null
          id: string
          notes: string | null
          stage: Database["public"]["Enums"]["treatment_stage"]
          taken_at: string
        }
        Insert: {
          appointment_id?: string | null
          client_id: string
          created_at?: string
          file_path: string
          file_url?: string | null
          id?: string
          notes?: string | null
          stage: Database["public"]["Enums"]["treatment_stage"]
          taken_at?: string
        }
        Update: {
          appointment_id?: string | null
          client_id?: string
          created_at?: string
          file_path?: string
          file_url?: string | null
          id?: string
          notes?: string | null
          stage?: Database["public"]["Enums"]["treatment_stage"]
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_photos_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_professional_id_for_user: {
        Args: { _user_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "receptionist" | "professional"
      appointment_status: "scheduled" | "confirmed" | "completed" | "cancelled"
      document_type: "anamnese" | "contract" | "quote" | "photo" | "other"
      quote_status: "draft" | "sent" | "accepted" | "rejected" | "expired"
      treatment_stage: "before" | "during" | "after"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "receptionist", "professional"],
      appointment_status: ["scheduled", "confirmed", "completed", "cancelled"],
      document_type: ["anamnese", "contract", "quote", "photo", "other"],
      quote_status: ["draft", "sent", "accepted", "rejected", "expired"],
      treatment_stage: ["before", "during", "after"],
    },
  },
} as const
