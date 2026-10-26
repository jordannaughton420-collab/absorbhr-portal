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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_kind: string
          actor_user_id: string | null
          changed_fields: string[] | null
          entity: string
          entity_id: string | null
          id: number
          ip_hash: string | null
          metadata: Json
          occurred_at: string
          subject_employee_id: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_kind: string
          actor_user_id?: string | null
          changed_fields?: string[] | null
          entity: string
          entity_id?: string | null
          id?: never
          ip_hash?: string | null
          metadata?: Json
          occurred_at?: string
          subject_employee_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_kind?: string
          actor_user_id?: string | null
          changed_fields?: string[] | null
          entity?: string
          entity_id?: string | null
          id?: never
          ip_hash?: string | null
          metadata?: Json
          occurred_at?: string
          subject_employee_id?: string | null
          tenant_id?: string | null
        }
        Relationships: []
      }
      bank_holidays: {
        Row: {
          date: string
          region: Database["public"]["Enums"]["bank_holiday_region"]
          title: string
        }
        Insert: {
          date: string
          region: Database["public"]["Enums"]["bank_holiday_region"]
          title: string
        }
        Update: {
          date?: string
          region?: Database["public"]["Enums"]["bank_holiday_region"]
          title?: string
        }
        Relationships: []
      }
      case_events: {
        Row: {
          case_id: string
          created_at: string
          created_by: string
          event_date: string
          event_type: string
          id: string
          payload: string
          tenant_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string
          event_date: string
          event_type: string
          id?: string
          payload: string
          tenant_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string
          event_date?: string
          event_type?: string
          id?: string
          payload?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_events_tenant_id_case_id_fkey"
            columns: ["tenant_id", "case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      cases: {
        Row: {
          case_type: string
          closed_on: string | null
          created_at: string
          created_by: string
          employee_id: string
          id: string
          opened_on: string
          outcome: string | null
          payload: string
          reference: string
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          case_type: string
          closed_on?: string | null
          created_at?: string
          created_by?: string
          employee_id: string
          id?: string
          opened_on?: string
          outcome?: string | null
          payload: string
          reference: string
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          case_type?: string
          closed_on?: string | null
          created_at?: string
          created_by?: string
          employee_id?: string
          id?: string
          opened_on?: string
          outcome?: string | null
          payload?: string
          reference?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "cases_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          assignee: string
          checklist_id: string
          completed_at: string | null
          completed_by: string | null
          description: string | null
          due_date: string | null
          employee_id: string
          id: string
          position: number
          tenant_id: string
          title: string
        }
        Insert: {
          assignee: string
          checklist_id: string
          completed_at?: string | null
          completed_by?: string | null
          description?: string | null
          due_date?: string | null
          employee_id: string
          id?: string
          position?: number
          tenant_id: string
          title: string
        }
        Update: {
          assignee?: string
          checklist_id?: string
          completed_at?: string | null
          completed_by?: string | null
          description?: string | null
          due_date?: string | null
          employee_id?: string
          id?: string
          position?: number
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_tenant_id_checklist_id_fkey"
            columns: ["tenant_id", "checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      checklist_template_items: {
        Row: {
          assignee: string
          description: string | null
          due_offset_days: number
          id: string
          position: number
          template_id: string
          tenant_id: string
          title: string
        }
        Insert: {
          assignee: string
          description?: string | null
          due_offset_days?: number
          id?: string
          position?: number
          template_id: string
          tenant_id: string
          title: string
        }
        Update: {
          assignee?: string
          description?: string | null
          due_offset_days?: number
          id?: string
          position?: number
          template_id?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_tenant_id_template_id_fkey"
            columns: ["tenant_id", "template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          name: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind: string
          name: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists: {
        Row: {
          anchor_date: string
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          kind: string
          template_id: string | null
          tenant_id: string
          title: string
        }
        Insert: {
          anchor_date: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          kind: string
          template_id?: string | null
          tenant_id: string
          title: string
        }
        Update: {
          anchor_date?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          kind?: string
          template_id?: string | null
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "checklists_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          case_id: string | null
          category: string
          created_at: string
          employee_id: string
          file_name: string
          id: string
          mime_type: string
          sha256: string | null
          size_bytes: number | null
          status: string
          storage_path: string
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          uploaded_by: string
          visibility: string
        }
        Insert: {
          case_id?: string | null
          category: string
          created_at?: string
          employee_id: string
          file_name: string
          id?: string
          mime_type: string
          sha256?: string | null
          size_bytes?: number | null
          status?: string
          storage_path: string
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string
          visibility: string
        }
        Update: {
          case_id?: string | null
          category?: string
          created_at?: string
          employee_id?: string
          file_name?: string
          id?: string
          mime_type?: string
          sha256?: string | null
          size_bytes?: number | null
          status?: string
          storage_path?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "documents_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          alt_phone: string | null
          created_at: string
          employee_id: string
          id: string
          name: string
          phone: string
          relationship: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alt_phone?: string | null
          created_at?: string
          employee_id: string
          id?: string
          name: string
          phone: string
          relationship?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alt_phone?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          name?: string
          phone?: string
          relationship?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "emergency_contacts_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      employee_personal: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          date_of_birth: string | null
          employee_id: string
          personal_email: string | null
          personal_phone: string | null
          postcode: string | null
          tenant_id: string
          town: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          date_of_birth?: string | null
          employee_id: string
          personal_email?: string | null
          personal_phone?: string | null
          postcode?: string | null
          tenant_id?: string
          town?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          date_of_birth?: string | null
          employee_id?: string
          personal_email?: string | null
          personal_phone?: string | null
          postcode?: string | null
          tenant_id?: string
          town?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_personal_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employee_personal_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      employee_sensitive: {
        Row: {
          employee_id: string
          payload: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          employee_id: string
          payload: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          employee_id?: string
          payload?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_sensitive_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employee_sensitive_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      employees: {
        Row: {
          anonymised_at: string | null
          continuous_service_date: string | null
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at: string
          created_by: string | null
          days_per_week: number | null
          department_id: string | null
          employee_number: string | null
          end_date: string | null
          first_name: string
          fixed_term_end_date: string | null
          id: string
          job_title: string | null
          last_name: string
          location_id: string | null
          manager_id: string | null
          preferred_name: string | null
          probation_end_date: string | null
          start_date: string
          status: Database["public"]["Enums"]["employment_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
          weekly_hours: number | null
          work_email: string | null
          working_days: number[]
        }
        Insert: {
          anonymised_at?: string | null
          continuous_service_date?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          created_by?: string | null
          days_per_week?: number | null
          department_id?: string | null
          employee_number?: string | null
          end_date?: string | null
          first_name: string
          fixed_term_end_date?: string | null
          id?: string
          job_title?: string | null
          last_name: string
          location_id?: string | null
          manager_id?: string | null
          preferred_name?: string | null
          probation_end_date?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["employment_status"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          weekly_hours?: number | null
          work_email?: string | null
          working_days?: number[]
        }
        Update: {
          anonymised_at?: string | null
          continuous_service_date?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          created_by?: string | null
          days_per_week?: number | null
          department_id?: string | null
          employee_number?: string | null
          end_date?: string | null
          first_name?: string
          fixed_term_end_date?: string | null
          id?: string
          job_title?: string | null
          last_name?: string
          location_id?: string | null
          manager_id?: string | null
          preferred_name?: string | null
          probation_end_date?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["employment_status"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          weekly_hours?: number | null
          work_email?: string | null
          working_days?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "employees_tenant_id_department_id_fkey"
            columns: ["tenant_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_tenant_id_location_id_fkey"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employees_tenant_id_manager_id_fkey"
            columns: ["tenant_id", "manager_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employees_tenant_id_manager_id_fkey"
            columns: ["tenant_id", "manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      employment_history: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          effective_date: string
          employee_id: string
          id: string
          job_title: string | null
          manager_id: string | null
          note: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          effective_date: string
          employee_id: string
          id?: string
          job_title?: string | null
          manager_id?: string | null
          note?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          effective_date?: string
          employee_id?: string
          id?: string
          job_title?: string | null
          manager_id?: string | null
          note?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employment_history_tenant_id_department_id_fkey"
            columns: ["tenant_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employment_history_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employment_history_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employment_history_tenant_id_manager_id_fkey"
            columns: ["tenant_id", "manager_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employment_history_tenant_id_manager_id_fkey"
            columns: ["tenant_id", "manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      holiday_policies: {
        Row: {
          bank_holidays_in_allowance: boolean
          carry_over_expiry_months: number | null
          carry_over_max_days: number | null
          configured_at: string | null
          configured_by: string | null
          full_time_days_per_week: number
          full_time_entitlement_days: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bank_holidays_in_allowance?: boolean
          carry_over_expiry_months?: number | null
          carry_over_max_days?: number | null
          configured_at?: string | null
          configured_by?: string | null
          full_time_days_per_week?: number
          full_time_entitlement_days?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bank_holidays_in_allowance?: boolean
          carry_over_expiry_months?: number | null
          carry_over_max_days?: number | null
          configured_at?: string | null
          configured_by?: string | null
          full_time_days_per_week?: number
          full_time_entitlement_days?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holiday_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_adjustments: {
        Row: {
          created_at: string
          created_by: string | null
          days: number
          employee_id: string
          expires_on: string | null
          id: string
          kind: string
          leave_year_start: string
          reason: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          days: number
          employee_id: string
          expires_on?: string | null
          id?: string
          kind?: string
          leave_year_start: string
          reason: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          days?: number
          employee_id?: string
          expires_on?: string | null
          id?: string
          kind?: string
          leave_year_start?: string
          reason?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_adjustments_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "leave_adjustments_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          days: number
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          employee_id: string
          employee_note: string | null
          end_date: string
          half_day_end: boolean
          half_day_start: boolean
          id: string
          leave_type_id: string
          leave_year_start: string
          requested_by: string
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          days: number
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          employee_id: string
          employee_note?: string | null
          end_date: string
          half_day_end?: boolean
          half_day_start?: boolean
          id?: string
          leave_type_id: string
          leave_year_start: string
          requested_by: string
          start_date: string
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          days?: number
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          employee_id?: string
          employee_note?: string | null
          end_date?: string
          half_day_end?: boolean
          half_day_start?: boolean
          id?: string
          leave_type_id?: string
          leave_year_start?: string
          requested_by?: string
          start_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "leave_requests_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "leave_requests_tenant_id_leave_type_id_fkey"
            columns: ["tenant_id", "leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      leave_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          deducts_allowance: boolean
          id: string
          is_paid: boolean
          name: string
          requires_approval: boolean
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          deducts_allowance?: boolean
          id?: string
          is_paid?: boolean
          name: string
          requires_approval?: boolean
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          deducts_allowance?: boolean
          id?: string
          is_paid?: boolean
          name?: string
          requires_approval?: boolean
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          bank_holiday_region:
            | Database["public"]["Enums"]["bank_holiday_region"]
            | null
          created_at: string
          id: string
          name: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          bank_holiday_region?:
            | Database["public"]["Enums"]["bank_holiday_region"]
            | null
          created_at?: string
          id?: string
          name: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          bank_holiday_region?:
            | Database["public"]["Enums"]["bank_holiday_region"]
            | null
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      one_to_one_notes: {
        Row: {
          actions: string | null
          author_id: string
          created_at: string
          employee_id: string
          id: string
          is_private: boolean
          meeting_date: string
          notes: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actions?: string | null
          author_id?: string
          created_at?: string
          employee_id: string
          id?: string
          is_private?: boolean
          meeting_date: string
          notes: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actions?: string | null
          author_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          is_private?: boolean
          meeting_date?: string
          notes?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "one_to_one_notes_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "one_to_one_notes_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      performance_reviews: {
        Row: {
          created_at: string
          created_by: string | null
          cycle_id: string | null
          employee_comments: string | null
          employee_id: string
          employee_signed_at: string | null
          id: string
          manager_assessment: string | null
          manager_signed_at: string | null
          manager_submitted_at: string | null
          objectives: string | null
          rating: number | null
          reviewer_id: string | null
          self_assessment: string | null
          self_submitted_at: string | null
          status: string
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cycle_id?: string | null
          employee_comments?: string | null
          employee_id: string
          employee_signed_at?: string | null
          id?: string
          manager_assessment?: string | null
          manager_signed_at?: string | null
          manager_submitted_at?: string | null
          objectives?: string | null
          rating?: number | null
          reviewer_id?: string | null
          self_assessment?: string | null
          self_submitted_at?: string | null
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cycle_id?: string | null
          employee_comments?: string | null
          employee_id?: string
          employee_signed_at?: string | null
          id?: string
          manager_assessment?: string | null
          manager_signed_at?: string | null
          manager_submitted_at?: string | null
          objectives?: string | null
          rating?: number | null
          reviewer_id?: string | null
          self_assessment?: string | null
          self_submitted_at?: string | null
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_reviews_tenant_id_cycle_id_fkey"
            columns: ["tenant_id", "cycle_id"]
            isOneToOne: false
            referencedRelation: "review_cycles"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "performance_reviews_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "performance_reviews_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      policies: {
        Row: {
          audience: string
          category: string
          copied_from: string | null
          created_at: string
          created_by: string | null
          department_ids: string[]
          id: string
          requires_acknowledgement: boolean
          status: string
          summary: string | null
          tenant_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audience?: string
          category?: string
          copied_from?: string | null
          created_at?: string
          created_by?: string | null
          department_ids?: string[]
          id?: string
          requires_acknowledgement?: boolean
          status?: string
          summary?: string | null
          tenant_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audience?: string
          category?: string
          copied_from?: string | null
          created_at?: string
          created_by?: string | null
          department_ids?: string[]
          id?: string
          requires_acknowledgement?: boolean
          status?: string
          summary?: string | null
          tenant_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "policies_copied_from_fkey"
            columns: ["copied_from"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_acknowledgements: {
        Row: {
          acknowledged_at: string
          employee_id: string
          id: string
          policy_id: string
          policy_version_id: string
          tenant_id: string
        }
        Insert: {
          acknowledged_at?: string
          employee_id: string
          id?: string
          policy_id: string
          policy_version_id: string
          tenant_id: string
        }
        Update: {
          acknowledged_at?: string
          employee_id?: string
          id?: string
          policy_id?: string
          policy_version_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_acknowledgements_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_acknowledgements_policy_version_id_fkey"
            columns: ["policy_version_id"]
            isOneToOne: false
            referencedRelation: "policy_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_acknowledgements_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "policy_acknowledgements_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "policy_acknowledgements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_versions: {
        Row: {
          body: string | null
          change_summary: string | null
          created_at: string
          created_by: string | null
          file_mime: string | null
          file_name: string | null
          file_path: string | null
          id: string
          policy_id: string
          published_at: string | null
          published_by: string | null
          requires_reacknowledgement: boolean
          tenant_id: string | null
          version: number
        }
        Insert: {
          body?: string | null
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          policy_id: string
          published_at?: string | null
          published_by?: string | null
          requires_reacknowledgement?: boolean
          tenant_id?: string | null
          version: number
        }
        Update: {
          body?: string | null
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          policy_id?: string
          published_at?: string | null
          published_by?: string | null
          requires_reacknowledgement?: boolean
          tenant_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "policy_versions_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_notice_acknowledgements: {
        Row: {
          acknowledged_at: string
          id: string
          notice_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          id?: string
          notice_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          id?: string
          notice_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "privacy_notice_acknowledgements_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "privacy_notices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "privacy_notice_acknowledgements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_notices: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          tenant_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          tenant_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          version: number
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          tenant_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "privacy_notices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rectification_requests: {
        Row: {
          area: string
          created_at: string
          details: string
          employee_id: string
          id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          area: string
          created_at?: string
          details: string
          employee_id: string
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          area?: string
          created_at?: string
          details?: string
          employee_id?: string
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rectification_requests_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "rectification_requests_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      return_to_work_forms: {
        Row: {
          absence_id: string
          completed_by: string
          created_at: string
          employee_acknowledged_at: string | null
          employee_id: string
          meeting_date: string
          payload: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          absence_id: string
          completed_by: string
          created_at?: string
          employee_acknowledged_at?: string | null
          employee_id: string
          meeting_date: string
          payload: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          absence_id?: string
          completed_by?: string
          created_at?: string
          employee_acknowledged_at?: string | null
          employee_id?: string
          meeting_date?: string
          payload?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_to_work_forms_absence_id_fkey"
            columns: ["absence_id"]
            isOneToOne: true
            referencedRelation: "sickness_absences"
            referencedColumns: ["id"]
          },
        ]
      }
      review_cycles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          manager_due: string | null
          name: string
          period_end: string
          period_start: string
          self_due: string | null
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          manager_due?: string | null
          name: string
          period_end: string
          period_start: string
          self_due?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          manager_due?: string | null
          name?: string
          period_end?: string
          period_start?: string
          self_due?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_cycles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      right_to_work_checks: {
        Row: {
          check_type: string
          checked_by: string | null
          checked_on: string
          created_at: string
          employee_id: string
          expiry_date: string | null
          follow_up_date: string | null
          id: string
          notes: string | null
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          check_type: string
          checked_by?: string | null
          checked_on: string
          created_at?: string
          employee_id: string
          expiry_date?: string | null
          follow_up_date?: string | null
          id?: string
          notes?: string | null
          status: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          check_type?: string
          checked_by?: string | null
          checked_on?: string
          created_at?: string
          employee_id?: string
          expiry_date?: string | null
          follow_up_date?: string | null
          id?: string
          notes?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "right_to_work_checks_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "right_to_work_checks_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      salary_history: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          effective_date: string
          employee_id: string
          id: string
          pay_basis: string
          reason: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_date: string
          employee_id: string
          id?: string
          pay_basis?: string
          reason?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_date?: string
          employee_id?: string
          id?: string
          pay_basis?: string
          reason?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_history_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "salary_history_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      sickness_absences: {
        Row: {
          created_at: string
          employee_id: string
          end_date: string | null
          exclude_from_triggers: boolean
          exclusion_basis: string | null
          half_day_end: boolean
          half_day_start: boolean
          id: string
          reported_by: string
          start_date: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          end_date?: string | null
          exclude_from_triggers?: boolean
          exclusion_basis?: string | null
          half_day_end?: boolean
          half_day_start?: boolean
          id?: string
          reported_by: string
          start_date: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          end_date?: string | null
          exclude_from_triggers?: boolean
          exclusion_basis?: string | null
          half_day_end?: boolean
          half_day_start?: boolean
          id?: string
          reported_by?: string
          start_date?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sickness_absences_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "sickness_absences_tenant_id_employee_id_fkey"
            columns: ["tenant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      sickness_details: {
        Row: {
          absence_id: string
          employee_id: string
          payload: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          absence_id: string
          employee_id: string
          payload: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          absence_id?: string
          employee_id?: string
          payload?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sickness_details_absence_id_fkey"
            columns: ["absence_id"]
            isOneToOne: true
            referencedRelation: "sickness_absences"
            referencedColumns: ["id"]
          },
        ]
      }
      support_sessions: {
        Row: {
          admin_user_id: string
          ended_at: string | null
          expires_at: string
          id: string
          reason: string
          started_at: string
          tenant_id: string
        }
        Insert: {
          admin_user_id: string
          ended_at?: string | null
          expires_at: string
          id?: string
          reason: string
          started_at?: string
          tenant_id: string
        }
        Update: {
          admin_user_id?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          reason?: string
          started_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          diversity_monitoring_enabled: boolean
          employees_can_view_own_salary: boolean
          leave_year_start_day: number
          leave_year_start_month: number
          require_mfa_for_all: boolean
          review_rating_labels: string[]
          review_rating_scale: boolean
          session_idle_minutes: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          diversity_monitoring_enabled?: boolean
          employees_can_view_own_salary?: boolean
          leave_year_start_day?: number
          leave_year_start_month?: number
          require_mfa_for_all?: boolean
          review_rating_labels?: string[]
          review_rating_scale?: boolean
          session_idle_minutes?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          diversity_monitoring_enabled?: boolean
          employees_can_view_own_salary?: boolean
          leave_year_start_day?: number
          leave_year_start_month?: number
          require_mfa_for_all?: boolean
          review_rating_labels?: string[]
          review_rating_scale?: boolean
          session_idle_minutes?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          bank_holiday_region: Database["public"]["Enums"]["bank_holiday_region"]
          created_at: string
          id: string
          name: string
          plan_tier: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bank_holiday_region?: Database["public"]["Enums"]["bank_holiday_region"]
          created_at?: string
          id?: string
          name: string
          plan_tier?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bank_holiday_region?: Database["public"]["Enums"]["bank_holiday_region"]
          created_at?: string
          id?: string
          name?: string
          plan_tier?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      employee_directory: {
        Row: {
          department_id: string | null
          department_name: string | null
          first_name: string | null
          id: string | null
          job_title: string | null
          last_name: string | null
          location_id: string | null
          location_name: string | null
          manager_id: string | null
          preferred_name: string | null
          tenant_id: string | null
          work_email: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_tenant_id_department_id_fkey"
            columns: ["tenant_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_tenant_id_location_id_fkey"
            columns: ["tenant_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employees_tenant_id_manager_id_fkey"
            columns: ["tenant_id", "manager_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "employees_tenant_id_manager_id_fkey"
            columns: ["tenant_id", "manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
    }
    Functions: {
      absence_calendar: {
        Args: { p_from: string; p_to: string }
        Returns: {
          employee_id: string
          end_date: string
          half_day_end: boolean
          half_day_start: boolean
          kind: string
          label: string
          start_date: string
          status: string
        }[]
      }
      acknowledge_policy: { Args: { p_version: string }; Returns: undefined }
      acknowledge_privacy_notice: {
        Args: { p_notice: string }
        Returns: undefined
      }
      acknowledge_return_to_work: {
        Args: { p_absence: string }
        Returns: undefined
      }
      add_case_event: {
        Args: {
          p_case: string
          p_date: string
          p_details: string
          p_type: string
        }
        Returns: string
      }
      bradford_scores: {
        Args: never
        Returns: {
          days: number
          employee_id: string
          score: number
          spells: number
        }[]
      }
      cancel_leave: { Args: { p_request: string }; Returns: undefined }
      copy_policy_template: { Args: { p_template: string }; Returns: string }
      count_leave_days: {
        Args: {
          p_employee: string
          p_end: string
          p_half_end?: boolean
          p_half_start?: boolean
          p_start: string
        }
        Returns: number
      }
      create_tenant: {
        Args: {
          p_name: string
          p_region?: Database["public"]["Enums"]["bank_holiday_region"]
        }
        Returns: string
      }
      current_privacy_notice: {
        Args: never
        Returns: {
          acknowledged_at: string
          body: string
          id: string
          published_at: string
          title: string
          version: number
        }[]
      }
      decide_leave: {
        Args: { p_approve: boolean; p_note?: string; p_request: string }
        Returns: undefined
      }
      end_sickness: {
        Args: { p_absence: string; p_end: string; p_half_end?: boolean }
        Returns: undefined
      }
      end_support_session: { Args: never; Returns: undefined }
      get_case: { Args: { p_case: string }; Returns: Json }
      get_employee_sensitive: { Args: { p_employee: string }; Returns: Json }
      get_sickness_details: { Args: { p_absence: string }; Returns: Json }
      launch_review_cycle: { Args: { p_cycle: string }; Returns: number }
      leave_balance: {
        Args: { p_employee: string; p_on?: string }
        Returns: {
          adjustments: number
          approved: number
          bank_holidays: number
          carried_over: number
          entitlement: number
          leave_year_end: string
          leave_year_start: string
          pending: number
          policy_configured: boolean
          remaining: number
        }[]
      }
      log_event: {
        Args: {
          p_action: string
          p_entity: string
          p_entity_id?: string
          p_metadata?: Json
          p_subject_employee_id?: string
        }
        Returns: undefined
      }
      my_policies: {
        Args: never
        Returns: {
          acknowledged: boolean
          acknowledged_at: string
          category: string
          current_version: number
          current_version_id: string
          policy_id: string
          requires_acknowledgement: boolean
          summary: string
          title: string
        }[]
      }
      my_review: { Args: { p_review: string }; Returns: Json }
      my_reviews: {
        Args: never
        Returns: {
          created_at: string
          id: string
          status: string
          title: string
        }[]
      }
      open_case: {
        Args: {
          p_employee: string
          p_opened_on?: string
          p_summary: string
          p_type: string
        }
        Returns: string
      }
      policy_acknowledgement_status: {
        Args: { p_policy: string }
        Returns: {
          acknowledged: boolean
          acknowledged_at: string
          acknowledged_version: number
          employee_id: string
        }[]
      }
      process_carry_over: { Args: { p_year_start: string }; Returns: number }
      publish_policy_version: {
        Args: { p_require_reack?: boolean; p_version: string }
        Returns: undefined
      }
      rate_limit_hit: {
        Args: { p_bucket: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      record_sickness: {
        Args: {
          p_employee: string
          p_end?: string
          p_half_end?: boolean
          p_half_start?: boolean
          p_notes?: string
          p_reason_category?: string
          p_start: string
        }
        Returns: string
      }
      request_leave: {
        Args: {
          p_employee: string
          p_end: string
          p_half_end?: boolean
          p_half_start?: boolean
          p_leave_type: string
          p_note?: string
          p_start: string
        }
        Returns: string
      }
      save_manager_review: {
        Args: {
          p_assessment: string
          p_objectives: string
          p_rating: number
          p_review: string
          p_submit: boolean
        }
        Returns: undefined
      }
      save_return_to_work: {
        Args: { p_absence: string; p_form: Json; p_meeting_date: string }
        Returns: undefined
      }
      save_self_assessment: {
        Args: { p_review: string; p_submit: boolean; p_text: string }
        Returns: undefined
      }
      set_checklist_item: {
        Args: { p_done: boolean; p_item: string }
        Returns: undefined
      }
      set_employee_sensitive: {
        Args: { p_data: Json; p_employee: string }
        Returns: undefined
      }
      set_sickness_exclusion: {
        Args: { p_absence: string; p_basis: string }
        Returns: undefined
      }
      sign_review: {
        Args: { p_comments?: string; p_review: string }
        Returns: undefined
      }
      start_checklist: {
        Args: { p_anchor: string; p_employee: string; p_template: string }
        Returns: string
      }
      start_review: {
        Args: { p_cycle?: string; p_employee: string; p_title: string }
        Returns: string
      }
      start_support_session: {
        Args: { p_minutes?: number; p_reason: string; p_tenant: string }
        Returns: string
      }
      update_case: {
        Args: {
          p_case: string
          p_closed_on: string
          p_outcome: string
          p_status: string
          p_summary: string
        }
        Returns: undefined
      }
      update_sickness_reason: {
        Args: { p_absence: string; p_notes: string; p_reason_category: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "client_admin" | "hr_manager" | "line_manager" | "employee"
      bank_holiday_region: "england-and-wales" | "scotland" | "northern-ireland"
      contract_type:
        | "permanent"
        | "fixed_term"
        | "zero_hours"
        | "casual"
        | "apprentice"
        | "contractor"
      employment_status: "pre_start" | "active" | "leaver"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["client_admin", "hr_manager", "line_manager", "employee"],
      bank_holiday_region: [
        "england-and-wales",
        "scotland",
        "northern-ireland",
      ],
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
} as const
