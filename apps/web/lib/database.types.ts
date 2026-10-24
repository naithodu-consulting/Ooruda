export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          is_personal_account: boolean
          name: string
          picture_url: string | null
          primary_owner_user_id: string
          product_type: string
          public_data: Json
          slug: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          is_personal_account?: boolean
          name: string
          picture_url?: string | null
          primary_owner_user_id?: string
          product_type?: string
          public_data?: Json
          slug?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          is_personal_account?: boolean
          name?: string
          picture_url?: string | null
          primary_owner_user_id?: string
          product_type?: string
          public_data?: Json
          slug?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      accounts_memberships: {
        Row: {
          account_id: string
          account_role: string
          created_at: string
          created_by: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          account_role: string
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          account_role?: string
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_memberships_account_role_fkey"
            columns: ["account_role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["name"]
          },
        ]
      }
      advance_application_receipts: {
        Row: {
          amount: number
          applied_at: string
          association_id: string
          bill_id: string | null
          bill_type: string
          cash_ledger_id: string
          created_at: string
          id: string
          pdf_url: string | null
          unit_id: string
          voucher_no: string
        }
        Insert: {
          amount: number
          applied_at?: string
          association_id: string
          bill_id?: string | null
          bill_type: string
          cash_ledger_id: string
          created_at?: string
          id?: string
          pdf_url?: string | null
          unit_id: string
          voucher_no: string
        }
        Update: {
          amount?: number
          applied_at?: string
          association_id?: string
          bill_id?: string | null
          bill_type?: string
          cash_ledger_id?: string
          created_at?: string
          id?: string
          pdf_url?: string | null
          unit_id?: string
          voucher_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "advance_application_receipts_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_application_receipts_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_application_receipts_cash_ledger_id_fkey"
            columns: ["cash_ledger_id"]
            isOneToOne: false
            referencedRelation: "cash_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_application_receipts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      amc_contracts: {
        Row: {
          association_id: string
          auto_renewal: boolean
          category: string
          contract_document_url: string | null
          contract_value: number
          coverage_scope: string | null
          created_at: string
          created_by: string
          end_date: string
          id: string
          name: string
          next_payment_due: string | null
          notes: string | null
          notice_period_days: number | null
          payment_frequency: string
          priority: string
          sla_terms: string | null
          start_date: string
          terminated_at: string | null
          terminated_reason: string | null
          updated_at: string
          vendor_contact_person: string | null
          vendor_email: string | null
          vendor_name: string
          vendor_phone: string | null
        }
        Insert: {
          association_id: string
          auto_renewal?: boolean
          category: string
          contract_document_url?: string | null
          contract_value: number
          coverage_scope?: string | null
          created_at?: string
          created_by: string
          end_date: string
          id?: string
          name: string
          next_payment_due?: string | null
          notes?: string | null
          notice_period_days?: number | null
          payment_frequency?: string
          priority?: string
          sla_terms?: string | null
          start_date: string
          terminated_at?: string | null
          terminated_reason?: string | null
          updated_at?: string
          vendor_contact_person?: string | null
          vendor_email?: string | null
          vendor_name: string
          vendor_phone?: string | null
        }
        Update: {
          association_id?: string
          auto_renewal?: boolean
          category?: string
          contract_document_url?: string | null
          contract_value?: number
          coverage_scope?: string | null
          created_at?: string
          created_by?: string
          end_date?: string
          id?: string
          name?: string
          next_payment_due?: string | null
          notes?: string | null
          notice_period_days?: number | null
          payment_frequency?: string
          priority?: string
          sla_terms?: string | null
          start_date?: string
          terminated_at?: string | null
          terminated_reason?: string | null
          updated_at?: string
          vendor_contact_person?: string | null
          vendor_email?: string | null
          vendor_name?: string
          vendor_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "amc_contracts_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      amc_reminder_settings: {
        Row: {
          association_id: string
          created_at: string
          id: string
          remind_days_before: number
          updated_at: string
        }
        Insert: {
          association_id: string
          created_at?: string
          id?: string
          remind_days_before?: number
          updated_at?: string
        }
        Update: {
          association_id?: string
          created_at?: string
          id?: string
          remind_days_before?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "amc_reminder_settings_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: true
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      amc_renewal_history: {
        Row: {
          amc_contract_id: string
          contract_value: number
          created_at: string
          id: string
          linked_expense_id: string | null
          new_end_date: string
          notes: string | null
          renewed_at: string
          renewed_by: string
        }
        Insert: {
          amc_contract_id: string
          contract_value: number
          created_at?: string
          id?: string
          linked_expense_id?: string | null
          new_end_date: string
          notes?: string | null
          renewed_at: string
          renewed_by: string
        }
        Update: {
          amc_contract_id?: string
          contract_value?: number
          created_at?: string
          id?: string
          linked_expense_id?: string | null
          new_end_date?: string
          notes?: string | null
          renewed_at?: string
          renewed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "amc_renewal_history_amc_contract_id_fkey"
            columns: ["amc_contract_id"]
            isOneToOne: false
            referencedRelation: "amc_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amc_renewal_history_linked_expense_id_fkey"
            columns: ["linked_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      assoc_admin_permissions: {
        Row: {
          association_id: string
          can_delete: boolean
          can_edit: boolean
          can_invite: boolean
          created_at: string
          id: string
          target_role: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          association_id: string
          can_delete?: boolean
          can_edit?: boolean
          can_invite?: boolean
          created_at?: string
          id?: string
          target_role: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          association_id?: string
          can_delete?: boolean
          can_edit?: boolean
          can_invite?: boolean
          created_at?: string
          id?: string
          target_role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assoc_admin_permissions_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assoc_admin_permissions_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assoc_admin_permissions_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assoc_admin_permissions_target_role_fkey"
            columns: ["target_role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["name"]
          },
        ]
      }
      association_feature_flags: {
        Row: {
          association_id: string
          enabled: boolean
          enabled_at: string | null
          enabled_by: string | null
          feature: string
          id: string
        }
        Insert: {
          association_id: string
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          feature: string
          id?: string
        }
        Update: {
          association_id?: string
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          feature?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "association_feature_flags_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      association_payment_gateways: {
        Row: {
          association_id: string
          created_at: string
          id: string
          is_active: boolean
          key_id: string
          key_secret: string
          provider: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          association_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          key_id: string
          key_secret: string
          provider?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          association_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key_id?: string
          key_secret?: string
          provider?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "association_payment_gateways_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: true
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      associations: {
        Row: {
          account_id: string
          address: string | null
          authorised_signatory: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          brand_colour: string
          cash_ledger_enabled: boolean
          created_at: string
          email: string | null
          gst_enabled: boolean
          gst_rate: number | null
          gstin: string | null
          id: string
          is_test: boolean
          logo_url: string | null
          mescom_consumer_no: string | null
          pan_number: string | null
          phone: string | null
          registration_number: string | null
          sanctioned_load_kva: number | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          address?: string | null
          authorised_signatory?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          brand_colour?: string
          cash_ledger_enabled?: boolean
          created_at?: string
          email?: string | null
          gst_enabled?: boolean
          gst_rate?: number | null
          gstin?: string | null
          id?: string
          is_test?: boolean
          logo_url?: string | null
          mescom_consumer_no?: string | null
          pan_number?: string | null
          phone?: string | null
          registration_number?: string | null
          sanctioned_load_kva?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          address?: string | null
          authorised_signatory?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          brand_colour?: string
          cash_ledger_enabled?: boolean
          created_at?: string
          email?: string | null
          gst_enabled?: boolean
          gst_rate?: number | null
          gstin?: string | null
          id?: string
          is_test?: boolean
          logo_url?: string | null
          mescom_consumer_no?: string | null
          pan_number?: string | null
          phone?: string | null
          registration_number?: string | null
          sanctioned_load_kva?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "associations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "associations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "associations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          association_id: string | null
          created_at: string
          duration_ms: number | null
          entity_id: string | null
          entity_type: string
          error_code: string | null
          event_type: string
          http_method: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          path: string | null
          status_code: number | null
          summary: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          association_id?: string | null
          created_at?: string
          duration_ms?: number | null
          entity_id?: string | null
          entity_type: string
          error_code?: string | null
          event_type?: string
          http_method?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          path?: string | null
          status_code?: number | null
          summary?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          association_id?: string | null
          created_at?: string
          duration_ms?: number | null
          entity_id?: string | null
          entity_type?: string
          error_code?: string | null
          event_type?: string
          http_method?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          path?: string | null
          status_code?: number | null
          summary?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_line_items: {
        Row: {
          amount: number
          area_sqft: number | null
          bill_id: string
          charge_type_id: string | null
          created_at: string
          description: string
          gst_applicable: boolean
          id: string
          payer: string
          rate_per_sqft: number | null
        }
        Insert: {
          amount: number
          area_sqft?: number | null
          bill_id: string
          charge_type_id?: string | null
          created_at?: string
          description: string
          gst_applicable?: boolean
          id?: string
          payer: string
          rate_per_sqft?: number | null
        }
        Update: {
          amount?: number
          area_sqft?: number | null
          bill_id?: string
          charge_type_id?: string | null
          created_at?: string
          description?: string
          gst_applicable?: boolean
          id?: string
          payer?: string
          rate_per_sqft?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_line_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_line_items_charge_type_id_fkey"
            columns: ["charge_type_id"]
            isOneToOne: false
            referencedRelation: "charge_types"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_sequences: {
        Row: {
          association_id: string
          bill_type: string
          financial_year: number
          next_val: number
        }
        Insert: {
          association_id: string
          bill_type: string
          financial_year: number
          next_val?: number
        }
        Update: {
          association_id?: string
          bill_type?: string
          financial_year?: number
          next_val?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_sequences_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_customers: {
        Row: {
          account_id: string
          customer_id: string
          email: string | null
          id: number
          provider: Database["public"]["Enums"]["billing_provider"]
        }
        Insert: {
          account_id: string
          customer_id: string
          email?: string | null
          id?: number
          provider: Database["public"]["Enums"]["billing_provider"]
        }
        Update: {
          account_id?: string
          customer_id?: string
          email?: string | null
          id?: number
          provider?: Database["public"]["Enums"]["billing_provider"]
        }
        Relationships: [
          {
            foreignKeyName: "billing_customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_settings: {
        Row: {
          association_id: string
          due_day_of_month: number
          electricity_due_day: number
          id: string
          maintenance_due_day: number
          other_charges_due_day: number
          reminder_schedule_json: Json
        }
        Insert: {
          association_id: string
          due_day_of_month?: number
          electricity_due_day?: number
          id?: string
          maintenance_due_day?: number
          other_charges_due_day?: number
          reminder_schedule_json?: Json
        }
        Update: {
          association_id?: string
          due_day_of_month?: number
          electricity_due_day?: number
          id?: string
          maintenance_due_day?: number
          other_charges_due_day?: number
          reminder_schedule_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "billing_settings_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: true
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          advance_applied: number
          association_id: string
          bill_no: string
          bill_type: string
          due_date: string
          generated_at: string
          generated_by: string | null
          gst_amount: number | null
          id: string
          paid_amount: number
          pdf_generated_at: string | null
          pdf_url: string | null
          period: string
          status: string
          tenancy_id: string | null
          total_amount: number
          unit_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          advance_applied?: number
          association_id: string
          bill_no: string
          bill_type?: string
          due_date: string
          generated_at?: string
          generated_by?: string | null
          gst_amount?: number | null
          id?: string
          paid_amount?: number
          pdf_generated_at?: string | null
          pdf_url?: string | null
          period: string
          status?: string
          tenancy_id?: string | null
          total_amount?: number
          unit_id: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          advance_applied?: number
          association_id?: string
          bill_no?: string
          bill_type?: string
          due_date?: string
          generated_at?: string
          generated_by?: string | null
          gst_amount?: number | null
          id?: string
          paid_amount?: number
          pdf_generated_at?: string | null
          pdf_url?: string | null
          period?: string
          status?: string
          tenancy_id?: string | null
          total_amount?: number
          unit_id?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: false
            referencedRelation: "tenancies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_ledger: {
        Row: {
          amount: number
          association_id: string
          bill_type: string
          created_at: string
          created_by: string | null
          direction: string
          entry_date: string
          entry_type: string
          id: string
          notes: string | null
          paid_by_name: string
          paid_by_role: string | null
          paid_by_user_id: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          reference_bill_id: string | null
          tenancy_id: string | null
          unit_id: string
        }
        Insert: {
          amount: number
          association_id: string
          bill_type: string
          created_at?: string
          created_by?: string | null
          direction: string
          entry_date?: string
          entry_type: string
          id?: string
          notes?: string | null
          paid_by_name?: string
          paid_by_role?: string | null
          paid_by_user_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          reference_bill_id?: string | null
          tenancy_id?: string | null
          unit_id: string
        }
        Update: {
          amount?: number
          association_id?: string
          bill_type?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          entry_date?: string
          entry_type?: string
          id?: string
          notes?: string | null
          paid_by_name?: string
          paid_by_role?: string | null
          paid_by_user_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          reference_bill_id?: string | null
          tenancy_id?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_ledger_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_reference_bill_id_fkey"
            columns: ["reference_bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: false
            referencedRelation: "tenancies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_ledger_payments: {
        Row: {
          amount: number
          association_id: string
          bill_type: string
          created_at: string
          id: string
          mode: string
          paid_at: string
          paid_by_role: string
          razorpay_payment_id: string | null
          receipt_no: string | null
          receipt_pdf_url: string | null
          recorded_by: string | null
          reference_no: string | null
          refunded_amount: number
          reversed_at: string | null
          status: string
          tenancy_id: string | null
          unit_id: string
        }
        Insert: {
          amount: number
          association_id: string
          bill_type: string
          created_at?: string
          id?: string
          mode: string
          paid_at?: string
          paid_by_role?: string
          razorpay_payment_id?: string | null
          receipt_no?: string | null
          receipt_pdf_url?: string | null
          recorded_by?: string | null
          reference_no?: string | null
          refunded_amount?: number
          reversed_at?: string | null
          status?: string
          tenancy_id?: string | null
          unit_id: string
        }
        Update: {
          amount?: number
          association_id?: string
          bill_type?: string
          created_at?: string
          id?: string
          mode?: string
          paid_at?: string
          paid_by_role?: string
          razorpay_payment_id?: string | null
          receipt_no?: string | null
          receipt_pdf_url?: string | null
          recorded_by?: string | null
          reference_no?: string | null
          refunded_amount?: number
          reversed_at?: string | null
          status?: string
          tenancy_id?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_ledger_payments_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_payments_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: false
            referencedRelation: "tenancies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_payments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_ledger_sequences: {
        Row: {
          association_id: string
          bill_type: string
          financial_year: number
          next_val: number
          prefix: string
        }
        Insert: {
          association_id: string
          bill_type: string
          financial_year: number
          next_val?: number
          prefix: string
        }
        Update: {
          association_id?: string
          bill_type?: string
          financial_year?: number
          next_val?: number
          prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_ledger_sequences_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_types: {
        Row: {
          association_id: string
          calc_method: string
          created_at: string
          custom_interval_months: number | null
          default_payer: string
          frequency: string
          gst_applicable: boolean
          id: string
          is_active: boolean
          is_builtin: boolean
          key: string
          name: string
          next_due_period: string | null
          rate_or_amount: number | null
        }
        Insert: {
          association_id: string
          calc_method: string
          created_at?: string
          custom_interval_months?: number | null
          default_payer?: string
          frequency: string
          gst_applicable?: boolean
          id?: string
          is_active?: boolean
          is_builtin?: boolean
          key: string
          name: string
          next_due_period?: string | null
          rate_or_amount?: number | null
        }
        Update: {
          association_id?: string
          calc_method?: string
          created_at?: string
          custom_interval_months?: number | null
          default_payer?: string
          frequency?: string
          gst_applicable?: boolean
          id?: string
          is_active?: boolean
          is_builtin?: boolean
          key?: string
          name?: string
          next_due_period?: string | null
          rate_or_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "charge_types_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      config: {
        Row: {
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          enable_account_billing: boolean
          enable_team_account_billing: boolean
          enable_team_accounts: boolean
        }
        Insert: {
          billing_provider?: Database["public"]["Enums"]["billing_provider"]
          enable_account_billing?: boolean
          enable_team_account_billing?: boolean
          enable_team_accounts?: boolean
        }
        Update: {
          billing_provider?: Database["public"]["Enums"]["billing_provider"]
          enable_account_billing?: boolean
          enable_team_account_billing?: boolean
          enable_team_accounts?: boolean
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          association_id: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          association_id?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          association_id?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          association_id: string
          attachment_url: string | null
          category_id: string | null
          created_at: string
          created_by: string
          date_of_payment: string
          deleted_at: string | null
          gst_amount: number | null
          id: string
          invoice_number: string | null
          linked_amc_id: string | null
          mode_of_payment: string
          notes: string | null
          payee_id: string | null
          payee_name: string
          payor: string
          recurring: boolean
          recurring_frequency: string | null
          reference_number: string | null
          sub_category: string | null
          title: string
          updated_at: string
        }
        Insert: {
          amount: number
          association_id: string
          attachment_url?: string | null
          category_id?: string | null
          created_at?: string
          created_by: string
          date_of_payment: string
          deleted_at?: string | null
          gst_amount?: number | null
          id?: string
          invoice_number?: string | null
          linked_amc_id?: string | null
          mode_of_payment: string
          notes?: string | null
          payee_id?: string | null
          payee_name: string
          payor?: string
          recurring?: boolean
          recurring_frequency?: string | null
          reference_number?: string | null
          sub_category?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          association_id?: string
          attachment_url?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string
          date_of_payment?: string
          deleted_at?: string | null
          gst_amount?: number | null
          id?: string
          invoice_number?: string | null
          linked_amc_id?: string | null
          mode_of_payment?: string
          notes?: string | null
          payee_id?: string | null
          payee_name?: string
          payor?: string
          recurring?: boolean
          recurring_frequency?: string | null
          reference_number?: string | null
          sub_category?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_linked_amc_fk"
            columns: ["linked_amc_id"]
            isOneToOne: false
            referencedRelation: "amc_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          account_id: string
          created_at: string
          email: string | null
          expires_at: string
          id: number
          invite_token: string
          invited_by: string
          invitee_name: string | null
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: number
          invite_token: string
          invited_by: string
          invitee_name?: string | null
          phone?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: number
          invite_token?: string
          invited_by?: string
          invitee_name?: string | null
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["name"]
          },
        ]
      }
      mescom_bills: {
        Row: {
          association_id: string
          block_consumption_units: number
          effective_rate: number | null
          id: string
          invoice_amount: number
          invoice_file_url: string | null
          period: string
          period_end: string | null
          period_start: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          association_id: string
          block_consumption_units: number
          effective_rate?: number | null
          id?: string
          invoice_amount: number
          invoice_file_url?: string | null
          period: string
          period_end?: string | null
          period_start?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          association_id?: string
          block_consumption_units?: number
          effective_rate?: number | null
          id?: string
          invoice_amount?: number
          invoice_file_url?: string | null
          period?: string
          period_end?: string | null
          period_start?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mescom_bills_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_readings: {
        Row: {
          consumed_units: number | null
          created_at: string
          current_reading: number
          id: string
          load_kva: number | null
          mescom_bill_id: string
          minimum_charge: number
          period: string
          previous_reading: number
          sub_meter_id: string
        }
        Insert: {
          consumed_units?: number | null
          created_at?: string
          current_reading: number
          id?: string
          load_kva?: number | null
          mescom_bill_id: string
          minimum_charge?: number
          period: string
          previous_reading: number
          sub_meter_id: string
        }
        Update: {
          consumed_units?: number | null
          created_at?: string
          current_reading?: number
          id?: string
          load_kva?: number | null
          mescom_bill_id?: string
          minimum_charge?: number
          period?: string
          previous_reading?: number
          sub_meter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meter_readings_mescom_bill_id_fkey"
            columns: ["mescom_bill_id"]
            isOneToOne: false
            referencedRelation: "mescom_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_sub_meter_id_fkey"
            columns: ["sub_meter_id"]
            isOneToOne: false
            referencedRelation: "sub_meters"
            referencedColumns: ["id"]
          },
        ]
      }
      nonces: {
        Row: {
          client_token: string
          created_at: string
          expires_at: string
          id: string
          last_verification_at: string | null
          last_verification_ip: unknown
          last_verification_user_agent: string | null
          metadata: Json | null
          nonce: string
          purpose: string
          revoked: boolean
          revoked_reason: string | null
          scopes: string[] | null
          used_at: string | null
          user_id: string | null
          verification_attempts: number
        }
        Insert: {
          client_token: string
          created_at?: string
          expires_at: string
          id?: string
          last_verification_at?: string | null
          last_verification_ip?: unknown
          last_verification_user_agent?: string | null
          metadata?: Json | null
          nonce: string
          purpose: string
          revoked?: boolean
          revoked_reason?: string | null
          scopes?: string[] | null
          used_at?: string | null
          user_id?: string | null
          verification_attempts?: number
        }
        Update: {
          client_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_verification_at?: string | null
          last_verification_ip?: unknown
          last_verification_user_agent?: string | null
          metadata?: Json | null
          nonce?: string
          purpose?: string
          revoked?: boolean
          revoked_reason?: string | null
          scopes?: string[] | null
          used_at?: string | null
          user_id?: string | null
          verification_attempts?: number
        }
        Relationships: []
      }
      notification_providers_config: {
        Row: {
          association_id: string | null
          channel: string
          credentials: Json | null
          id: string
          is_active: boolean
          priority: number
          provider_key: string
        }
        Insert: {
          association_id?: string | null
          channel: string
          credentials?: Json | null
          id?: string
          is_active?: boolean
          priority?: number
          provider_key: string
        }
        Update: {
          association_id?: string | null
          channel?: string
          credentials?: Json | null
          id?: string
          is_active?: boolean
          priority?: number
          provider_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_providers_config_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          account_id: string
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          dismissed: boolean
          expires_at: string | null
          id: number
          link: string | null
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          account_id: string
          body: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          dismissed?: boolean
          expires_at?: string | null
          id?: never
          link?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          account_id?: string
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          dismissed?: boolean
          expires_at?: string | null
          id?: never
          link?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_log: {
        Row: {
          association_id: string | null
          channel: string
          id: string
          provider_key: string
          provider_ref: string | null
          recipient_user_id: string | null
          sent_at: string
          status: string
          type: string
        }
        Insert: {
          association_id?: string | null
          channel: string
          id?: string
          provider_key: string
          provider_ref?: string | null
          recipient_user_id?: string | null
          sent_at?: string
          status?: string
          type: string
        }
        Update: {
          association_id?: string | null
          channel?: string
          id?: string
          provider_key?: string
          provider_ref?: string | null
          recipient_user_id?: string | null
          sent_at?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_log_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          price_amount: number | null
          product_id: string
          quantity: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          id: string
          order_id: string
          price_amount?: number | null
          product_id: string
          quantity?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          price_amount?: number | null
          product_id?: string
          quantity?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          account_id: string
          billing_customer_id: number
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          created_at: string
          currency: string
          id: string
          status: Database["public"]["Enums"]["payment_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          account_id: string
          billing_customer_id: number
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          created_at?: string
          currency: string
          id: string
          status: Database["public"]["Enums"]["payment_status"]
          total_amount: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          billing_customer_id?: number
          billing_provider?: Database["public"]["Enums"]["billing_provider"]
          created_at?: string
          currency?: string
          id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_billing_customer_id_fkey"
            columns: ["billing_customer_id"]
            isOneToOne: false
            referencedRelation: "billing_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          association_id: string
          bill_id: string
          id: string
          mode: string
          paid_at: string
          paid_by_role: string
          payment_batch_id: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          recorded_by: string | null
          reference_no: string | null
          refunded_amount: number
          reversed_at: string | null
          status: string
        }
        Insert: {
          amount: number
          association_id: string
          bill_id: string
          id?: string
          mode: string
          paid_at?: string
          paid_by_role: string
          payment_batch_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          recorded_by?: string | null
          reference_no?: string | null
          refunded_amount?: number
          reversed_at?: string | null
          status?: string
        }
        Update: {
          amount?: number
          association_id?: string
          bill_id?: string
          id?: string
          mode?: string
          paid_at?: string
          paid_by_role?: string
          payment_batch_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          recorded_by?: string | null
          reference_no?: string | null
          refunded_amount?: number
          reversed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_other_charges: {
        Row: {
          amount: number
          association_id: string
          billed: boolean
          created_at: string
          due_date: string | null
          id: string
          label: string
          period: string
          split_mode: string | null
          unit_id: string | null
        }
        Insert: {
          amount: number
          association_id: string
          billed?: boolean
          created_at?: string
          due_date?: string | null
          id?: string
          label: string
          period: string
          split_mode?: string | null
          unit_id?: string | null
        }
        Update: {
          amount?: number
          association_id?: string
          billed?: boolean
          created_at?: string
          due_date?: string | null
          id?: string
          label?: string
          period?: string
          split_mode?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_other_charges_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_other_charges_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_sinking_fund_charges: {
        Row: {
          amount: number
          association_id: string
          billed: boolean
          created_at: string
          due_date: string | null
          id: string
          label: string
          period: string
          split_mode: string | null
          unit_id: string | null
        }
        Insert: {
          amount: number
          association_id: string
          billed?: boolean
          created_at?: string
          due_date?: string | null
          id?: string
          label: string
          period: string
          split_mode?: string | null
          unit_id?: string | null
        }
        Update: {
          amount?: number
          association_id?: string
          billed?: boolean
          created_at?: string
          due_date?: string | null
          id?: string
          label?: string
          period?: string
          split_mode?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_sinking_fund_charges_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_sinking_fund_charges_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          consent_accepted_at: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_test: boolean
          mobile_number: string | null
        }
        Insert: {
          consent_accepted_at?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_test?: boolean
          mobile_number?: string | null
        }
        Update: {
          consent_accepted_at?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_test?: boolean
          mobile_number?: string | null
        }
        Relationships: []
      }
      receipts: {
        Row: {
          generated_at: string
          id: string
          payment_id: string
          pdf_url: string | null
          receipt_no: string
        }
        Insert: {
          generated_at?: string
          id?: string
          payment_id: string
          pdf_url?: string | null
          receipt_no: string
        }
        Update: {
          generated_at?: string
          id?: string
          payment_id?: string
          pdf_url?: string | null
          receipt_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          id: number
          permission: Database["public"]["Enums"]["app_permissions"]
          role: string
        }
        Insert: {
          id?: number
          permission: Database["public"]["Enums"]["app_permissions"]
          role: string
        }
        Update: {
          id?: number
          permission?: Database["public"]["Enums"]["app_permissions"]
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["name"]
          },
        ]
      }
      roles: {
        Row: {
          hierarchy_level: number
          name: string
          product_type: string
        }
        Insert: {
          hierarchy_level: number
          name: string
          product_type?: string
        }
        Update: {
          hierarchy_level?: number
          name?: string
          product_type?: string
        }
        Relationships: []
      }
      sub_meters: {
        Row: {
          created_at: string
          id: string
          initial_reading: number
          is_active: boolean
          load_kva: number | null
          meter_label: string
          meter_type: string
          minimum_charge: number
          unit_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          initial_reading?: number
          is_active?: boolean
          load_kva?: number | null
          meter_label: string
          meter_type?: string
          minimum_charge?: number
          unit_id: string
        }
        Update: {
          created_at?: string
          id?: string
          initial_reading?: number
          is_active?: boolean
          load_kva?: number | null
          meter_label?: string
          meter_type?: string
          minimum_charge?: number
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_meters_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_items: {
        Row: {
          created_at: string
          id: string
          interval: string
          interval_count: number
          price_amount: number | null
          product_id: string
          quantity: number
          subscription_id: string
          type: Database["public"]["Enums"]["subscription_item_type"]
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          id: string
          interval: string
          interval_count: number
          price_amount?: number | null
          product_id: string
          quantity?: number
          subscription_id: string
          type: Database["public"]["Enums"]["subscription_item_type"]
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          interval?: string
          interval_count?: number
          price_amount?: number | null
          product_id?: string
          quantity?: number
          subscription_id?: string
          type?: Database["public"]["Enums"]["subscription_item_type"]
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_items_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          account_id: string
          active: boolean
          billing_customer_id: number
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          cancel_at_period_end: boolean
          created_at: string
          currency: string
          id: string
          period_ends_at: string
          period_starts_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          trial_starts_at: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          active: boolean
          billing_customer_id: number
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          cancel_at_period_end: boolean
          created_at?: string
          currency: string
          id: string
          period_ends_at: string
          period_starts_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          trial_starts_at?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          active?: boolean
          billing_customer_id?: number
          billing_provider?: Database["public"]["Enums"]["billing_provider"]
          cancel_at_period_end?: boolean
          created_at?: string
          currency?: string
          id?: string
          period_ends_at?: string
          period_starts_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          trial_starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_billing_customer_id_fkey"
            columns: ["billing_customer_id"]
            isOneToOne: false
            referencedRelation: "billing_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      tenancies: {
        Row: {
          company_address: string | null
          company_gstin: string | null
          company_name: string | null
          created_at: string
          end_date: string | null
          id: string
          is_company: boolean
          start_date: string
          status: string
          tenant_id: string
          unit_id: string
        }
        Insert: {
          company_address?: string | null
          company_gstin?: string | null
          company_name?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          is_company?: boolean
          start_date: string
          status?: string
          tenant_id: string
          unit_id: string
        }
        Update: {
          company_address?: string | null
          company_gstin?: string | null
          company_name?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          is_company?: boolean
          start_date?: string
          status?: string
          tenant_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenancies_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_charge_overrides: {
        Row: {
          charge_type_id: string
          created_at: string
          id: string
          is_excluded: boolean
          payer_override: string | null
          rate_or_amount_override: number | null
          unit_id: string
        }
        Insert: {
          charge_type_id: string
          created_at?: string
          id?: string
          is_excluded?: boolean
          payer_override?: string | null
          rate_or_amount_override?: number | null
          unit_id: string
        }
        Update: {
          charge_type_id?: string
          created_at?: string
          id?: string
          is_excluded?: boolean
          payer_override?: string | null
          rate_or_amount_override?: number | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_charge_overrides_charge_type_id_fkey"
            columns: ["charge_type_id"]
            isOneToOne: false
            referencedRelation: "charge_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_charge_overrides_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          area_sqft: number
          association_id: string
          bill_to: string
          created_at: string
          door_no: string | null
          floor: number | null
          id: string
          owner_company_address: string | null
          owner_company_gstin: string | null
          owner_company_name: string | null
          owner_id: string | null
          owner_is_company: boolean
          status: string
          type: string
          unit_no: string
        }
        Insert: {
          area_sqft: number
          association_id: string
          bill_to?: string
          created_at?: string
          door_no?: string | null
          floor?: number | null
          id?: string
          owner_company_address?: string | null
          owner_company_gstin?: string | null
          owner_company_name?: string | null
          owner_id?: string | null
          owner_is_company?: boolean
          status?: string
          type?: string
          unit_no: string
        }
        Update: {
          area_sqft?: number
          association_id?: string
          bill_to?: string
          created_at?: string
          door_no?: string | null
          floor?: number | null
          id?: string
          owner_company_address?: string | null
          owner_company_gstin?: string | null
          owner_company_name?: string | null
          owner_id?: string | null
          owner_is_company?: boolean
          status?: string
          type?: string
          unit_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          association_id: string
          bank_details: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          gst_number: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          association_id: string
          bank_details?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          association_id?: string
          bank_details?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_association_id_fkey"
            columns: ["association_id"]
            isOneToOne: false
            referencedRelation: "associations"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_account_settings: {
        Row: {
          account_id: string
          booking_confirmation_email: boolean
          booking_cutoff_date: string | null
          created_at: string
          guest_emails_checked_at: string | null
          managers_can_cancel: boolean
          pre_arrival_email: boolean
          thank_you_email: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          booking_confirmation_email?: boolean
          booking_cutoff_date?: string | null
          created_at?: string
          guest_emails_checked_at?: string | null
          managers_can_cancel?: boolean
          pre_arrival_email?: boolean
          thank_you_email?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          booking_confirmation_email?: boolean
          booking_cutoff_date?: string | null
          created_at?: string
          guest_emails_checked_at?: string | null
          managers_can_cancel?: boolean
          pre_arrival_email?: boolean
          thank_you_email?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "villa_account_settings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_account_settings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_account_settings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_addons: {
        Row: {
          account_id: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          price: number
          pricing_unit: string
          property_id: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          price: number
          pricing_unit: string
          property_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          pricing_unit?: string
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "villa_addons_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_addons_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_addons_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_addons_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "villa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_booking_activity: {
        Row: {
          account_id: string
          action: string
          actor_user_id: string | null
          booking_code: string | null
          created_at: string
          id: string
          note: string | null
          property_id: string
          reason_code: string | null
          site_booking_id: string
        }
        Insert: {
          account_id: string
          action: string
          actor_user_id?: string | null
          booking_code?: string | null
          created_at?: string
          id?: string
          note?: string | null
          property_id: string
          reason_code?: string | null
          site_booking_id: string
        }
        Update: {
          account_id?: string
          action?: string
          actor_user_id?: string | null
          booking_code?: string | null
          created_at?: string
          id?: string
          note?: string | null
          property_id?: string
          reason_code?: string | null
          site_booking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "villa_booking_activity_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_booking_activity_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_booking_activity_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_booking_activity_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "villa_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_booking_activity_reason_code_fkey"
            columns: ["reason_code"]
            isOneToOne: false
            referencedRelation: "villa_cancellation_reasons"
            referencedColumns: ["code"]
          },
        ]
      }
      villa_booking_guests: {
        Row: {
          account_id: string
          created_at: string
          guest_id: string
          id: string
          is_adult: boolean
          is_primary: boolean
          property_id: string
          site_booking_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          guest_id: string
          id?: string
          is_adult?: boolean
          is_primary?: boolean
          property_id: string
          site_booking_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          guest_id?: string
          id?: string
          is_adult?: boolean
          is_primary?: boolean
          property_id?: string
          site_booking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "villa_booking_guests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_booking_guests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_booking_guests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_booking_guests_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "villa_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_booking_guests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "villa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_booking_payments: {
        Row: {
          account_id: string
          amount: number
          booking_code: string | null
          id: string
          mode: string
          note: string | null
          paid_on: string
          payer_name: string | null
          property_id: string
          receipt_no: string
          recorded_at: string
          recorded_by: string | null
          reference: string | null
          request_id: string
          site_booking_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          account_id: string
          amount: number
          booking_code?: string | null
          id?: string
          mode: string
          note?: string | null
          paid_on: string
          payer_name?: string | null
          property_id: string
          receipt_no: string
          recorded_at?: string
          recorded_by?: string | null
          reference?: string | null
          request_id: string
          site_booking_id: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          booking_code?: string | null
          id?: string
          mode?: string
          note?: string | null
          paid_on?: string
          payer_name?: string | null
          property_id?: string
          receipt_no?: string
          recorded_at?: string
          recorded_by?: string | null
          reference?: string | null
          request_id?: string
          site_booking_id?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "villa_booking_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_booking_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_booking_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_booking_payments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "villa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_bookings_mirror: {
        Row: {
          account_id: string
          adults: number
          base_amount: number
          booking_code: string | null
          booking_kind: string
          channel: string | null
          check_in: string
          check_out: string
          children: number
          discount_amount: number
          discount_code: string | null
          extra_guest_amount: number
          guest_email: string | null
          guest_name: string
          guest_phone: string | null
          id_status: string | null
          infants: number
          invoice_number: string | null
          nights: number
          payment_status: string
          property_id: string
          reference_number: string
          site_booking_id: string
          site_property_id: string
          site_updated_at: string | null
          status: string
          synced_at: string
          tax_amount: number
          total_amount: number
        }
        Insert: {
          account_id: string
          adults: number
          base_amount: number
          booking_code?: string | null
          booking_kind?: string
          channel?: string | null
          check_in: string
          check_out: string
          children: number
          discount_amount?: number
          discount_code?: string | null
          extra_guest_amount: number
          guest_email?: string | null
          guest_name: string
          guest_phone?: string | null
          id_status?: string | null
          infants: number
          invoice_number?: string | null
          nights: number
          payment_status: string
          property_id: string
          reference_number: string
          site_booking_id: string
          site_property_id: string
          site_updated_at?: string | null
          status: string
          synced_at?: string
          tax_amount: number
          total_amount: number
        }
        Update: {
          account_id?: string
          adults?: number
          base_amount?: number
          booking_code?: string | null
          booking_kind?: string
          channel?: string | null
          check_in?: string
          check_out?: string
          children?: number
          discount_amount?: number
          discount_code?: string | null
          extra_guest_amount?: number
          guest_email?: string | null
          guest_name?: string
          guest_phone?: string | null
          id_status?: string | null
          infants?: number
          invoice_number?: string | null
          nights?: number
          payment_status?: string
          property_id?: string
          reference_number?: string
          site_booking_id?: string
          site_property_id?: string
          site_updated_at?: string | null
          status?: string
          synced_at?: string
          tax_amount?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "villa_bookings_mirror_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_bookings_mirror_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_bookings_mirror_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_bookings_mirror_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "villa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_cancellation_reasons: {
        Row: {
          code: string
          default_refund: string
          display_order: number
          initiated_by: string
          is_active: boolean
          label: string
          note_required: boolean
        }
        Insert: {
          code: string
          default_refund: string
          display_order: number
          initiated_by: string
          is_active?: boolean
          label: string
          note_required?: boolean
        }
        Update: {
          code?: string
          default_refund?: string
          display_order?: number
          initiated_by?: string
          is_active?: boolean
          label?: string
          note_required?: boolean
        }
        Relationships: []
      }
      villa_discount_audit: {
        Row: {
          account_id: string
          action: string
          actor: string | null
          code_id: string
          created_at: string
          id: string
          terms: Json
        }
        Insert: {
          account_id: string
          action: string
          actor?: string | null
          code_id: string
          created_at?: string
          id?: string
          terms: Json
        }
        Update: {
          account_id?: string
          action?: string
          actor?: string | null
          code_id?: string
          created_at?: string
          id?: string
          terms?: Json
        }
        Relationships: [
          {
            foreignKeyName: "villa_discount_audit_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_discount_audit_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_discount_audit_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_discount_audit_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "villa_discount_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_discount_codes: {
        Row: {
          account_id: string
          approved_at: string | null
          approved_by: string | null
          blackouts: Json
          channels: string[]
          code: string
          created_at: string
          created_by: string | null
          discount_type: string
          discount_value: number
          id: string
          max_discount: number | null
          max_uses: number | null
          max_uses_per_guest: number
          min_booking_value: number
          min_nights: number
          needs_approval: boolean | null
          note: string | null
          property_id: string
          stackable: boolean
          status: string
          updated_at: string
          valid_from: string
          valid_to: string
        }
        Insert: {
          account_id: string
          approved_at?: string | null
          approved_by?: string | null
          blackouts?: Json
          channels?: string[]
          code: string
          created_at?: string
          created_by?: string | null
          discount_type: string
          discount_value: number
          id?: string
          max_discount?: number | null
          max_uses?: number | null
          max_uses_per_guest?: number
          min_booking_value?: number
          min_nights?: number
          needs_approval?: boolean | null
          note?: string | null
          property_id: string
          stackable?: boolean
          status: string
          updated_at?: string
          valid_from: string
          valid_to: string
        }
        Update: {
          account_id?: string
          approved_at?: string | null
          approved_by?: string | null
          blackouts?: Json
          channels?: string[]
          code?: string
          created_at?: string
          created_by?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          max_discount?: number | null
          max_uses?: number | null
          max_uses_per_guest?: number
          min_booking_value?: number
          min_nights?: number
          needs_approval?: boolean | null
          note?: string | null
          property_id?: string
          stackable?: boolean
          status?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "villa_discount_codes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_discount_codes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_discount_codes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_discount_codes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "villa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_emergency_contacts: {
        Row: {
          account_id: string
          category: string
          created_at: string
          display_order: number
          id: string
          name: string
          notes: string | null
          phone: string
          property_id: string
          share_with_guests: boolean
          updated_at: string
        }
        Insert: {
          account_id: string
          category: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
          notes?: string | null
          phone: string
          property_id: string
          share_with_guests?: boolean
          updated_at?: string
        }
        Update: {
          account_id?: string
          category?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          notes?: string | null
          phone?: string
          property_id?: string
          share_with_guests?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "villa_emergency_contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_emergency_contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_emergency_contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_emergency_contacts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "villa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_expenses: {
        Row: {
          account_id: string
          amount: number
          category: string
          created_at: string
          created_by: string | null
          description: string
          gst_amount: number
          id: string
          invoice_no: string | null
          mode: string
          notes: string | null
          property_id: string
          spent_on: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          account_id: string
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          description: string
          gst_amount?: number
          id?: string
          invoice_no?: string | null
          mode: string
          notes?: string | null
          property_id: string
          spent_on: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          gst_amount?: number
          id?: string
          invoice_no?: string | null
          mode?: string
          notes?: string | null
          property_id?: string
          spent_on?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "villa_expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_expenses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "villa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_guest_document_access: {
        Row: {
          account_id: string
          action: string
          actor_user_id: string | null
          created_at: string
          document_id: string
          id: string
        }
        Insert: {
          account_id: string
          action: string
          actor_user_id?: string | null
          created_at?: string
          document_id: string
          id?: string
        }
        Update: {
          account_id?: string
          action?: string
          actor_user_id?: string | null
          created_at?: string
          document_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "villa_guest_document_access_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_guest_document_access_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_guest_document_access_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_guest_document_access_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "villa_guest_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_guest_document_files: {
        Row: {
          account_id: string
          captured_at: string
          captured_by: string | null
          content_type: string
          document_id: string
          file_order: number
          id: string
          label: string | null
          purge_after: string
          purged_at: string | null
          storage_path: string
        }
        Insert: {
          account_id: string
          captured_at?: string
          captured_by?: string | null
          content_type: string
          document_id: string
          file_order?: number
          id?: string
          label?: string | null
          purge_after: string
          purged_at?: string | null
          storage_path: string
        }
        Update: {
          account_id?: string
          captured_at?: string
          captured_by?: string | null
          content_type?: string
          document_id?: string
          file_order?: number
          id?: string
          label?: string | null
          purge_after?: string
          purged_at?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "villa_guest_document_files_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_guest_document_files_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_guest_document_files_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_guest_document_files_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "villa_guest_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_guest_documents: {
        Row: {
          account_id: string
          captured_at: string
          captured_by: string | null
          doc_type: string
          guest_id: string
          id: string
          masked_number: string | null
          property_id: string
          purge_after: string
          purged_at: string | null
          site_booking_id: string
          stage: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          account_id: string
          captured_at?: string
          captured_by?: string | null
          doc_type: string
          guest_id: string
          id?: string
          masked_number?: string | null
          property_id: string
          purge_after: string
          purged_at?: string | null
          site_booking_id: string
          stage: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          account_id?: string
          captured_at?: string
          captured_by?: string | null
          doc_type?: string
          guest_id?: string
          id?: string
          masked_number?: string | null
          property_id?: string
          purge_after?: string
          purged_at?: string | null
          site_booking_id?: string
          stage?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "villa_guest_documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_guest_documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_guest_documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_guest_documents_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "villa_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_guest_documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "villa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_guests: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "villa_guests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_guests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_guests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_message_log: {
        Row: {
          account_id: string
          booking_code: string | null
          check_in: string | null
          created_at: string
          id: string
          manual: boolean
          property_id: string
          provider_id: string | null
          reason: string | null
          sent_by: string | null
          site_booking_id: string
          status: string
          template: string
          to_email: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          booking_code?: string | null
          check_in?: string | null
          created_at?: string
          id?: string
          manual?: boolean
          property_id: string
          provider_id?: string | null
          reason?: string | null
          sent_by?: string | null
          site_booking_id: string
          status: string
          template: string
          to_email?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          booking_code?: string | null
          check_in?: string | null
          created_at?: string
          id?: string
          manual?: boolean
          property_id?: string
          provider_id?: string | null
          reason?: string | null
          sent_by?: string | null
          site_booking_id?: string
          status?: string
          template?: string
          to_email?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "villa_message_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_message_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_message_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_message_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "villa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_mirror_sync_state: {
        Row: {
          account_id: string
          full_site_property_id: string | null
          last_error: string | null
          last_error_at: string | null
          last_full_at: string | null
          last_synced_at: string | null
          property_id: string
          rows_synced: number
          sync_started_at: string | null
        }
        Insert: {
          account_id: string
          full_site_property_id?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_full_at?: string | null
          last_synced_at?: string | null
          property_id: string
          rows_synced?: number
          sync_started_at?: string | null
        }
        Update: {
          account_id?: string
          full_site_property_id?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_full_at?: string | null
          last_synced_at?: string | null
          property_id?: string
          rows_synced?: number
          sync_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "villa_mirror_sync_state_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_mirror_sync_state_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_mirror_sync_state_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_mirror_sync_state_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "villa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_properties: {
        Row: {
          account_id: string
          booking_code_prefix: string | null
          created_at: string
          gstin: string | null
          id: string
          is_test: boolean
          legal_name: string | null
          name: string
          ota_buffer_nights: number
          retention_days: number
          site_credentials_ref: string | null
          site_project_ref: string | null
          site_property_id: string | null
          status: string
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          account_id: string
          booking_code_prefix?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          is_test?: boolean
          legal_name?: string | null
          name: string
          ota_buffer_nights?: number
          retention_days?: number
          site_credentials_ref?: string | null
          site_project_ref?: string | null
          site_property_id?: string | null
          status?: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          account_id?: string
          booking_code_prefix?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          is_test?: boolean
          legal_name?: string | null
          name?: string
          ota_buffer_nights?: number
          retention_days?: number
          site_credentials_ref?: string | null
          site_project_ref?: string | null
          site_property_id?: string | null
          status?: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "villa_properties_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_properties_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_properties_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_refunds: {
        Row: {
          account_id: string
          amount: number
          id: string
          mode: string
          payment_id: string
          property_id: string
          razorpay_refund_id: string | null
          reason: string
          recorded_at: string
          recorded_by: string | null
          reference: string | null
          refund_no: string
          refunded_on: string
          request_id: string
          site_booking_id: string
          status: string
        }
        Insert: {
          account_id: string
          amount: number
          id?: string
          mode: string
          payment_id: string
          property_id: string
          razorpay_refund_id?: string | null
          reason: string
          recorded_at?: string
          recorded_by?: string | null
          reference?: string | null
          refund_no: string
          refunded_on: string
          request_id: string
          site_booking_id: string
          status?: string
        }
        Update: {
          account_id?: string
          amount?: number
          id?: string
          mode?: string
          payment_id?: string
          property_id?: string
          razorpay_refund_id?: string | null
          reason?: string
          recorded_at?: string
          recorded_by?: string | null
          reference?: string | null
          refund_no?: string
          refunded_on?: string
          request_id?: string
          site_booking_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "villa_refunds_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_refunds_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_refunds_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "villa_booking_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_refunds_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "villa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_sequences: {
        Row: {
          financial_year: number
          kind: string
          last_value: number
          property_id: string
        }
        Insert: {
          financial_year: number
          kind: string
          last_value?: number
          property_id: string
        }
        Update: {
          financial_year?: number
          kind?: string
          last_value?: number
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "villa_sequences_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "villa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      villa_sync_log: {
        Row: {
          account_id: string
          actor_user_id: string | null
          created_at: string
          error: string | null
          id: string
          operation: string
          outcome: string
          property_id: string | null
          site_id: string | null
        }
        Insert: {
          account_id: string
          actor_user_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          operation: string
          outcome: string
          property_id?: string | null
          site_id?: string | null
        }
        Update: {
          account_id?: string
          actor_user_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          operation?: string
          outcome?: string
          property_id?: string | null
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "villa_sync_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_sync_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_account_workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_sync_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villa_sync_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "villa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      user_account_workspace: {
        Row: {
          id: string | null
          name: string | null
          picture_url: string | null
          subscription_status:
            | Database["public"]["Enums"]["subscription_status"]
            | null
        }
        Relationships: []
      }
      user_accounts: {
        Row: {
          id: string | null
          name: string | null
          picture_url: string | null
          role: string | null
          slug: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_memberships_account_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["name"]
          },
        ]
      }
    }
    Functions: {
      _allocate_ledger_doc_no: {
        Args: {
          p_association_id: string
          p_bill_type: string
          p_date: string
          p_prefix: string
        }
        Returns: string
      }
      _apply_advance_internal: {
        Args: {
          p_association_id: string
          p_bill_type: string
          p_unit_id: string
        }
        Returns: number
      }
      accept_invitation: {
        Args: { token: string; user_id: string }
        Returns: string
      }
      add_invitations_to_account: {
        Args: {
          account_slug: string
          invitations: Database["public"]["CompositeTypes"]["invitation"][]
          invited_by: string
        }
        Returns: Database["public"]["Tables"]["invitations"]["Row"][]
      }
      allocate_bill_no: {
        Args: {
          p_association_id: string
          p_bill_type: string
          p_period: string
        }
        Returns: string
      }
      amc_contract_status: {
        Args: { p_end_date: string; p_terminated_at: string }
        Returns: string
      }
      apply_available_advance: {
        Args: {
          p_association_id: string
          p_bill_type: string
          p_unit_id: string
        }
        Returns: number
      }
      association_role: { Args: { p_association_id: string }; Returns: string }
      can_action_account_member: {
        Args: { target_team_account_id: string; target_user_id: string }
        Returns: boolean
      }
      connect_villa_property: {
        Args: {
          p_account_id: string
          p_booking_code_prefix: string
          p_name: string
          p_property_id?: string
          p_service_key: string
          p_site_project_ref: string
          p_site_property_id: string
          p_site_url: string
        }
        Returns: string
      }
      create_bill_with_items:
        | {
            Args: {
              p_association_id: string
              p_bill_no: string
              p_due_date: string
              p_line_items: Json
              p_period: string
              p_total_amount: number
              p_unit_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_association_id: string
              p_bill_no: string
              p_bill_type?: string
              p_due_date: string
              p_line_items: Json
              p_period: string
              p_total_amount: number
              p_unit_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_association_id: string
              p_bill_no: string
              p_bill_type?: string
              p_due_date: string
              p_gst_amount?: number
              p_line_items: Json
              p_period: string
              p_total_amount: number
              p_unit_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_association_id: string
              p_bill_no: string
              p_bill_type?: string
              p_due_date: string
              p_gst_amount?: number
              p_line_items: Json
              p_period: string
              p_tenancy_id?: string
              p_total_amount: number
              p_unit_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_advance_applied?: number
              p_association_id: string
              p_bill_no: string
              p_bill_type?: string
              p_due_date: string
              p_gst_amount?: number
              p_line_items: Json
              p_period: string
              p_tenancy_id?: string
              p_total_amount: number
              p_unit_id: string
            }
            Returns: string
          }
      create_invitation: {
        Args: { account_id: string; email: string; role: string }
        Returns: {
          account_id: string
          created_at: string
          email: string | null
          expires_at: string
          id: number
          invite_token: string
          invited_by: string
          invitee_name: string | null
          phone: string | null
          role: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_nonce: {
        Args: {
          p_expires_in_seconds?: number
          p_metadata?: Json
          p_purpose?: string
          p_revoke_previous?: boolean
          p_scopes?: string[]
          p_user_id?: string
        }
        Returns: Json
      }
      create_team_account: {
        Args: { account_name: string; account_slug?: string; user_id: string }
        Returns: {
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          is_personal_account: boolean
          name: string
          picture_url: string | null
          primary_owner_user_id: string
          product_type: string
          public_data: Json
          slug: string | null
          updated_at: string | null
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_villa_account: {
        Args: { account_name: string; account_slug?: string; user_id: string }
        Returns: {
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          is_personal_account: boolean
          name: string
          picture_url: string | null
          primary_owner_user_id: string
          product_type: string
          public_data: Json
          slug: string | null
          updated_at: string | null
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      disconnect_villa_property: {
        Args: { p_account_id: string; p_property_id: string }
        Returns: undefined
      }
      find_users_by_phones_or_emails: {
        Args: { p_emails: string[]; p_phones: string[] }
        Returns: {
          email: string
          id: string
          phone: string
        }[]
      }
      get_account_invitations: {
        Args: { account_slug: string }
        Returns: {
          account_id: string
          created_at: string
          email: string
          expires_at: string
          id: number
          invited_by: string
          inviter_email: string
          inviter_name: string
          role: string
          updated_at: string
        }[]
      }
      get_account_members: {
        Args: { account_slug: string }
        Returns: {
          account_id: string
          created_at: string
          email: string
          id: string
          name: string
          picture_url: string
          primary_owner_user_id: string
          role: string
          role_hierarchy_level: number
          updated_at: string
          user_id: string
        }[]
      }
      get_association_cash_ledger_balances: {
        Args: { p_association_id: string }
        Returns: {
          balance: number
          bill_type: string
          unit_id: string
          unit_no: string
        }[]
      }
      get_cash_ledger_balance: {
        Args: { p_bill_type: string; p_unit_id: string }
        Returns: number
      }
      get_collection_summary: {
        Args: {
          p_association_id: string
          p_bill_types?: string[]
          p_from_period?: string
          p_to_period?: string
          p_unit_ids?: string[]
        }
        Returns: {
          bill_count: number
          bill_type: string
          billed: number
          collected: number
          period: string
        }[]
      }
      get_config: { Args: never; Returns: Json }
      get_nonce_status: { Args: { p_id: string }; Returns: Json }
      get_unit_ledger_balances: {
        Args: { p_association_id: string; p_unit_ids: string[] }
        Returns: {
          bill_type: string
          net: number
          unit_id: string
        }[]
      }
      get_unit_outstanding_summary: {
        Args: { p_association_id: string }
        Returns: {
          last_payment_date: string
          overdue_count: number
          owner_name: string
          owner_phone: string
          total_outstanding: number
          unit_id: string
          unit_no: string
        }[]
      }
      get_upper_role_for_account: {
        Args: { p_account_id: string }
        Returns: string
      }
      get_upper_system_role: { Args: never; Returns: string }
      get_villa_site_credentials: {
        Args: { p_property_id: string }
        Returns: {
          service_key: string
          url: string
        }[]
      }
      has_active_subscription: {
        Args: { target_account_id: string }
        Returns: boolean
      }
      has_more_elevated_role: {
        Args: {
          role_name: string
          target_account_id: string
          target_user_id: string
        }
        Returns: boolean
      }
      has_permission: {
        Args: {
          account_id: string
          permission_name: Database["public"]["Enums"]["app_permissions"]
          user_id: string
        }
        Returns: boolean
      }
      has_role_on_account: {
        Args: { account_id: string; account_role?: string }
        Returns: boolean
      }
      has_same_role_hierarchy_level: {
        Args: {
          role_name: string
          target_account_id: string
          target_user_id: string
        }
        Returns: boolean
      }
      invalidate_association_pdf_cache: {
        Args: { p_association_id: string }
        Returns: undefined
      }
      invite_to_association_by_phone: {
        Args: {
          account_slug: string
          invited_by: string
          p_email?: string
          p_name?: string
          p_phone: string
          p_role: string
        }
        Returns: string
      }
      is_aal2: { Args: never; Returns: boolean }
      is_account_owner: { Args: { account_id: string }; Returns: boolean }
      is_account_team_member: {
        Args: { target_account_id: string }
        Returns: boolean
      }
      is_association_member: {
        Args: { p_association_id: string }
        Returns: boolean
      }
      is_mfa_compliant: { Args: never; Returns: boolean }
      is_set: { Args: { field_name: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_team_member: {
        Args: { account_id: string; user_id: string }
        Returns: boolean
      }
      recompute_overdue_bills: { Args: never; Returns: undefined }
      record_advance_payment: {
        Args: {
          p_amount: number
          p_association_id: string
          p_bill_type: string
          p_paid_by_name: string
          p_paid_by_role: string
          p_razorpay_order_id: string
          p_razorpay_payment_id: string
          p_tenancy_id: string
          p_unit_id: string
        }
        Returns: Json
      }
      record_due_payment: {
        Args: {
          p_amount: number
          p_association_id: string
          p_bill_type: string
          p_mode: string
          p_paid_by_role?: string
          p_reference_no?: string
          p_unit_id: string
        }
        Returns: string
      }
      record_due_payment_webhook: {
        Args: {
          p_amount: number
          p_association_id: string
          p_bill_type: string
          p_razorpay_payment_id: string
          p_unit_id: string
        }
        Returns: string
      }
      record_payment: {
        Args: {
          p_amount: number
          p_association_id: string
          p_bill_id: string
          p_mode: string
          p_paid_at?: string
          p_paid_by_role: string
          p_payment_batch_id?: string
          p_razorpay_order_id?: string
          p_razorpay_payment_id?: string
        }
        Returns: string
      }
      record_payment_reversal: {
        Args: { p_razorpay_payment_id: string; p_refund_amount?: number }
        Returns: undefined
      }
      record_villa_payment: {
        Args: {
          p_amount: number
          p_mode: string
          p_note: string
          p_paid_on: string
          p_payer_name: string
          p_property_id: string
          p_reference: string
          p_request_id: string
          p_site_booking_id: string
        }
        Returns: {
          account_id: string
          amount: number
          booking_code: string | null
          id: string
          mode: string
          note: string | null
          paid_on: string
          payer_name: string | null
          property_id: string
          receipt_no: string
          recorded_at: string
          recorded_by: string | null
          reference: string | null
          request_id: string
          site_booking_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "villa_booking_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_villa_refund: {
        Args: {
          p_amount: number
          p_mode: string
          p_payment_id: string
          p_reason: string
          p_reference: string
          p_refunded_on: string
          p_request_id: string
        }
        Returns: {
          account_id: string
          amount: number
          id: string
          mode: string
          payment_id: string
          property_id: string
          razorpay_refund_id: string | null
          reason: string
          recorded_at: string
          recorded_by: string | null
          reference: string | null
          refund_no: string
          refunded_on: string
          request_id: string
          site_booking_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "villa_refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_villa_discount: {
        Args: { p_approve: boolean; p_id: string }
        Returns: {
          account_id: string
          approved_at: string | null
          approved_by: string | null
          blackouts: Json
          channels: string[]
          code: string
          created_at: string
          created_by: string | null
          discount_type: string
          discount_value: number
          id: string
          max_discount: number | null
          max_uses: number | null
          max_uses_per_guest: number
          min_booking_value: number
          min_nights: number
          needs_approval: boolean | null
          note: string | null
          property_id: string
          stackable: boolean
          status: string
          updated_at: string
          valid_from: string
          valid_to: string
        }
        SetofOptions: {
          from: "*"
          to: "villa_discount_codes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_nonce: {
        Args: { p_id: string; p_reason?: string }
        Returns: boolean
      }
      save_villa_discount: {
        Args: {
          p_blackouts: Json
          p_code: string
          p_discount_type: string
          p_discount_value: number
          p_id: string
          p_max_discount: number
          p_max_uses: number
          p_max_uses_per_guest: number
          p_min_booking_value: number
          p_min_nights: number
          p_note: string
          p_property_id: string
          p_valid_from: string
          p_valid_to: string
        }
        Returns: {
          account_id: string
          approved_at: string | null
          approved_by: string | null
          blackouts: Json
          channels: string[]
          code: string
          created_at: string
          created_by: string | null
          discount_type: string
          discount_value: number
          id: string
          max_discount: number | null
          max_uses: number | null
          max_uses_per_guest: number
          min_booking_value: number
          min_nights: number
          needs_approval: boolean | null
          note: string | null
          property_id: string
          stackable: boolean
          status: string
          updated_at: string
          valid_from: string
          valid_to: string
        }
        SetofOptions: {
          from: "*"
          to: "villa_discount_codes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_amc_reminders: { Args: never; Returns: undefined }
      set_villa_discount_active: {
        Args: { p_active: boolean; p_id: string }
        Returns: {
          account_id: string
          approved_at: string | null
          approved_by: string | null
          blackouts: Json
          channels: string[]
          code: string
          created_at: string
          created_by: string | null
          discount_type: string
          discount_value: number
          id: string
          max_discount: number | null
          max_uses: number | null
          max_uses_per_guest: number
          min_booking_value: number
          min_nights: number
          needs_approval: boolean | null
          note: string | null
          property_id: string
          stackable: boolean
          status: string
          updated_at: string
          valid_from: string
          valid_to: string
        }
        SetofOptions: {
          from: "*"
          to: "villa_discount_codes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      super_admin_delete_all_bills: {
        Args: { p_association_id: string }
        Returns: {
          deleted_bills: number
          deleted_payments: number
          deleted_receipts: number
        }[]
      }
      super_admin_delete_all_payments: {
        Args: { p_association_id: string }
        Returns: {
          deleted_payments: number
          deleted_receipts: number
        }[]
      }
      team_account_workspace: {
        Args: { account_slug: string }
        Returns: {
          id: string
          name: string
          permissions: Database["public"]["Enums"]["app_permissions"][]
          picture_url: string
          primary_owner_user_id: string
          role: string
          role_hierarchy_level: number
          slug: string
          subscription_status: Database["public"]["Enums"]["subscription_status"]
        }[]
      }
      transfer_team_account_ownership: {
        Args: { new_owner_id: string; target_account_id: string }
        Returns: undefined
      }
      upsert_order: {
        Args: {
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          currency: string
          line_items: Json
          status: Database["public"]["Enums"]["payment_status"]
          target_account_id: string
          target_customer_id: string
          target_order_id: string
          total_amount: number
        }
        Returns: {
          account_id: string
          billing_customer_id: number
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          created_at: string
          currency: string
          id: string
          status: Database["public"]["Enums"]["payment_status"]
          total_amount: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_subscription: {
        Args: {
          active: boolean
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          cancel_at_period_end: boolean
          currency: string
          line_items: Json
          period_ends_at: string
          period_starts_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          target_account_id: string
          target_customer_id: string
          target_subscription_id: string
          trial_ends_at?: string
          trial_starts_at?: string
        }
        Returns: {
          account_id: string
          active: boolean
          billing_customer_id: number
          billing_provider: Database["public"]["Enums"]["billing_provider"]
          cancel_at_period_end: boolean
          created_at: string
          currency: string
          id: string
          period_ends_at: string
          period_starts_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          trial_starts_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      verify_nonce: {
        Args: {
          p_ip?: unknown
          p_max_verification_attempts?: number
          p_purpose: string
          p_required_scopes?: string[]
          p_token: string
          p_user_agent?: string
          p_user_id?: string
        }
        Returns: Json
      }
      villa_role: { Args: { p_account_id: string }; Returns: string }
      void_bill: {
        Args: { p_bill_id: string; p_reason: string }
        Returns: undefined
      }
      void_bills_bulk: {
        Args: {
          p_association_id: string
          p_bill_type: string
          p_period: string
          p_reason: string
        }
        Returns: number
      }
      void_villa_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: {
          account_id: string
          amount: number
          booking_code: string | null
          id: string
          mode: string
          note: string | null
          paid_on: string
          payer_name: string | null
          property_id: string
          receipt_no: string
          recorded_at: string
          recorded_by: string | null
          reference: string | null
          request_id: string
          site_booking_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "villa_booking_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_permissions:
        | "roles.manage"
        | "billing.manage"
        | "settings.manage"
        | "members.manage"
        | "invites.manage"
        | "units.manage"
        | "payments.manage"
        | "reports.view"
      billing_provider: "stripe" | "lemon-squeezy" | "paddle"
      notification_channel: "in_app" | "email"
      notification_type: "info" | "warning" | "error"
      payment_status: "pending" | "succeeded" | "failed"
      subscription_item_type: "flat" | "per_seat" | "metered"
      subscription_status:
        | "active"
        | "trialing"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "incomplete"
        | "incomplete_expired"
        | "paused"
    }
    CompositeTypes: {
      invitation: {
        email: string | null
        role: string | null
      }
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_permissions: [
        "roles.manage",
        "billing.manage",
        "settings.manage",
        "members.manage",
        "invites.manage",
        "units.manage",
        "payments.manage",
        "reports.view",
      ],
      billing_provider: ["stripe", "lemon-squeezy", "paddle"],
      notification_channel: ["in_app", "email"],
      notification_type: ["info", "warning", "error"],
      payment_status: ["pending", "succeeded", "failed"],
      subscription_item_type: ["flat", "per_seat", "metered"],
      subscription_status: [
        "active",
        "trialing",
        "past_due",
        "canceled",
        "unpaid",
        "incomplete",
        "incomplete_expired",
        "paused",
      ],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const

