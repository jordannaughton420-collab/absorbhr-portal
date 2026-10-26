export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_kind: string;
          actor_user_id: string | null;
          changed_fields: string[] | null;
          entity: string;
          entity_id: string | null;
          id: number;
          ip_hash: string | null;
          metadata: Json;
          occurred_at: string;
          subject_employee_id: string | null;
          tenant_id: string | null;
        };
        Insert: {
          action: string;
          actor_kind: string;
          actor_user_id?: string | null;
          changed_fields?: string[] | null;
          entity: string;
          entity_id?: string | null;
          id?: never;
          ip_hash?: string | null;
          metadata?: Json;
          occurred_at?: string;
          subject_employee_id?: string | null;
          tenant_id?: string | null;
        };
        Update: {
          action?: string;
          actor_kind?: string;
          actor_user_id?: string | null;
          changed_fields?: string[] | null;
          entity?: string;
          entity_id?: string | null;
          id?: never;
          ip_hash?: string | null;
          metadata?: Json;
          occurred_at?: string;
          subject_employee_id?: string | null;
          tenant_id?: string | null;
        };
        Relationships: [];
      };
      departments: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "departments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      emergency_contacts: {
        Row: {
          alt_phone: string | null;
          created_at: string;
          employee_id: string;
          id: string;
          name: string;
          phone: string;
          relationship: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          alt_phone?: string | null;
          created_at?: string;
          employee_id: string;
          id?: string;
          name: string;
          phone: string;
          relationship?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          alt_phone?: string | null;
          created_at?: string;
          employee_id?: string;
          id?: string;
          name?: string;
          phone?: string;
          relationship?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_tenant_id_employee_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "employee_directory";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "emergency_contacts_tenant_id_employee_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      employee_personal: {
        Row: {
          address_line1: string | null;
          address_line2: string | null;
          date_of_birth: string | null;
          employee_id: string;
          personal_email: string | null;
          personal_phone: string | null;
          postcode: string | null;
          tenant_id: string;
          town: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          address_line1?: string | null;
          address_line2?: string | null;
          date_of_birth?: string | null;
          employee_id: string;
          personal_email?: string | null;
          personal_phone?: string | null;
          postcode?: string | null;
          tenant_id?: string;
          town?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          address_line1?: string | null;
          address_line2?: string | null;
          date_of_birth?: string | null;
          employee_id?: string;
          personal_email?: string | null;
          personal_phone?: string | null;
          postcode?: string | null;
          tenant_id?: string;
          town?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "employee_personal_tenant_id_employee_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "employee_directory";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "employee_personal_tenant_id_employee_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      employee_sensitive: {
        Row: {
          employee_id: string;
          payload: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          employee_id: string;
          payload: string;
          tenant_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          employee_id?: string;
          payload?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "employee_sensitive_tenant_id_employee_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "employee_directory";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "employee_sensitive_tenant_id_employee_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      employees: {
        Row: {
          anonymised_at: string | null;
          continuous_service_date: string | null;
          contract_type: Database["public"]["Enums"]["contract_type"];
          created_at: string;
          created_by: string | null;
          days_per_week: number | null;
          department_id: string | null;
          employee_number: string | null;
          end_date: string | null;
          first_name: string;
          fixed_term_end_date: string | null;
          id: string;
          job_title: string | null;
          last_name: string;
          location_id: string | null;
          manager_id: string | null;
          preferred_name: string | null;
          probation_end_date: string | null;
          start_date: string;
          status: Database["public"]["Enums"]["employment_status"];
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          user_id: string | null;
          weekly_hours: number | null;
          work_email: string | null;
        };
        Insert: {
          anonymised_at?: string | null;
          continuous_service_date?: string | null;
          contract_type?: Database["public"]["Enums"]["contract_type"];
          created_at?: string;
          created_by?: string | null;
          days_per_week?: number | null;
          department_id?: string | null;
          employee_number?: string | null;
          end_date?: string | null;
          first_name: string;
          fixed_term_end_date?: string | null;
          id?: string;
          job_title?: string | null;
          last_name: string;
          location_id?: string | null;
          manager_id?: string | null;
          preferred_name?: string | null;
          probation_end_date?: string | null;
          start_date: string;
          status?: Database["public"]["Enums"]["employment_status"];
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          user_id?: string | null;
          weekly_hours?: number | null;
          work_email?: string | null;
        };
        Update: {
          anonymised_at?: string | null;
          continuous_service_date?: string | null;
          contract_type?: Database["public"]["Enums"]["contract_type"];
          created_at?: string;
          created_by?: string | null;
          days_per_week?: number | null;
          department_id?: string | null;
          employee_number?: string | null;
          end_date?: string | null;
          first_name?: string;
          fixed_term_end_date?: string | null;
          id?: string;
          job_title?: string | null;
          last_name?: string;
          location_id?: string | null;
          manager_id?: string | null;
          preferred_name?: string | null;
          probation_end_date?: string | null;
          start_date?: string;
          status?: Database["public"]["Enums"]["employment_status"];
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          user_id?: string | null;
          weekly_hours?: number | null;
          work_email?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "employees_tenant_id_department_id_fkey";
            columns: ["tenant_id", "department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "employees_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employees_tenant_id_location_id_fkey";
            columns: ["tenant_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "employees_tenant_id_manager_id_fkey";
            columns: ["tenant_id", "manager_id"];
            isOneToOne: false;
            referencedRelation: "employee_directory";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "employees_tenant_id_manager_id_fkey";
            columns: ["tenant_id", "manager_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      employment_history: {
        Row: {
          created_at: string;
          created_by: string | null;
          department_id: string | null;
          effective_date: string;
          employee_id: string;
          id: string;
          job_title: string | null;
          manager_id: string | null;
          note: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          department_id?: string | null;
          effective_date: string;
          employee_id: string;
          id?: string;
          job_title?: string | null;
          manager_id?: string | null;
          note?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          department_id?: string | null;
          effective_date?: string;
          employee_id?: string;
          id?: string;
          job_title?: string | null;
          manager_id?: string | null;
          note?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "employment_history_tenant_id_department_id_fkey";
            columns: ["tenant_id", "department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "employment_history_tenant_id_employee_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "employee_directory";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "employment_history_tenant_id_employee_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "employment_history_tenant_id_manager_id_fkey";
            columns: ["tenant_id", "manager_id"];
            isOneToOne: false;
            referencedRelation: "employee_directory";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "employment_history_tenant_id_manager_id_fkey";
            columns: ["tenant_id", "manager_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      locations: {
        Row: {
          address: string | null;
          bank_holiday_region: Database["public"]["Enums"]["bank_holiday_region"] | null;
          created_at: string;
          id: string;
          name: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          address?: string | null;
          bank_holiday_region?: Database["public"]["Enums"]["bank_holiday_region"] | null;
          created_at?: string;
          id?: string;
          name: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          address?: string | null;
          bank_holiday_region?: Database["public"]["Enums"]["bank_holiday_region"] | null;
          created_at?: string;
          id?: string;
          name?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "locations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          role: Database["public"]["Enums"]["app_role"];
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          role?: Database["public"]["Enums"]["app_role"];
          tenant_id: string;
          updated_at?: string;
          updated_by?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          role?: Database["public"]["Enums"]["app_role"];
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_admins: {
        Row: {
          created_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      privacy_notice_acknowledgements: {
        Row: {
          acknowledged_at: string;
          id: string;
          notice_id: string;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          acknowledged_at?: string;
          id?: string;
          notice_id: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          acknowledged_at?: string;
          id?: string;
          notice_id?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "privacy_notice_acknowledgements_notice_id_fkey";
            columns: ["notice_id"];
            isOneToOne: false;
            referencedRelation: "privacy_notices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "privacy_notice_acknowledgements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      privacy_notices: {
        Row: {
          body: string;
          created_at: string;
          created_by: string | null;
          id: string;
          published_at: string | null;
          tenant_id: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          body: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          published_at?: string | null;
          tenant_id?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
          version: number;
        };
        Update: {
          body?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          published_at?: string | null;
          tenant_id?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "privacy_notices_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      right_to_work_checks: {
        Row: {
          check_type: string;
          checked_by: string | null;
          checked_on: string;
          created_at: string;
          employee_id: string;
          expiry_date: string | null;
          follow_up_date: string | null;
          id: string;
          notes: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          check_type: string;
          checked_by?: string | null;
          checked_on: string;
          created_at?: string;
          employee_id: string;
          expiry_date?: string | null;
          follow_up_date?: string | null;
          id?: string;
          notes?: string | null;
          status: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          check_type?: string;
          checked_by?: string | null;
          checked_on?: string;
          created_at?: string;
          employee_id?: string;
          expiry_date?: string | null;
          follow_up_date?: string | null;
          id?: string;
          notes?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "right_to_work_checks_tenant_id_employee_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "employee_directory";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "right_to_work_checks_tenant_id_employee_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      salary_history: {
        Row: {
          amount: number;
          created_at: string;
          created_by: string | null;
          currency: string;
          effective_date: string;
          employee_id: string;
          id: string;
          pay_basis: string;
          reason: string | null;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          amount: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          effective_date: string;
          employee_id: string;
          id?: string;
          pay_basis?: string;
          reason?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          amount?: number;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          effective_date?: string;
          employee_id?: string;
          id?: string;
          pay_basis?: string;
          reason?: string | null;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "salary_history_tenant_id_employee_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "employee_directory";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "salary_history_tenant_id_employee_id_fkey";
            columns: ["tenant_id", "employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
      support_sessions: {
        Row: {
          admin_user_id: string;
          ended_at: string | null;
          expires_at: string;
          id: string;
          reason: string;
          started_at: string;
          tenant_id: string;
        };
        Insert: {
          admin_user_id: string;
          ended_at?: string | null;
          expires_at: string;
          id?: string;
          reason: string;
          started_at?: string;
          tenant_id: string;
        };
        Update: {
          admin_user_id?: string;
          ended_at?: string | null;
          expires_at?: string;
          id?: string;
          reason?: string;
          started_at?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_sessions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_settings: {
        Row: {
          diversity_monitoring_enabled: boolean;
          employees_can_view_own_salary: boolean;
          leave_year_start_day: number;
          leave_year_start_month: number;
          require_mfa_for_all: boolean;
          session_idle_minutes: number;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          diversity_monitoring_enabled?: boolean;
          employees_can_view_own_salary?: boolean;
          leave_year_start_day?: number;
          leave_year_start_month?: number;
          require_mfa_for_all?: boolean;
          session_idle_minutes?: number;
          tenant_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          diversity_monitoring_enabled?: boolean;
          employees_can_view_own_salary?: boolean;
          leave_year_start_day?: number;
          leave_year_start_month?: number;
          require_mfa_for_all?: boolean;
          session_idle_minutes?: number;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          bank_holiday_region: Database["public"]["Enums"]["bank_holiday_region"];
          created_at: string;
          id: string;
          name: string;
          plan_tier: string;
          status: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          bank_holiday_region?: Database["public"]["Enums"]["bank_holiday_region"];
          created_at?: string;
          id?: string;
          name: string;
          plan_tier?: string;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          bank_holiday_region?: Database["public"]["Enums"]["bank_holiday_region"];
          created_at?: string;
          id?: string;
          name?: string;
          plan_tier?: string;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      employee_directory: {
        Row: {
          department_id: string | null;
          department_name: string | null;
          first_name: string | null;
          id: string | null;
          job_title: string | null;
          last_name: string | null;
          location_id: string | null;
          location_name: string | null;
          manager_id: string | null;
          preferred_name: string | null;
          tenant_id: string | null;
          work_email: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "employees_tenant_id_department_id_fkey";
            columns: ["tenant_id", "department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "employees_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employees_tenant_id_location_id_fkey";
            columns: ["tenant_id", "location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "employees_tenant_id_manager_id_fkey";
            columns: ["tenant_id", "manager_id"];
            isOneToOne: false;
            referencedRelation: "employee_directory";
            referencedColumns: ["tenant_id", "id"];
          },
          {
            foreignKeyName: "employees_tenant_id_manager_id_fkey";
            columns: ["tenant_id", "manager_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["tenant_id", "id"];
          },
        ];
      };
    };
    Functions: {
      acknowledge_privacy_notice: {
        Args: { p_notice: string };
        Returns: undefined;
      };
      create_tenant: {
        Args: {
          p_name: string;
          p_region?: Database["public"]["Enums"]["bank_holiday_region"];
        };
        Returns: string;
      };
      current_privacy_notice: {
        Args: never;
        Returns: {
          acknowledged_at: string;
          body: string;
          id: string;
          published_at: string;
          title: string;
          version: number;
        }[];
      };
      end_support_session: { Args: never; Returns: undefined };
      get_employee_sensitive: { Args: { p_employee: string }; Returns: Json };
      log_event: {
        Args: {
          p_action: string;
          p_entity: string;
          p_entity_id?: string;
          p_metadata?: Json;
          p_subject_employee_id?: string;
        };
        Returns: undefined;
      };
      rate_limit_hit: {
        Args: { p_bucket: string; p_max: number; p_window_seconds: number };
        Returns: boolean;
      };
      set_employee_sensitive: {
        Args: { p_data: Json; p_employee: string };
        Returns: undefined;
      };
      start_support_session: {
        Args: { p_minutes?: number; p_reason: string; p_tenant: string };
        Returns: string;
      };
    };
    Enums: {
      app_role: "client_admin" | "hr_manager" | "line_manager" | "employee";
      bank_holiday_region: "england-and-wales" | "scotland" | "northern-ireland";
      contract_type:
        "permanent" | "fixed_term" | "zero_hours" | "casual" | "apprentice" | "contractor";
      employment_status: "pre_start" | "active" | "leaver";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["client_admin", "hr_manager", "line_manager", "employee"],
      bank_holiday_region: ["england-and-wales", "scotland", "northern-ireland"],
      contract_type: [
        "permanent",
        "fixed_term",
        "zero_hours",
        "casual",
        "apprentice",
        "contractor",
      ],
      employment_status: ["pre_start", "active", "leaver"],
    },
  },
} as const;
