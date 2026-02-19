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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_logs: {
        Row: {
          action: string
          admin_user_id: string | null
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          admin_user_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      banners: {
        Row: {
          active: boolean
          created_at: string
          height: string
          id: string
          image_url: string
          link_url: string | null
          position: string
          sort_order: number
          title: string
          updated_at: string
          width: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          height?: string
          id?: string
          image_url: string
          link_url?: string | null
          position?: string
          sort_order?: number
          title?: string
          updated_at?: string
          width?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          height?: string
          id?: string
          image_url?: string
          link_url?: string | null
          position?: string
          sort_order?: number
          title?: string
          updated_at?: string
          width?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          icon_name: string
          icon_url: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          icon_name?: string
          icon_url?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          icon_name?: string
          icon_url?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          request_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          request_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          request_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_read_status: {
        Row: {
          id: string
          last_read_at: string
          request_id: string
          user_id: string
        }
        Insert: {
          id?: string
          last_read_at?: string
          request_id: string
          user_id: string
        }
        Update: {
          id?: string
          last_read_at?: string
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_read_status_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          coupon_type: string
          created_at: string
          discount_percent: number
          expires_at: string | null
          id: string
          raffle_id: string | null
          source: string
          used: boolean
          user_id: string
        }
        Insert: {
          coupon_type?: string
          created_at?: string
          discount_percent?: number
          expires_at?: string | null
          id?: string
          raffle_id?: string | null
          source?: string
          used?: boolean
          user_id: string
        }
        Update: {
          coupon_type?: string
          created_at?: string
          discount_percent?: number
          expires_at?: string | null
          id?: string
          raffle_id?: string | null
          source?: string
          used?: boolean
          user_id?: string
        }
        Relationships: []
      }
      enterprise_upgrade_requests: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          admin_notes: string | null
          asaas_credit_card_token: string | null
          asaas_customer_id: string | null
          cadastral_status: string | null
          cnpj: string
          company_name: string | null
          created_at: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          admin_notes?: string | null
          asaas_credit_card_token?: string | null
          asaas_customer_id?: string | null
          cadastral_status?: string | null
          cnpj: string
          company_name?: string | null
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          admin_notes?: string | null
          asaas_credit_card_token?: string | null
          asaas_customer_id?: string | null
          cadastral_status?: string | null
          cnpj?: string
          company_name?: string | null
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_applications: {
        Row: {
          applicant_id: string
          created_at: string
          description: string | null
          email: string
          full_name: string
          id: string
          job_id: string
          phone: string | null
          resume_url: string | null
          status: string
        }
        Insert: {
          applicant_id: string
          created_at?: string
          description?: string | null
          email: string
          full_name: string
          id?: string
          job_id: string
          phone?: string | null
          resume_url?: string | null
          status?: string
        }
        Update: {
          applicant_id?: string
          created_at?: string
          description?: string | null
          email?: string
          full_name?: string
          id?: string
          job_id?: string
          phone?: string | null
          resume_url?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
        ]
      }
      job_postings: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          location: string | null
          professional_id: string
          requirements: string | null
          salary_range: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          professional_id: string
          requirements?: string | null
          salary_range?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          professional_id?: string
          requirements?: string | null
          salary_range?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_postings_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          active: boolean
          has_featured: boolean
          has_in_app_support: boolean
          has_job_postings: boolean
          has_product_catalog: boolean
          has_verified_badge: boolean
          has_vip_event: boolean
          id: string
          max_calls: number
          max_devices: number
          name: string
          price_monthly: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          has_featured?: boolean
          has_in_app_support?: boolean
          has_job_postings?: boolean
          has_product_catalog?: boolean
          has_verified_badge?: boolean
          has_vip_event?: boolean
          id: string
          max_calls?: number
          max_devices?: number
          name: string
          price_monthly?: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          has_featured?: boolean
          has_in_app_support?: boolean
          has_job_postings?: boolean
          has_product_catalog?: boolean
          has_verified_badge?: boolean
          has_vip_event?: boolean
          id?: string
          max_calls?: number
          max_devices?: number
          name?: string
          price_monthly?: number
          sort_order?: number
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      platform_stats: {
        Row: {
          active: boolean
          icon_name: string
          id: string
          label: string
          manual_value: number
          sort_order: number
          value_mode: string
        }
        Insert: {
          active?: boolean
          icon_name?: string
          id?: string
          label?: string
          manual_value?: number
          sort_order?: number
          value_mode?: string
        }
        Update: {
          active?: boolean
          icon_name?: string
          id?: string
          label?: string
          manual_value?: number
          sort_order?: number
          value_mode?: string
        }
        Relationships: []
      }
      product_catalog: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          external_url: string | null
          id: string
          image_url: string | null
          name: string
          price: number
          professional_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          external_url?: string | null
          id?: string
          image_url?: string | null
          name: string
          price?: number
          professional_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          external_url?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          professional_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_catalog_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_documents: {
        Row: {
          created_at: string
          file_url: string
          id: string
          professional_id: string
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          file_url: string
          id?: string
          professional_id: string
          status?: string
          type?: string
        }
        Update: {
          created_at?: string
          file_url?: string
          id?: string
          professional_id?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_documents_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_fiscal_data: {
        Row: {
          anticipation_enabled: boolean
          bank_account: string | null
          bank_account_type: string | null
          bank_agency: string | null
          bank_name: string | null
          charge_interest_to_client: boolean
          created_at: string
          fiscal_address_city: string | null
          fiscal_address_complement: string | null
          fiscal_address_neighborhood: string | null
          fiscal_address_number: string | null
          fiscal_address_state: string | null
          fiscal_address_street: string | null
          fiscal_address_zip: string | null
          fiscal_document: string | null
          fiscal_email: string | null
          fiscal_name: string | null
          id: string
          payment_method: string
          pix_key: string | null
          pix_key_type: string | null
          professional_id: string
          updated_at: string
        }
        Insert: {
          anticipation_enabled?: boolean
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          charge_interest_to_client?: boolean
          created_at?: string
          fiscal_address_city?: string | null
          fiscal_address_complement?: string | null
          fiscal_address_neighborhood?: string | null
          fiscal_address_number?: string | null
          fiscal_address_state?: string | null
          fiscal_address_street?: string | null
          fiscal_address_zip?: string | null
          fiscal_document?: string | null
          fiscal_email?: string | null
          fiscal_name?: string | null
          id?: string
          payment_method?: string
          pix_key?: string | null
          pix_key_type?: string | null
          professional_id: string
          updated_at?: string
        }
        Update: {
          anticipation_enabled?: boolean
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          charge_interest_to_client?: boolean
          created_at?: string
          fiscal_address_city?: string | null
          fiscal_address_complement?: string | null
          fiscal_address_neighborhood?: string | null
          fiscal_address_number?: string | null
          fiscal_address_state?: string | null
          fiscal_address_street?: string | null
          fiscal_address_zip?: string | null
          fiscal_document?: string | null
          fiscal_email?: string | null
          fiscal_name?: string | null
          id?: string
          payment_method?: string
          pix_key?: string | null
          pix_key_type?: string | null
          professional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_fiscal_data_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          active: boolean
          availability_status: string
          bio: string | null
          bonus_calls: number
          category_id: string | null
          created_at: string
          id: string
          profession_id: string | null
          profile_status: string
          rating: number
          total_reviews: number
          total_services: number
          updated_at: string
          user_id: string
          verified: boolean
        }
        Insert: {
          active?: boolean
          availability_status?: string
          bio?: string | null
          bonus_calls?: number
          category_id?: string | null
          created_at?: string
          id?: string
          profession_id?: string | null
          profile_status?: string
          rating?: number
          total_reviews?: number
          total_services?: number
          updated_at?: string
          user_id: string
          verified?: boolean
        }
        Update: {
          active?: boolean
          availability_status?: string
          bio?: string | null
          bonus_calls?: number
          category_id?: string | null
          created_at?: string
          id?: string
          profession_id?: string | null
          profile_status?: string
          rating?: number
          total_reviews?: number
          total_services?: number
          updated_at?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "professionals_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professionals_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "professions"
            referencedColumns: ["id"]
          },
        ]
      }
      professions: {
        Row: {
          active: boolean
          category_id: string
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          category_id: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          category_id?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "professions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accepted_terms_at: string | null
          accepted_terms_version: string | null
          address_city: string | null
          address_complement: string | null
          address_country: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          avatar_url: string | null
          birth_date: string | null
          cnpj: string | null
          cpf: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_blocked: boolean
          phone: string | null
          updated_at: string
          user_id: string
          user_type: string
        }
        Insert: {
          accepted_terms_at?: string | null
          accepted_terms_version?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_country?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          cnpj?: string | null
          cpf?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_blocked?: boolean
          phone?: string | null
          updated_at?: string
          user_id: string
          user_type?: string
        }
        Update: {
          accepted_terms_at?: string | null
          accepted_terms_version?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_country?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          cnpj?: string | null
          cpf?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_blocked?: boolean
          phone?: string | null
          updated_at?: string
          user_id?: string
          user_type?: string
        }
        Relationships: []
      }
      raffles: {
        Row: {
          created_at: string
          draw_date: string
          id: string
          status: string
          title: string
          winner_user_id: string | null
        }
        Insert: {
          created_at?: string
          draw_date: string
          id?: string
          status?: string
          title: string
          winner_user_id?: string | null
        }
        Update: {
          created_at?: string
          draw_date?: string
          id?: string
          status?: string
          title?: string
          winner_user_id?: string | null
        }
        Relationships: []
      }
      reviews: {
        Row: {
          client_id: string
          comment: string | null
          created_at: string
          id: string
          professional_id: string
          rating: number
          request_id: string
        }
        Insert: {
          client_id: string
          comment?: string | null
          created_at?: string
          id?: string
          professional_id: string
          rating: number
          request_id: string
        }
        Update: {
          client_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          professional_id?: string
          rating?: number
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          client_id: string
          created_at: string
          description: string | null
          id: string
          professional_id: string
          protocol: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          description?: string | null
          id?: string
          professional_id: string
          protocol?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string | null
          id?: string
          professional_id?: string
          protocol?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_clicks: {
        Row: {
          created_at: string
          id: string
          sponsor_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          sponsor_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          sponsor_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_clicks_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsors: {
        Row: {
          active: boolean
          clicks: number
          created_at: string
          id: string
          link_url: string
          logo_url: string | null
          name: string
          niche: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          clicks?: number
          created_at?: string
          id?: string
          link_url?: string
          logo_url?: string | null
          name: string
          niche?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          clicks?: number
          created_at?: string
          id?: string
          link_url?: string
          logo_url?: string | null
          name?: string
          niche?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          plan_id: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_id?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_id?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_system: boolean
          sender_id: string
          ticket_id: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_system?: boolean
          sender_id: string
          ticket_id?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_system?: boolean
          sender_id?: string
          ticket_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_read_status: {
        Row: {
          id: string
          last_read_at: string
          thread_user_id: string
          user_id: string
        }
        Insert: {
          id?: string
          last_read_at?: string
          thread_user_id: string
          user_id: string
        }
        Update: {
          id?: string
          last_read_at?: string
          thread_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          admin_reply: string | null
          created_at: string
          id: string
          message: string
          protocol: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_reply?: string | null
          created_at?: string
          id?: string
          message: string
          protocol?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_reply?: string | null
          created_at?: string
          id?: string
          message?: string
          protocol?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          platform_fee: number
          professional_id: string | null
          professional_net: number
          status: string
          total_amount: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          platform_fee?: number
          professional_id?: string | null
          professional_net?: number
          status?: string
          total_amount: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          platform_fee?: number
          professional_id?: string | null
          professional_net?: number
          status?: string
          total_amount?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      profiles_public: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string | null
          user_id: string | null
          user_type: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          user_id?: string | null
          user_type?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          user_id?: string | null
          user_type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_transaction_summary: {
        Args: never
        Returns: {
          total_fees: number
          total_volume: number
          transaction_count: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_sponsor_clicks: {
        Args: { _sponsor_id: string }
        Returns: undefined
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      submit_review: {
        Args: { _comment?: string; _rating: number; _request_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "finance_admin"
        | "support_admin"
        | "sponsor_admin"
        | "moderator"
        | "client"
        | "professional"
        | "company"
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
      app_role: [
        "super_admin",
        "finance_admin",
        "support_admin",
        "sponsor_admin",
        "moderator",
        "client",
        "professional",
        "company",
      ],
    },
  },
} as const
