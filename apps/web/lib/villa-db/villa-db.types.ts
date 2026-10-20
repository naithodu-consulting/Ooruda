export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      addon_services: {
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          price: number;
          pricing_unit: string | null;
          property_id: string;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          price: number;
          pricing_unit?: string | null;
          property_id: string;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          price?: number;
          pricing_unit?: string | null;
          property_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'addon_services_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_logs: {
        Row: {
          actor_id: string | null;
          actor_role: string | null;
          created_at: string | null;
          entity_id: string | null;
          entity_type: string | null;
          event_type: string;
          id: number;
          ip_address: unknown;
          new_data: Json | null;
          old_data: Json | null;
        };
        Insert: {
          actor_id?: string | null;
          actor_role?: string | null;
          created_at?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          event_type: string;
          id?: number;
          ip_address?: unknown;
          new_data?: Json | null;
          old_data?: Json | null;
        };
        Update: {
          actor_id?: string | null;
          actor_role?: string | null;
          created_at?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          event_type?: string;
          id?: number;
          ip_address?: unknown;
          new_data?: Json | null;
          old_data?: Json | null;
        };
        Relationships: [];
      };
      blocked_dates: {
        Row: {
          created_at: string | null;
          end_date: string;
          id: string;
          notes: string | null;
          property_id: string;
          reason: string | null;
          start_date: string;
        };
        Insert: {
          created_at?: string | null;
          end_date: string;
          id?: string;
          notes?: string | null;
          property_id: string;
          reason?: string | null;
          start_date: string;
        };
        Update: {
          created_at?: string | null;
          end_date?: string;
          id?: string;
          notes?: string | null;
          property_id?: string;
          reason?: string | null;
          start_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blocked_dates_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      bookings: {
        Row: {
          access_token: string;
          base_amount: number;
          booking_channel: string | null;
          booking_code: string | null;
          channel_reservation_id: string | null;
          check_in: string;
          check_out: string;
          confirmed_at: string | null;
          created_at: string | null;
          deposit_amount: number | null;
          discount_amount: number;
          discount_code: string | null;
          expires_at: string | null;
          extra_guest_amount: number | null;
          guest_company: string | null;
          guest_email: string;
          guest_gstin: string | null;
          guest_name: string;
          guest_phone: string;
          hold_expires_at: string | null;
          id: string;
          id_status: string;
          id_status_updated_at: string | null;
          invoice_date: string | null;
          invoice_number: string | null;
          num_adults: number;
          num_children: number | null;
          num_infants: number | null;
          num_nights: number;
          payment_status: string | null;
          property_id: string;
          reference_number: string;
          source: string | null;
          special_requests: string | null;
          status: string | null;
          tax_amount: number;
          total_amount: number;
          updated_at: string | null;
        };
        Insert: {
          access_token?: string;
          base_amount: number;
          booking_channel?: string | null;
          booking_code?: string | null;
          channel_reservation_id?: string | null;
          check_in: string;
          check_out: string;
          confirmed_at?: string | null;
          created_at?: string | null;
          deposit_amount?: number | null;
          discount_amount?: number;
          discount_code?: string | null;
          expires_at?: string | null;
          extra_guest_amount?: number | null;
          guest_company?: string | null;
          guest_email: string;
          guest_gstin?: string | null;
          guest_name: string;
          guest_phone: string;
          hold_expires_at?: string | null;
          id?: string;
          id_status?: string;
          id_status_updated_at?: string | null;
          invoice_date?: string | null;
          invoice_number?: string | null;
          num_adults?: number;
          num_children?: number | null;
          num_infants?: number | null;
          num_nights: number;
          payment_status?: string | null;
          property_id: string;
          reference_number: string;
          source?: string | null;
          special_requests?: string | null;
          status?: string | null;
          tax_amount?: number;
          total_amount: number;
          updated_at?: string | null;
        };
        Update: {
          access_token?: string;
          base_amount?: number;
          booking_channel?: string | null;
          booking_code?: string | null;
          channel_reservation_id?: string | null;
          check_in?: string;
          check_out?: string;
          confirmed_at?: string | null;
          created_at?: string | null;
          deposit_amount?: number | null;
          discount_amount?: number;
          discount_code?: string | null;
          expires_at?: string | null;
          extra_guest_amount?: number | null;
          guest_company?: string | null;
          guest_email?: string;
          guest_gstin?: string | null;
          guest_name?: string;
          guest_phone?: string;
          hold_expires_at?: string | null;
          id?: string;
          id_status?: string;
          id_status_updated_at?: string | null;
          invoice_date?: string | null;
          invoice_number?: string | null;
          num_adults?: number;
          num_children?: number | null;
          num_infants?: number | null;
          num_nights?: number;
          payment_status?: string | null;
          property_id?: string;
          reference_number?: string;
          source?: string | null;
          special_requests?: string | null;
          status?: string | null;
          tax_amount?: number;
          total_amount?: number;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bookings_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      channel_sync_log: {
        Row: {
          channel: string;
          created_at: string;
          direction: string;
          error_message: string | null;
          event_type: string;
          id: string;
          outcome: string;
          payload: Json | null;
          property_id: string | null;
        };
        Insert: {
          channel: string;
          created_at?: string;
          direction: string;
          error_message?: string | null;
          event_type: string;
          id?: string;
          outcome: string;
          payload?: Json | null;
          property_id?: string | null;
        };
        Update: {
          channel?: string;
          created_at?: string;
          direction?: string;
          error_message?: string | null;
          event_type?: string;
          id?: string;
          outcome?: string;
          payload?: Json | null;
          property_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'channel_sync_log_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      discount_codes: {
        Row: {
          blackouts: Json;
          code: string;
          created_at: string;
          discount_type: string;
          discount_value: number;
          id: string;
          is_active: boolean;
          max_discount: number | null;
          max_uses: number | null;
          max_uses_per_guest: number;
          min_booking_value: number;
          min_nights: number;
          property_id: string;
          valid_from: string;
          valid_to: string;
        };
        Insert: {
          blackouts?: Json;
          code: string;
          created_at?: string;
          discount_type: string;
          discount_value: number;
          id: string;
          is_active?: boolean;
          max_discount?: number | null;
          max_uses?: number | null;
          max_uses_per_guest?: number;
          min_booking_value?: number;
          min_nights?: number;
          property_id: string;
          valid_from: string;
          valid_to: string;
        };
        Update: {
          blackouts?: Json;
          code?: string;
          created_at?: string;
          discount_type?: string;
          discount_value?: number;
          id?: string;
          is_active?: boolean;
          max_discount?: number | null;
          max_uses?: number | null;
          max_uses_per_guest?: number;
          min_booking_value?: number;
          min_nights?: number;
          property_id?: string;
          valid_from?: string;
          valid_to?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'discount_codes_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      enquiries: {
        Row: {
          check_in: string | null;
          check_out: string | null;
          created_at: string;
          email: string | null;
          guest_count: number | null;
          id: string;
          message: string | null;
          name: string;
          notes: string | null;
          phone: string | null;
          property_id: string | null;
          source: string;
          status: string;
        };
        Insert: {
          check_in?: string | null;
          check_out?: string | null;
          created_at?: string;
          email?: string | null;
          guest_count?: number | null;
          id?: string;
          message?: string | null;
          name: string;
          notes?: string | null;
          phone?: string | null;
          property_id?: string | null;
          source?: string;
          status?: string;
        };
        Update: {
          check_in?: string | null;
          check_out?: string | null;
          created_at?: string;
          email?: string | null;
          guest_count?: number | null;
          id?: string;
          message?: string | null;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          property_id?: string | null;
          source?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'enquiries_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      events: {
        Row: {
          body: string | null;
          created_at: string;
          event_date: string | null;
          event_time: string | null;
          id: string;
          image_url: string | null;
          is_published: boolean;
          property_id: string;
          slug: string;
          title: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          event_date?: string | null;
          event_time?: string | null;
          id?: string;
          image_url?: string | null;
          is_published?: boolean;
          property_id: string;
          slug: string;
          title: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          event_date?: string | null;
          event_time?: string | null;
          id?: string;
          image_url?: string | null;
          is_published?: boolean;
          property_id?: string;
          slug?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'events_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      external_reservations: {
        Row: {
          amount_paise: number | null;
          booking_id: string | null;
          channel: string;
          channel_reservation_id: string;
          check_in: string;
          check_out: string;
          created_at: string;
          guest_count: number | null;
          guest_name: string | null;
          id: string;
          property_id: string;
          raw_payload: Json | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount_paise?: number | null;
          booking_id?: string | null;
          channel: string;
          channel_reservation_id: string;
          check_in: string;
          check_out: string;
          created_at?: string;
          guest_count?: number | null;
          guest_name?: string | null;
          id?: string;
          property_id: string;
          raw_payload?: Json | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount_paise?: number | null;
          booking_id?: string | null;
          channel?: string;
          channel_reservation_id?: string;
          check_in?: string;
          check_out?: string;
          created_at?: string;
          guest_count?: number | null;
          guest_name?: string | null;
          id?: string;
          property_id?: string;
          raw_payload?: Json | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'external_reservations_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_reservations_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      faqs: {
        Row: {
          answer: string;
          category: string;
          created_at: string;
          display_order: number;
          id: string;
          is_featured: boolean;
          is_published: boolean;
          property_id: string;
          question: string;
        };
        Insert: {
          answer: string;
          category?: string;
          created_at?: string;
          display_order?: number;
          id?: string;
          is_featured?: boolean;
          is_published?: boolean;
          property_id: string;
          question: string;
        };
        Update: {
          answer?: string;
          category?: string;
          created_at?: string;
          display_order?: number;
          id?: string;
          is_featured?: boolean;
          is_published?: boolean;
          property_id?: string;
          question?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'faqs_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      invoice_sequences: {
        Row: {
          financial_year: number;
          next_val: number;
          property_id: string;
        };
        Insert: {
          financial_year: number;
          next_val: number;
          property_id: string;
        };
        Update: {
          financial_year?: number;
          next_val?: number;
          property_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invoice_sequences_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      journal_posts: {
        Row: {
          body: string;
          category: string;
          cover_alt: string | null;
          cover_image_url: string | null;
          created_at: string;
          excerpt: string;
          id: string;
          property_id: string;
          published_at: string | null;
          slug: string;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          category: string;
          cover_alt?: string | null;
          cover_image_url?: string | null;
          created_at?: string;
          excerpt: string;
          id?: string;
          property_id: string;
          published_at?: string | null;
          slug: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          category?: string;
          cover_alt?: string | null;
          cover_image_url?: string | null;
          created_at?: string;
          excerpt?: string;
          id?: string;
          property_id?: string;
          published_at?: string | null;
          slug?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'journal_posts_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      nearby_places: {
        Row: {
          category: string;
          created_at: string;
          display_order: number;
          distance_km: number | null;
          id: string;
          is_published: boolean;
          name: string;
          note: string | null;
          property_id: string;
          travel_minutes: number | null;
        };
        Insert: {
          category: string;
          created_at?: string;
          display_order?: number;
          distance_km?: number | null;
          id?: string;
          is_published?: boolean;
          name: string;
          note?: string | null;
          property_id: string;
          travel_minutes?: number | null;
        };
        Update: {
          category?: string;
          created_at?: string;
          display_order?: number;
          distance_km?: number | null;
          id?: string;
          is_published?: boolean;
          name?: string;
          note?: string | null;
          property_id?: string;
          travel_minutes?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'nearby_places_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_templates: {
        Row: {
          body_html: string | null;
          body_text: string;
          channel: string;
          created_at: string | null;
          event_name: string;
          id: string;
          is_active: boolean | null;
          subject: string | null;
          updated_at: string | null;
          variables: Json | null;
        };
        Insert: {
          body_html?: string | null;
          body_text: string;
          channel?: string;
          created_at?: string | null;
          event_name: string;
          id?: string;
          is_active?: boolean | null;
          subject?: string | null;
          updated_at?: string | null;
          variables?: Json | null;
        };
        Update: {
          body_html?: string | null;
          body_text?: string;
          channel?: string;
          created_at?: string | null;
          event_name?: string;
          id?: string;
          is_active?: boolean | null;
          subject?: string | null;
          updated_at?: string | null;
          variables?: Json | null;
        };
        Relationships: [];
      };
      offers: {
        Row: {
          body: string | null;
          created_at: string;
          discount_type: string | null;
          discount_value: number | null;
          id: string;
          image_url: string | null;
          is_published: boolean;
          property_id: string;
          slug: string;
          title: string;
          valid_from: string | null;
          valid_to: string | null;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          discount_type?: string | null;
          discount_value?: number | null;
          id?: string;
          image_url?: string | null;
          is_published?: boolean;
          property_id: string;
          slug: string;
          title: string;
          valid_from?: string | null;
          valid_to?: string | null;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          discount_type?: string | null;
          discount_value?: number | null;
          id?: string;
          image_url?: string | null;
          is_published?: boolean;
          property_id?: string;
          slug?: string;
          title?: string;
          valid_from?: string | null;
          valid_to?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'offers_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      page_sections: {
        Row: {
          body: string | null;
          cta_href: string | null;
          cta_label: string | null;
          id: string;
          image_url: string | null;
          is_published: boolean;
          page: string;
          property_id: string;
          section_key: string;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          body?: string | null;
          cta_href?: string | null;
          cta_label?: string | null;
          id?: string;
          image_url?: string | null;
          is_published?: boolean;
          page: string;
          property_id: string;
          section_key: string;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          body?: string | null;
          cta_href?: string | null;
          cta_label?: string | null;
          id?: string;
          image_url?: string | null;
          is_published?: boolean;
          page?: string;
          property_id?: string;
          section_key?: string;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'page_sections_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          booking_id: string;
          created_at: string | null;
          currency: string | null;
          id: string;
          raw_payload: Json | null;
          razorpay_order_id: string;
          razorpay_payment_id: string | null;
          razorpay_signature: string | null;
          status: string | null;
        };
        Insert: {
          amount: number;
          booking_id: string;
          created_at?: string | null;
          currency?: string | null;
          id?: string;
          raw_payload?: Json | null;
          razorpay_order_id: string;
          razorpay_payment_id?: string | null;
          razorpay_signature?: string | null;
          status?: string | null;
        };
        Update: {
          amount?: number;
          booking_id?: string;
          created_at?: string | null;
          currency?: string | null;
          id?: string;
          raw_payload?: Json | null;
          razorpay_order_id?: string;
          razorpay_payment_id?: string | null;
          razorpay_signature?: string | null;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
        ];
      };
      pricing_rules: {
        Row: {
          created_at: string | null;
          end_date: string;
          id: string;
          min_stay_nights: number | null;
          nightly_rate: number;
          property_id: string;
          rule_name: string;
          start_date: string;
        };
        Insert: {
          created_at?: string | null;
          end_date: string;
          id?: string;
          min_stay_nights?: number | null;
          nightly_rate: number;
          property_id: string;
          rule_name: string;
          start_date: string;
        };
        Update: {
          created_at?: string | null;
          end_date?: string;
          id?: string;
          min_stay_nights?: number | null;
          nightly_rate?: number;
          property_id?: string;
          rule_name?: string;
          start_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pricing_rules_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string | null;
          full_name: string | null;
          id: string;
          property_id: string | null;
          role: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          full_name?: string | null;
          id: string;
          property_id?: string | null;
          role?: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          full_name?: string | null;
          id?: string;
          property_id?: string | null;
          role?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      properties: {
        Row: {
          address: string;
          base_nightly_rate: number;
          base_occupancy: number;
          bathroom_count: number | null;
          bedroom_count: number | null;
          booking_code_prefix: string | null;
          check_in_time: string | null;
          check_out_time: string | null;
          city: string | null;
          created_at: string | null;
          description: string;
          descriptor: string | null;
          extra_guest_rate: number;
          extra_guest_tier2_from: number | null;
          extra_guest_tier2_rate: number | null;
          geo_lat: number | null;
          geo_lng: number | null;
          google_place_id: string | null;
          has_power_backup: boolean | null;
          has_wifi: boolean | null;
          id: string;
          ideal_occupancy: number;
          is_active: boolean | null;
          max_occupancy: number;
          name: string;
          ota_links: Json | null;
          parking_spaces: number | null;
          pincode: string | null;
          review_links: Json | null;
          slug: string;
          state: string | null;
          tagline: string | null;
          updated_at: string | null;
          weekend_nightly_rate: number;
        };
        Insert: {
          address: string;
          base_nightly_rate?: number;
          base_occupancy?: number;
          bathroom_count?: number | null;
          bedroom_count?: number | null;
          booking_code_prefix?: string | null;
          check_in_time?: string | null;
          check_out_time?: string | null;
          city?: string | null;
          created_at?: string | null;
          description: string;
          descriptor?: string | null;
          extra_guest_rate?: number;
          extra_guest_tier2_from?: number | null;
          extra_guest_tier2_rate?: number | null;
          geo_lat?: number | null;
          geo_lng?: number | null;
          google_place_id?: string | null;
          has_power_backup?: boolean | null;
          has_wifi?: boolean | null;
          id?: string;
          ideal_occupancy?: number;
          is_active?: boolean | null;
          max_occupancy?: number;
          name: string;
          ota_links?: Json | null;
          parking_spaces?: number | null;
          pincode?: string | null;
          review_links?: Json | null;
          slug: string;
          state?: string | null;
          tagline?: string | null;
          updated_at?: string | null;
          weekend_nightly_rate?: number;
        };
        Update: {
          address?: string;
          base_nightly_rate?: number;
          base_occupancy?: number;
          bathroom_count?: number | null;
          bedroom_count?: number | null;
          booking_code_prefix?: string | null;
          check_in_time?: string | null;
          check_out_time?: string | null;
          city?: string | null;
          created_at?: string | null;
          description?: string;
          descriptor?: string | null;
          extra_guest_rate?: number;
          extra_guest_tier2_from?: number | null;
          extra_guest_tier2_rate?: number | null;
          geo_lat?: number | null;
          geo_lng?: number | null;
          google_place_id?: string | null;
          has_power_backup?: boolean | null;
          has_wifi?: boolean | null;
          id?: string;
          ideal_occupancy?: number;
          is_active?: boolean | null;
          max_occupancy?: number;
          name?: string;
          ota_links?: Json | null;
          parking_spaces?: number | null;
          pincode?: string | null;
          review_links?: Json | null;
          slug?: string;
          state?: string | null;
          tagline?: string | null;
          updated_at?: string | null;
          weekend_nightly_rate?: number;
        };
        Relationships: [];
      };
      property_amenities: {
        Row: {
          category: string;
          created_at: string;
          display_order: number;
          icon: string | null;
          id: string;
          is_available: boolean;
          is_featured: boolean;
          label: string;
          property_id: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          display_order?: number;
          icon?: string | null;
          id?: string;
          is_available?: boolean;
          is_featured?: boolean;
          label: string;
          property_id: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          display_order?: number;
          icon?: string | null;
          id?: string;
          is_available?: boolean;
          is_featured?: boolean;
          label?: string;
          property_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'property_amenities_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      property_images: {
        Row: {
          alt_text: string | null;
          blur_data_url: string | null;
          caption: string | null;
          category: string | null;
          created_at: string | null;
          credit: string | null;
          credit_url: string | null;
          display_order: number | null;
          height: number | null;
          id: string;
          property_id: string;
          room_id: string | null;
          url: string;
          width: number | null;
        };
        Insert: {
          alt_text?: string | null;
          blur_data_url?: string | null;
          caption?: string | null;
          category?: string | null;
          created_at?: string | null;
          credit?: string | null;
          credit_url?: string | null;
          display_order?: number | null;
          height?: number | null;
          id?: string;
          property_id: string;
          room_id?: string | null;
          url: string;
          width?: number | null;
        };
        Update: {
          alt_text?: string | null;
          blur_data_url?: string | null;
          caption?: string | null;
          category?: string | null;
          created_at?: string | null;
          credit?: string | null;
          credit_url?: string | null;
          display_order?: number | null;
          height?: number | null;
          id?: string;
          property_id?: string;
          room_id?: string | null;
          url?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'property_images_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'property_images_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      property_policies: {
        Row: {
          body: string;
          category: string;
          created_at: string;
          display_order: number;
          id: string;
          is_published: boolean;
          key: string;
          property_id: string;
          title: string;
        };
        Insert: {
          body: string;
          category: string;
          created_at?: string;
          display_order?: number;
          id?: string;
          is_published?: boolean;
          key: string;
          property_id: string;
          title: string;
        };
        Update: {
          body?: string;
          category?: string;
          created_at?: string;
          display_order?: number;
          id?: string;
          is_published?: boolean;
          key?: string;
          property_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'property_policies_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      reviews: {
        Row: {
          body: string | null;
          booking_id: string | null;
          created_at: string | null;
          headline: string | null;
          id: string;
          is_approved: boolean | null;
          property_id: string;
          rating: number;
          reviewer_name: string;
        };
        Insert: {
          body?: string | null;
          booking_id?: string | null;
          created_at?: string | null;
          headline?: string | null;
          id?: string;
          is_approved?: boolean | null;
          property_id: string;
          rating: number;
          reviewer_name: string;
        };
        Update: {
          body?: string | null;
          booking_id?: string | null;
          created_at?: string | null;
          headline?: string | null;
          id?: string;
          is_approved?: boolean | null;
          property_id?: string;
          rating?: number;
          reviewer_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reviews_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: true;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
      rooms: {
        Row: {
          bathroom_type: string | null;
          bed_count: number | null;
          bed_type: string | null;
          created_at: string | null;
          description: string | null;
          display_order: number | null;
          features: string[] | null;
          floor: string | null;
          has_ac: boolean | null;
          has_ensuite_bathroom: boolean | null;
          id: string;
          max_guests: number | null;
          name: string;
          property_id: string;
          room_type: string | null;
          size_sqft: number | null;
          slug: string | null;
        };
        Insert: {
          bathroom_type?: string | null;
          bed_count?: number | null;
          bed_type?: string | null;
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          features?: string[] | null;
          floor?: string | null;
          has_ac?: boolean | null;
          has_ensuite_bathroom?: boolean | null;
          id?: string;
          max_guests?: number | null;
          name: string;
          property_id: string;
          room_type?: string | null;
          size_sqft?: number | null;
          slug?: string | null;
        };
        Update: {
          bathroom_type?: string | null;
          bed_count?: number | null;
          bed_type?: string | null;
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          features?: string[] | null;
          floor?: string | null;
          has_ac?: boolean | null;
          has_ensuite_bathroom?: boolean | null;
          id?: string;
          max_guests?: number | null;
          name?: string;
          property_id?: string;
          room_type?: string | null;
          size_sqft?: number | null;
          slug?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rooms_property_id_fkey';
            columns: ['property_id'];
            isOneToOne: false;
            referencedRelation: 'properties';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      allocate_invoice_number: {
        Args: { p_date: string; p_property_id: string };
        Returns: string;
      };
      check_availability: {
        Args: {
          p_check_in: string;
          p_check_out: string;
          p_property_id: string;
        };
        Returns: string;
      };
      create_booking_atomic: {
        Args: {
          p_base_amount: number;
          p_check_in: string;
          p_check_out: string;
          p_discount_amount?: number;
          p_discount_code?: string;
          p_extra_guest_amount: number;
          p_guest_email: string;
          p_guest_name: string;
          p_guest_phone: string;
          p_num_adults: number;
          p_num_children: number;
          p_num_infants: number;
          p_num_nights: number;
          p_property_id: string;
          p_special_requests: string;
          p_tax_amount: number;
          p_total_amount: number;
        };
        Returns: {
          booking_id: string;
          reference_number: string;
        }[];
      };
      expire_stale_booking_holds: { Args: never; Returns: number };
      generate_booking_code: { Args: { p_prefix: string }; Returns: string };
      get_unavailable_nights: {
        Args: { p_from: string; p_property_id: string; p_to: string };
        Returns: string[];
      };
      new_booking_access_token: { Args: never; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
