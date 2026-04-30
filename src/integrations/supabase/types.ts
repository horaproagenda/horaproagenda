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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointment_additional_items: {
        Row: {
          appointment_id: string
          created_at: string
          created_by: string | null
          id: string
          item_type: string
          notes: string | null
          product_id: string | null
          professional_id: string | null
          quantity: number
          service_id: string | null
          total_amount: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_type: string
          notes?: string | null
          product_id?: string | null
          professional_id?: string | null
          quantity?: number
          service_id?: string | null
          total_amount?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_type?: string
          notes?: string | null
          product_id?: string | null
          professional_id?: string | null
          quantity?: number
          service_id?: string | null
          total_amount?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_additional_items_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_additional_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_additional_items_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_additional_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_edit_locks: {
        Row: {
          appointment_id: string
          created_at: string
          expires_at: string
          holder_name: string | null
          id: string
          last_seen_at: string
          locked_at: string
          session_id: string
          updated_at: string
          user_email: string | null
          user_id: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          expires_at?: string
          holder_name?: string | null
          id?: string
          last_seen_at?: string
          locked_at?: string
          session_id: string
          updated_at?: string
          user_email?: string | null
          user_id: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          expires_at?: string
          holder_name?: string | null
          id?: string
          last_seen_at?: string
          locked_at?: string
          session_id?: string
          updated_at?: string
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      appointment_product_consumption: {
        Row: {
          appointment_id: string
          created_at: string
          id: string
          product_id: string
          quantity_used: number
          source_id: string
          source_type: string
        }
        Insert: {
          appointment_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity_used?: number
          source_id: string
          source_type: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity_used?: number
          source_id?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_product_consumption_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_product_consumption_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          amount_paid: number | null
          client_id: string
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          notes: string | null
          package_appointment_id: string | null
          payment_methods: string[] | null
          payment_status: string | null
          professional_id: string | null
          recurring_group_id: string | null
          room_id: string | null
          service_id: string | null
          start_time: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          amount_paid?: number | null
          client_id: string
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          notes?: string | null
          package_appointment_id?: string | null
          payment_methods?: string[] | null
          payment_status?: string | null
          professional_id?: string | null
          recurring_group_id?: string | null
          room_id?: string | null
          service_id?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          amount_paid?: number | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          notes?: string | null
          package_appointment_id?: string | null
          payment_methods?: string[] | null
          payment_status?: string | null
          professional_id?: string | null
          recurring_group_id?: string | null
          room_id?: string | null
          service_id?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          updated_by?: string | null
          version?: number
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
            foreignKeyName: "appointments_package_appointment_id_fkey"
            columns: ["package_appointment_id"]
            isOneToOne: false
            referencedRelation: "package_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
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
      audit_log: {
        Row: {
          command_tag: string | null
          detail: Json | null
          event_time: string | null
          event_type: string | null
          id: number
          object_identity: string | null
          object_type: string | null
          role_name: string | null
          sql_text: string | null
          username: string | null
        }
        Insert: {
          command_tag?: string | null
          detail?: Json | null
          event_time?: string | null
          event_type?: string | null
          id?: number
          object_identity?: string | null
          object_type?: string | null
          role_name?: string | null
          sql_text?: string | null
          username?: string | null
        }
        Update: {
          command_tag?: string | null
          detail?: Json | null
          event_time?: string | null
          event_type?: string | null
          id?: number
          object_identity?: string | null
          object_type?: string | null
          role_name?: string | null
          sql_text?: string | null
          username?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      banks: {
        Row: {
          account_number: string | null
          agency: string | null
          bank_code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_number?: string | null
          agency?: string | null
          bank_code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_number?: string | null
          agency?: string | null
          bank_code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      boleto_installments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          installment_number: number
          notes: string | null
          paid_date: string | null
          sale_id: string
          status: string
          total_installments: number
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          due_date: string
          id?: string
          installment_number: number
          notes?: string | null
          paid_date?: string | null
          sale_id: string
          status?: string
          total_installments: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          installment_number?: number
          notes?: string | null
          paid_date?: string | null
          sale_id?: string
          status?: string
          total_installments?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "boleto_installments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "single_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          auto_complete_appointments: boolean
          automation_gap_finder: boolean | null
          automation_occupancy_dashboard: boolean | null
          automation_smart_recurrence: boolean | null
          automation_waitlist: boolean | null
          automation_whatsapp_reminders: boolean | null
          clinic_address: string | null
          clinic_cnpj: string | null
          clinic_name: string | null
          clinic_phone: string | null
          closing_time: string
          created_at: string
          drag_and_drop_enabled: boolean
          id: string
          opening_time: string
          saturday_closing_time: string | null
          saturday_opening_time: string | null
          slot_interval: number
          sunday_closing_time: string | null
          sunday_opening_time: string | null
          timezone: string | null
          updated_at: string
          work_saturdays: boolean
          work_sundays: boolean
        }
        Insert: {
          auto_complete_appointments?: boolean
          automation_gap_finder?: boolean | null
          automation_occupancy_dashboard?: boolean | null
          automation_smart_recurrence?: boolean | null
          automation_waitlist?: boolean | null
          automation_whatsapp_reminders?: boolean | null
          clinic_address?: string | null
          clinic_cnpj?: string | null
          clinic_name?: string | null
          clinic_phone?: string | null
          closing_time?: string
          created_at?: string
          drag_and_drop_enabled?: boolean
          id?: string
          opening_time?: string
          saturday_closing_time?: string | null
          saturday_opening_time?: string | null
          slot_interval?: number
          sunday_closing_time?: string | null
          sunday_opening_time?: string | null
          timezone?: string | null
          updated_at?: string
          work_saturdays?: boolean
          work_sundays?: boolean
        }
        Update: {
          auto_complete_appointments?: boolean
          automation_gap_finder?: boolean | null
          automation_occupancy_dashboard?: boolean | null
          automation_smart_recurrence?: boolean | null
          automation_waitlist?: boolean | null
          automation_whatsapp_reminders?: boolean | null
          clinic_address?: string | null
          clinic_cnpj?: string | null
          clinic_name?: string | null
          clinic_phone?: string | null
          closing_time?: string
          created_at?: string
          drag_and_drop_enabled?: boolean
          id?: string
          opening_time?: string
          saturday_closing_time?: string | null
          saturday_opening_time?: string | null
          slot_interval?: number
          sunday_closing_time?: string | null
          sunday_opening_time?: string | null
          timezone?: string | null
          updated_at?: string
          work_saturdays?: boolean
          work_sundays?: boolean
        }
        Relationships: []
      }
      card_brand_fees: {
        Row: {
          card_brand_id: string
          created_at: string
          fee_percentage: number
          id: string
          installment_number: number
          updated_at: string
        }
        Insert: {
          card_brand_id: string
          created_at?: string
          fee_percentage?: number
          id?: string
          installment_number?: number
          updated_at?: string
        }
        Update: {
          card_brand_id?: string
          created_at?: string
          fee_percentage?: number
          id?: string
          installment_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_brand_fees_card_brand_id_fkey"
            columns: ["card_brand_id"]
            isOneToOne: false
            referencedRelation: "card_brands"
            referencedColumns: ["id"]
          },
        ]
      }
      card_brands: {
        Row: {
          created_at: string
          created_by: string | null
          fee_behavior: string
          id: string
          is_active: boolean
          name: string
          type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fee_behavior?: string
          id?: string
          is_active?: boolean
          name: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fee_behavior?: string
          id?: string
          is_active?: boolean
          name?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      cash_register_entries: {
        Row: {
          affects_cash: boolean | null
          amount: number | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          payment_method: string | null
          single_sale_id: string | null
        }
        Insert: {
          affects_cash?: boolean | null
          amount?: number | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          payment_method?: string | null
          single_sale_id?: string | null
        }
        Update: {
          affects_cash?: boolean | null
          amount?: number | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          payment_method?: string | null
          single_sale_id?: string | null
        }
        Relationships: []
      }
      cash_registers: {
        Row: {
          bank_deposits: Json | null
          cash_amount: number | null
          check_amount: number | null
          closed_at: string | null
          closed_by: string | null
          closing_balance: number | null
          created_at: string
          difference: number | null
          expected_balance: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_balance: number
          payment_breakdown: Json | null
          payments_count: number | null
          status: string
          total_receivables: number | null
          total_received: number | null
          updated_at: string
        }
        Insert: {
          bank_deposits?: Json | null
          cash_amount?: number | null
          check_amount?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_balance?: number | null
          created_at?: string
          difference?: number | null
          expected_balance?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_balance?: number
          payment_breakdown?: Json | null
          payments_count?: number | null
          status?: string
          total_receivables?: number | null
          total_received?: number | null
          updated_at?: string
        }
        Update: {
          bank_deposits?: Json | null
          cash_amount?: number | null
          check_amount?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_balance?: number | null
          created_at?: string
          difference?: number | null
          expected_balance?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_balance?: number
          payment_breakdown?: Json | null
          payments_count?: number | null
          status?: string
          total_receivables?: number | null
          total_received?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      cash_transactions: {
        Row: {
          amount: number
          bank_id: string | null
          card_fee_amount: number | null
          cash_register_id: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          installments: number | null
          payment_method: string | null
          reference_id: string | null
          reference_type: string | null
          type: string
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_id?: string | null
          card_fee_amount?: number | null
          cash_register_id?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          installments?: number | null
          payment_method?: string | null
          reference_id?: string | null
          reference_type?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_id?: string | null
          card_fee_amount?: number | null
          cash_register_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          installments?: number | null
          payment_method?: string | null
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
        ]
      }
      client_credit_transactions: {
        Row: {
          amount: number
          appointment_id: string | null
          client_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          new_balance: number
          previous_balance: number
          professional_id: string | null
          sale_id: string | null
          transaction_type: string
        }
        Insert: {
          amount?: number
          appointment_id?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          new_balance?: number
          previous_balance?: number
          professional_id?: string | null
          sale_id?: string | null
          transaction_type: string
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          new_balance?: number
          previous_balance?: number
          professional_id?: string | null
          sale_id?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_credit_transactions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      client_documents: {
        Row: {
          client_id: string
          content: string | null
          created_at: string
          description: string | null
          file_path: string | null
          file_url: string | null
          filled_variables: Json | null
          id: string
          signed_at: string | null
          signed_by: string | null
          template_id: string | null
          title: string
          type: Database["public"]["Enums"]["document_type"]
          updated_at: string
        }
        Insert: {
          client_id: string
          content?: string | null
          created_at?: string
          description?: string | null
          file_path?: string | null
          file_url?: string | null
          filled_variables?: Json | null
          id?: string
          signed_at?: string | null
          signed_by?: string | null
          template_id?: string | null
          title: string
          type: Database["public"]["Enums"]["document_type"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          content?: string | null
          created_at?: string
          description?: string | null
          file_path?: string | null
          file_url?: string | null
          filled_variables?: Json | null
          id?: string
          signed_at?: string | null
          signed_by?: string | null
          template_id?: string | null
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
          {
            foreignKeyName: "client_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_services: {
        Row: {
          amount_paid: number
          appointment_id: string | null
          client_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          notes: string | null
          sale_id: string | null
          service_id: string
          status: string
          updated_at: string
          used_at: string | null
        }
        Insert: {
          amount_paid?: number
          appointment_id?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          sale_id?: string | null
          service_id: string
          status?: string
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          amount_paid?: number
          appointment_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          sale_id?: string | null
          service_id?: string
          status?: string
          updated_at?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_services_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_services_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_services_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "single_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
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
      document_fill_links: {
        Row: {
          client_id: string | null
          created_at: string
          expires_at: string | null
          filled_at: string | null
          filled_content: string | null
          filled_variables: Json | null
          id: string
          professional_id: string | null
          status: string | null
          template_id: string
          token: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          expires_at?: string | null
          filled_at?: string | null
          filled_content?: string | null
          filled_variables?: Json | null
          id?: string
          professional_id?: string | null
          status?: string | null
          template_id: string
          token: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          expires_at?: string | null
          filled_at?: string | null
          filled_content?: string | null
          filled_variables?: Json | null
          id?: string
          professional_id?: string | null
          status?: string | null
          template_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_fill_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_fill_links_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_fill_links_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
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
      financial_categories: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_recurring: boolean
          name: string
          type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          name: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          name?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      financial_entries: {
        Row: {
          amount: number
          appointment_id: string | null
          bank_id: string | null
          category_id: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string
          id: string
          installments: number | null
          is_recurring: boolean
          notes: string | null
          paid_by: string | null
          paid_date: string | null
          payment_method_id: string | null
          professional_id: string | null
          recurring_count: number | null
          recurring_day: number | null
          recurring_frequency: string | null
          status: string
          type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount?: number
          appointment_id?: string | null
          bank_id?: string | null
          category_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date: string
          id?: string
          installments?: number | null
          is_recurring?: boolean
          notes?: string | null
          paid_by?: string | null
          paid_date?: string | null
          payment_method_id?: string | null
          professional_id?: string | null
          recurring_count?: number | null
          recurring_day?: number | null
          recurring_frequency?: string | null
          status?: string
          type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          bank_id?: string | null
          category_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string
          id?: string
          installments?: number | null
          is_recurring?: boolean
          notes?: string | null
          paid_by?: string | null
          paid_date?: string | null
          payment_method_id?: string | null
          professional_id?: string | null
          recurring_count?: number | null
          recurring_day?: number | null
          recurring_frequency?: string | null
          status?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_entries_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string
          created_by: string | null
          current_value: number
          description: string | null
          end_date: string
          id: string
          is_active: boolean
          name: string
          service_id: string | null
          start_date: string
          status: string
          target_value: number
          type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_value?: number
          description?: string | null
          end_date: string
          id?: string
          is_active?: boolean
          name: string
          service_id?: string | null
          start_date: string
          status?: string
          target_value: number
          type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_value?: number
          description?: string | null
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          service_id?: string | null
          start_date?: string
          status?: string
          target_value?: number
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      index_audit_candidates: {
        Row: {
          detected_at: string | null
          id: number
          idx_scan: number | null
          idx_tup_fetch: number | null
          idx_tup_read: number | null
          index_name: string
          schema_name: string
          table_name: string
        }
        Insert: {
          detected_at?: string | null
          id?: number
          idx_scan?: number | null
          idx_tup_fetch?: number | null
          idx_tup_read?: number | null
          index_name: string
          schema_name: string
          table_name: string
        }
        Update: {
          detected_at?: string | null
          id?: number
          idx_scan?: number | null
          idx_tup_fetch?: number | null
          idx_tup_read?: number | null
          index_name?: string
          schema_name?: string
          table_name?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: Json | null
          created_at: string | null
          direction: string
          error: string | null
          id: string
          provider: string | null
          provider_message_id: string | null
          room_id: string
          sender_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          content?: Json | null
          created_at?: string | null
          direction?: string
          error?: string | null
          id?: string
          provider?: string | null
          provider_message_id?: string | null
          room_id: string
          sender_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: Json | null
          created_at?: string | null
          direction?: string
          error?: string | null
          id?: string
          provider?: string | null
          provider_message_id?: string | null
          room_id?: string
          sender_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      monitor_jobs: {
        Row: {
          created_at: string | null
          id: number
          job_name: string
          schedule_interval: string
          target_table: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          job_name: string
          schedule_interval: string
          target_table: string
        }
        Update: {
          created_at?: string | null
          id?: number
          job_name?: string
          schedule_interval?: string
          target_table?: string
        }
        Relationships: []
      }
      package_appointment_history: {
        Row: {
          appointment_id: string | null
          change_reason: string
          changed_by: string | null
          created_at: string
          id: string
          metadata: Json
          new_scheduled_date: string | null
          new_status: string | null
          package_appointment_id: string
          package_id: string
          previous_scheduled_date: string | null
          previous_status: string | null
        }
        Insert: {
          appointment_id?: string | null
          change_reason?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_scheduled_date?: string | null
          new_status?: string | null
          package_appointment_id: string
          package_id: string
          previous_scheduled_date?: string | null
          previous_status?: string | null
        }
        Update: {
          appointment_id?: string | null
          change_reason?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_scheduled_date?: string | null
          new_status?: string | null
          package_appointment_id?: string
          package_id?: string
          previous_scheduled_date?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "package_appointment_history_package_appointment_id_fkey"
            columns: ["package_appointment_id"]
            isOneToOne: false
            referencedRelation: "package_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_appointment_history_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_appointments: {
        Row: {
          appointment_id: string | null
          created_at: string
          id: string
          interval_after_days: number
          notes: string | null
          original_session_number: number
          package_id: string
          scheduled_date: string | null
          sequence_order: number | null
          service_id: string | null
          session_number: number
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          interval_after_days?: number
          notes?: string | null
          original_session_number: number
          package_id: string
          scheduled_date?: string | null
          sequence_order?: number | null
          service_id?: string | null
          session_number: number
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          interval_after_days?: number
          notes?: string | null
          original_session_number?: number
          package_id?: string
          scheduled_date?: string | null
          sequence_order?: number | null
          service_id?: string | null
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
      package_template_products: {
        Row: {
          container_amount: number | null
          container_unit: string | null
          created_at: string
          estimated_appointments: number | null
          id: string
          notes: string | null
          product_id: string
          quantity_per_use: number
          template_id: string
          tracking_method: string | null
          updated_at: string
        }
        Insert: {
          container_amount?: number | null
          container_unit?: string | null
          created_at?: string
          estimated_appointments?: number | null
          id?: string
          notes?: string | null
          product_id: string
          quantity_per_use?: number
          template_id: string
          tracking_method?: string | null
          updated_at?: string
        }
        Update: {
          container_amount?: number | null
          container_unit?: string | null
          created_at?: string
          estimated_appointments?: number | null
          id?: string
          notes?: string | null
          product_id?: string
          quantity_per_use?: number
          template_id?: string
          tracking_method?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_template_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_template_products_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "package_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      package_template_steps: {
        Row: {
          created_at: string
          id: string
          interval_after_days: number
          sequence_order: number
          service_id: string
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          interval_after_days?: number
          sequence_order: number
          service_id: string
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          interval_after_days?: number
          sequence_order?: number
          service_id?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      package_templates: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          duration: number
          equipment: string[] | null
          id: string
          interval_days: number | null
          is_active: boolean
          name: string
          package_type: string
          payment_type: string | null
          price: number
          professional_id: string | null
          room_id: string | null
          total_sessions: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          duration?: number
          equipment?: string[] | null
          id?: string
          interval_days?: number | null
          is_active?: boolean
          name: string
          package_type?: string
          payment_type?: string | null
          price: number
          professional_id?: string | null
          room_id?: string | null
          total_sessions?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          duration?: number
          equipment?: string[] | null
          id?: string
          interval_days?: number | null
          is_active?: boolean
          name?: string
          package_type?: string
          payment_type?: string | null
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
      payment_methods: {
        Row: {
          card_fee: number | null
          created_at: string
          created_by: string | null
          debit_fee: number | null
          description: string | null
          id: string
          installment_fee: number | null
          is_active: boolean
          max_installments: number | null
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          card_fee?: number | null
          created_at?: string
          created_by?: string | null
          debit_fee?: number | null
          description?: string | null
          id?: string
          installment_fee?: number | null
          is_active?: boolean
          max_installments?: number | null
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          card_fee?: number | null
          created_at?: string
          created_by?: string | null
          debit_fee?: number | null
          description?: string | null
          id?: string
          installment_fee?: number | null
          is_active?: boolean
          max_installments?: number | null
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      payments_audit: {
        Row: {
          amount: number | null
          client_id: string | null
          created_at: string | null
          id: string
          note: string | null
          payment_method: string | null
          payment_type: string | null
          processed_by: string | null
          single_sale_id: string | null
        }
        Insert: {
          amount?: number | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          note?: string | null
          payment_method?: string | null
          payment_type?: string | null
          processed_by?: string | null
          single_sale_id?: string | null
        }
        Update: {
          amount?: number | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          note?: string | null
          payment_method?: string | null
          payment_type?: string | null
          processed_by?: string | null
          single_sale_id?: string | null
        }
        Relationships: []
      }
      phone_contacts: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string
          phone: string
          room_id: string
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          phone: string
          room_id?: string
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          phone?: string
          room_id?: string
        }
        Relationships: []
      }
      policies_backup: {
        Row: {
          dumped_at: string | null
          id: number
          policy_cmd: string | null
          policy_name: string | null
          table_name: string | null
          table_schema: string | null
          using_expr: string | null
          with_check: string | null
        }
        Insert: {
          dumped_at?: string | null
          id?: number
          policy_cmd?: string | null
          policy_name?: string | null
          table_name?: string | null
          table_schema?: string | null
          using_expr?: string | null
          with_check?: string | null
        }
        Update: {
          dumped_at?: string | null
          id?: number
          policy_cmd?: string | null
          policy_name?: string | null
          table_name?: string | null
          table_schema?: string | null
          using_expr?: string | null
          with_check?: string | null
        }
        Relationships: []
      }
      product_daily_consumption: {
        Row: {
          appointment_id: string | null
          consumption_date: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          product_id: string
          professional_id: string | null
          quantity_used: number
          service_id: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          consumption_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id: string
          professional_id?: string | null
          quantity_used?: number
          service_id?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          consumption_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          professional_id?: string | null
          quantity_used?: number
          service_id?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_daily_consumption_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_daily_consumption_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_daily_consumption_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_daily_consumption_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      product_purchases: {
        Row: {
          created_at: string
          created_by: string | null
          duration_days: number | null
          finished_at: string | null
          id: string
          notes: string | null
          product_id: string
          purchase_date: string
          quantity: number
          started_using_at: string | null
          supplier: string | null
          supplier_id: string | null
          total_price: number
          unit_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duration_days?: number | null
          finished_at?: string | null
          id?: string
          notes?: string | null
          product_id: string
          purchase_date?: string
          quantity?: number
          started_using_at?: string | null
          supplier?: string | null
          supplier_id?: string | null
          total_price?: number
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duration_days?: number | null
          finished_at?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          purchase_date?: string
          quantity?: number
          started_using_at?: string | null
          supplier?: string | null
          supplier_id?: string | null
          total_price?: number
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category: string | null
          created_at: string
          created_by: string | null
          current_stock: number
          description: string | null
          expiry_date: string | null
          finished_at: string | null
          id: string
          is_active: boolean
          is_for_sale: boolean
          min_stock_alert: number | null
          name: string
          notes: string | null
          product_type: string
          purchase_date: string | null
          quantity_purchased: number
          sale_price: number | null
          started_using_at: string | null
          supplier: string | null
          supplier_id: string | null
          total_price: number
          unit: string
          unit_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          current_stock?: number
          description?: string | null
          expiry_date?: string | null
          finished_at?: string | null
          id?: string
          is_active?: boolean
          is_for_sale?: boolean
          min_stock_alert?: number | null
          name: string
          notes?: string | null
          product_type?: string
          purchase_date?: string | null
          quantity_purchased?: number
          sale_price?: number | null
          started_using_at?: string | null
          supplier?: string | null
          supplier_id?: string | null
          total_price?: number
          unit?: string
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          current_stock?: number
          description?: string | null
          expiry_date?: string | null
          finished_at?: string | null
          id?: string
          is_active?: boolean
          is_for_sale?: boolean
          min_stock_alert?: number | null
          name?: string
          notes?: string | null
          product_type?: string
          purchase_date?: string | null
          quantity_purchased?: number
          sale_price?: number | null
          started_using_at?: string | null
          supplier?: string | null
          supplier_id?: string | null
          total_price?: number
          unit?: string
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_absences: {
        Row: {
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          notes: string | null
          professional_id: string
          reason: string | null
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          notes?: string | null
          professional_id: string
          reason?: string | null
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          notes?: string | null
          professional_id?: string
          reason?: string | null
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_absences_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
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
          permissions: Json | null
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
          permissions?: Json | null
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
          permissions?: Json | null
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
      reminders: {
        Row: {
          category: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_completed: boolean
          is_recurring: boolean
          priority: string | null
          recurring_days: number[] | null
          recurring_frequency: string | null
          reminder_date: string | null
          reminder_time: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_completed?: boolean
          is_recurring?: boolean
          priority?: string | null
          recurring_days?: number[] | null
          recurring_frequency?: string | null
          reminder_date?: string | null
          reminder_time?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_completed?: boolean
          is_recurring?: boolean
          priority?: string | null
          recurring_days?: number[] | null
          recurring_frequency?: string | null
          reminder_date?: string | null
          reminder_time?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      room_members: {
        Row: {
          created_at: string | null
          id: string
          role: string | null
          room_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: string | null
          room_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string | null
          room_id?: string
          user_id?: string
        }
        Relationships: []
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
          package_type: string
          payment_method: string | null
          payment_methods: string[] | null
          payment_type: string | null
          preferred_day_of_week: number | null
          preferred_time: string | null
          professional_id: string | null
          room_id: string | null
          service_id: string | null
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
          package_type?: string
          payment_method?: string | null
          payment_methods?: string[] | null
          payment_type?: string | null
          preferred_day_of_week?: number | null
          preferred_time?: string | null
          professional_id?: string | null
          room_id?: string | null
          service_id?: string | null
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
          package_type?: string
          payment_method?: string | null
          payment_methods?: string[] | null
          payment_type?: string | null
          preferred_day_of_week?: number | null
          preferred_time?: string | null
          professional_id?: string | null
          room_id?: string | null
          service_id?: string | null
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
            foreignKeyName: "service_packages_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
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
      service_products: {
        Row: {
          container_amount: number | null
          container_unit: string | null
          created_at: string
          estimated_appointments: number | null
          id: string
          notes: string | null
          product_id: string
          quantity_per_use: number
          service_id: string
          tracking_method: string | null
          updated_at: string
        }
        Insert: {
          container_amount?: number | null
          container_unit?: string | null
          created_at?: string
          estimated_appointments?: number | null
          id?: string
          notes?: string | null
          product_id: string
          quantity_per_use?: number
          service_id: string
          tracking_method?: string | null
          updated_at?: string
        }
        Update: {
          container_amount?: number | null
          container_unit?: string | null
          created_at?: string
          estimated_appointments?: number | null
          id?: string
          notes?: string | null
          product_id?: string
          quantity_per_use?: number
          service_id?: string
          tracking_method?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_products_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
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
          equipment: string[] | null
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
          equipment?: string[] | null
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
          equipment?: string[] | null
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
      single_sales: {
        Row: {
          bank_id: string | null
          card_fee_amount: number | null
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          discount_amount: number
          final_amount: number
          id: string
          installments: number | null
          item_type: string | null
          notes: string | null
          original_amount: number
          package_id: string | null
          paid_at: string | null
          paid_by: string | null
          payment_method_id: string | null
          sale_date: string
          service_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bank_id?: string | null
          card_fee_amount?: number | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_amount?: number
          final_amount?: number
          id?: string
          installments?: number | null
          item_type?: string | null
          notes?: string | null
          original_amount?: number
          package_id?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_method_id?: string | null
          sale_date?: string
          service_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bank_id?: string | null
          card_fee_amount?: number | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_amount?: number
          final_amount?: number
          id?: string
          installments?: number | null
          item_type?: string | null
          notes?: string | null
          original_amount?: number
          package_id?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_method_id?: string | null
          sale_date?: string
          service_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "single_sales_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "single_sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "single_sales_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "single_sales_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "single_sales_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      supabase_migrations: {
        Row: {
          applied_by: string | null
          created_at: string | null
          name: string
          status: string
          version: string
        }
        Insert: {
          applied_by?: string | null
          created_at?: string | null
          name: string
          status: string
          version: string
        }
        Update: {
          applied_by?: string | null
          created_at?: string | null
          name?: string
          status?: string
          version?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          cnpj: string | null
          company_name: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          municipal_registration: string | null
          name: string
          notes: string | null
          phone: string | null
          state_registration: string | null
          uf: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          cnpj?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          municipal_registration?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          state_registration?: string | null
          uf?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          cnpj?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          municipal_registration?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          state_registration?: string | null
          uf?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      trial_registrations: {
        Row: {
          cnpj: string | null
          company_name: string | null
          created_at: string
          email: string
          full_name: string
          has_paid: boolean | null
          id: string
          phone: string | null
          subscription_status: string | null
          trial_days: number | null
          trial_ended_at: string | null
          trial_started_at: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cnpj?: string | null
          company_name?: string | null
          created_at?: string
          email: string
          full_name: string
          has_paid?: boolean | null
          id?: string
          phone?: string | null
          subscription_status?: string | null
          trial_days?: number | null
          trial_ended_at?: string | null
          trial_started_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cnpj?: string | null
          company_name?: string | null
          created_at?: string
          email?: string
          full_name?: string
          has_paid?: boolean | null
          id?: string
          phone?: string | null
          subscription_status?: string | null
          trial_days?: number | null
          trial_ended_at?: string | null
          trial_started_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
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
      verification_codes: {
        Row: {
          code: string
          created_at: string
          email: string
          expires_at: string
          id: string
          type: string
          used_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          type?: string
          used_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          type?: string
          used_at?: string | null
        }
        Relationships: []
      }
      whatsapp_logs: {
        Row: {
          created_at: string | null
          detail: Json | null
          event: string | null
          id: number
          queue_id: string | null
        }
        Insert: {
          created_at?: string | null
          detail?: Json | null
          event?: string | null
          id?: number
          queue_id?: string | null
        }
        Update: {
          created_at?: string | null
          detail?: Json | null
          event?: string | null
          id?: number
          queue_id?: string | null
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          created_at: string | null
          direction: string | null
          from_number: string | null
          id: string
          provider_message_id: string | null
          provider_payload: Json | null
          status: string | null
          to_number: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          direction?: string | null
          from_number?: string | null
          id?: string
          provider_message_id?: string | null
          provider_payload?: Json | null
          status?: string | null
          to_number?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          direction?: string | null
          from_number?: string | null
          id?: string
          provider_message_id?: string | null
          provider_payload?: Json | null
          status?: string | null
          to_number?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      whatsapp_queue: {
        Row: {
          client_id: string | null
          created_at: string | null
          document_path: string | null
          id: string
          last_error: string | null
          payload: Json | null
          phone: string
          scheduled_at: string | null
          status: string
          template: string | null
          tries: number
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          document_path?: string | null
          id?: string
          last_error?: string | null
          payload?: Json | null
          phone: string
          scheduled_at?: string | null
          status?: string
          template?: string | null
          tries?: number
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          document_path?: string | null
          id?: string
          last_error?: string | null
          payload?: Json | null
          phone?: string
          scheduled_at?: string | null
          status?: string
          template?: string | null
          tries?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          created_at: string
          created_by: string | null
          hours_before: number | null
          id: string
          is_active: boolean
          message: string
          name: string
          type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hours_before?: number | null
          id?: string
          is_active?: boolean
          message: string
          name: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hours_before?: number | null
          id?: string
          is_active?: boolean
          message?: string
          name?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      attach_document_trigger: { Args: { table_name: string }; Returns: string }
      attach_document_trigger_2: {
        Args: { schema_name: string; table_name: string }
        Returns: string
      }
      can_access_client_photo: { Args: { _photo_id: string }; Returns: boolean }
      can_access_client_record: {
        Args: { _client_id: string }
        Returns: boolean
      }
      can_access_client_storage_object: {
        Args: { _bucket_id: string; _object_name: string }
        Returns: boolean
      }
      can_access_package_appointment: {
        Args: { _package_appointment_id: string }
        Returns: boolean
      }
      can_access_service_package: {
        Args: { _package_id: string }
        Returns: boolean
      }
      check_trial_eligibility: {
        Args: { p_cnpj?: string; p_email: string; p_phone?: string }
        Returns: Json
      }
      close_cash_register: {
        Args: { p_cash_register_id: string; p_closed_by: string }
        Returns: undefined
      }
      get_document_fill_link_by_token: {
        Args: { p_token: string }
        Returns: Json
      }
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
      process_payment_low:
        | {
            Args: {
              p_amount: number
              p_client_id: string
              p_note?: string
              p_payment_method: string
              p_payment_type: string
              p_processed_by: string
              p_single_sale_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_amount: number
              p_change_amount?: number
              p_client_id: string
              p_note?: string
              p_payment_method: string
              p_payment_type: string
              p_processed_by: string
              p_single_sale_id: string
            }
            Returns: undefined
          }
      record_migration: {
        Args: {
          p_applied_by?: string
          p_name: string
          p_status: string
          p_version: string
        }
        Returns: undefined
      }
      submit_document_fill_by_token: {
        Args: {
          p_filled_content: string
          p_filled_variables?: Json
          p_token: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "receptionist" | "professional"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "missed"
        | "rescheduled"
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
      appointment_status: [
        "scheduled",
        "confirmed",
        "completed",
        "cancelled",
        "missed",
        "rescheduled",
      ],
      document_type: ["anamnese", "contract", "quote", "photo", "other"],
      quote_status: ["draft", "sent", "accepted", "rejected", "expired"],
      treatment_stage: ["before", "during", "after"],
    },
  },
} as const
