// GÉNÉRÉ AUTOMATIQUEMENT — NE PAS ÉDITER À LA MAIN.
// Régénérer avec :  npm run db:types
//
// Produit par scripts/gen-types.mjs, qui introspecte directement le
// catalogue Postgres (ni Docker ni jeton de compte requis).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      article_models: {
        Row: {
          id: number;
          ref_code: string;
          name_fr: string;
          name_ar: string | null;
          category_id: number;
          color: string | null;
          brand: string | null;
          description: string | null;
          base_price: number;
          photo_path: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          ref_code: string;
          name_fr: string;
          name_ar?: string | null;
          category_id: number;
          color?: string | null;
          brand?: string | null;
          description?: string | null;
          base_price?: number;
          photo_path?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          ref_code?: string;
          name_fr?: string;
          name_ar?: string | null;
          category_id?: number;
          color?: string | null;
          brand?: string | null;
          description?: string | null;
          base_price?: number;
          photo_path?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "article_models_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      article_units: {
        Row: {
          id: number;
          model_id: number;
          ref_code: string;
          size: string | null;
          length_cm: number | null;
          price_override: number | null;
          purchase_price: number | null;
          purchase_date: string | null;
          condition: string;
          status: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          model_id: number;
          ref_code: string;
          size?: string | null;
          length_cm?: number | null;
          price_override?: number | null;
          purchase_price?: number | null;
          purchase_date?: string | null;
          condition?: string;
          status?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          model_id?: number;
          ref_code?: string;
          size?: string | null;
          length_cm?: number | null;
          price_override?: number | null;
          purchase_price?: number | null;
          purchase_date?: string | null;
          condition?: string;
          status?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "article_units_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "article_models";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          id: number;
          slug: string;
          name_fr: string;
          name_ar: string;
          position: number;
        };
        Insert: {
          slug: string;
          name_fr: string;
          name_ar: string;
          position?: number;
        };
        Update: {
          slug?: string;
          name_fr?: string;
          name_ar?: string;
          position?: number;
        };
        Relationships: [];
      };
      ensemble_items: {
        Row: {
          ensemble_id: number;
          unit_id: number;
        };
        Insert: {
          ensemble_id: number;
          unit_id: number;
        };
        Update: {
          ensemble_id?: number;
          unit_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ensemble_items_ensemble_id_fkey";
            columns: ["ensemble_id"];
            isOneToOne: false;
            referencedRelation: "ensembles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ensemble_items_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "article_units";
            referencedColumns: ["id"];
          },
        ];
      };
      ensembles: {
        Row: {
          id: number;
          name: string;
          description: string | null;
          photo_path: string | null;
          package_price: number | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          name: string;
          description?: string | null;
          photo_path?: string | null;
          package_price?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          photo_path?: string | null;
          package_price?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      expenses: {
        Row: {
          id: number;
          spent_on: string;
          category: string;
          amount: number;
          description: string | null;
          order_id: number | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          spent_on?: string;
          category: string;
          amount: number;
          description?: string | null;
          order_id?: number | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          spent_on?: string;
          category?: string;
          amount?: number;
          description?: string | null;
          order_id?: number | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      order_lines: {
        Row: {
          id: number;
          order_id: number;
          unit_id: number | null;
          external_source: string | null;
          external_label: string | null;
          external_cost: number | null;
          unit_price: number;
          line_note: string | null;
          model_name_snapshot: string | null;
          size_snapshot: string | null;
          rental_range: string | null;
          is_active: boolean;
        };
        Insert: {
          order_id: number;
          unit_id?: number | null;
          external_source?: string | null;
          external_label?: string | null;
          external_cost?: number | null;
          unit_price?: number;
          line_note?: string | null;
          model_name_snapshot?: string | null;
          size_snapshot?: string | null;
          rental_range?: string | null;
          is_active?: boolean;
        };
        Update: {
          order_id?: number;
          unit_id?: number | null;
          external_source?: string | null;
          external_label?: string | null;
          external_cost?: number | null;
          unit_price?: number;
          line_note?: string | null;
          model_name_snapshot?: string | null;
          size_snapshot?: string | null;
          rental_range?: string | null;
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "order_lines_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_lines_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "article_units";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          id: number;
          order_no: string;
          customer_name: string;
          customer_phone: string | null;
          event_date: string;
          pickup_date: string;
          return_due_date: string;
          actual_return_date: string | null;
          subtotal: number;
          discount: number;
          total_price: number;
          amount_paid: number;
          balance: number | null;
          caution_amount: number;
          caution_returned: boolean;
          picked_up: boolean;
          returned: boolean;
          status: string;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          order_no?: string;
          customer_name: string;
          customer_phone?: string | null;
          event_date: string;
          pickup_date: string;
          return_due_date: string;
          actual_return_date?: string | null;
          subtotal?: number;
          discount?: number;
          total_price?: number;
          amount_paid?: number;
          caution_amount?: number;
          caution_returned?: boolean;
          picked_up?: boolean;
          returned?: boolean;
          status?: string;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          order_no?: string;
          customer_name?: string;
          customer_phone?: string | null;
          event_date?: string;
          pickup_date?: string;
          return_due_date?: string;
          actual_return_date?: string | null;
          subtotal?: number;
          discount?: number;
          total_price?: number;
          amount_paid?: number;
          caution_amount?: number;
          caution_returned?: boolean;
          picked_up?: boolean;
          returned?: boolean;
          status?: string;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: string;
          is_active: boolean;
          created_at: string;
          email: string | null;
        };
        Insert: {
          id: string;
          full_name: string;
          role?: string;
          is_active?: boolean;
          created_at?: string;
          email?: string | null;
        };
        Update: {
          id?: string;
          full_name?: string;
          role?: string;
          is_active?: boolean;
          created_at?: string;
          email?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      settings: {
        Row: {
          id: boolean;
          days_before_event: number;
          days_after_event: number;
          cleaning_buffer_days: number;
          updated_at: string;
          shop_address: string | null;
          shop_phone: string | null;
          rental_terms_fr: string | null;
          rental_terms_ar: string | null;
        };
        Insert: {
          id?: boolean;
          days_before_event?: number;
          days_after_event?: number;
          cleaning_buffer_days?: number;
          updated_at?: string;
          shop_address?: string | null;
          shop_phone?: string | null;
          rental_terms_fr?: string | null;
          rental_terms_ar?: string | null;
        };
        Update: {
          id?: boolean;
          days_before_event?: number;
          days_after_event?: number;
          cleaning_buffer_days?: number;
          updated_at?: string;
          shop_address?: string | null;
          shop_phone?: string | null;
          rental_terms_fr?: string | null;
          rental_terms_ar?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      add_order_payment: {
        Args: {
          p_order_id: number;
          p_amount: number;
        };
        Returns: number;
      };
      create_order: {
        Args: {
          p_customer_name: string;
          p_customer_phone: string;
          p_event_date: string;
          p_pickup_date?: string;
          p_return_due_date?: string;
          p_discount?: number;
          p_amount_paid?: number;
          p_caution_amount?: number;
          p_notes?: string;
          p_lines?: Json;
        };
        Returns: number;
      };
      update_order: {
        Args: {
          p_order_id: number;
          p_customer_name: string;
          p_customer_phone: string;
          p_event_date: string;
          p_pickup_date: string;
          p_return_due_date: string;
          p_amount_paid?: number;
          p_caution_amount?: number;
          p_notes?: string;
          p_picked_up?: boolean;
          p_returned?: boolean;
          p_lines?: Json;
        };
        Returns: number;
      };
      customer_suggestions: {
        Args: Record<PropertyKey, never>;
        Returns: { name: string; phone: string | null; orders: number }[];
      };
      dashboard_stats: {
        Args: {
          p_today?: string;
        };
        Returns: Json;
      };
      order_item_suggestions: {
        Args: Record<PropertyKey, never>;
        Returns: { label: string; uses: number; slot: number }[];
      };
      save_ensemble: {
        Args: {
          p_id?: number;
          p_name?: string;
          p_description?: string;
          p_package_price?: number;
          p_unit_ids?: number[];
        };
        Returns: number;
      };
      set_order_cancelled: {
        Args: {
          p_order_id: number;
          p_cancelled: boolean;
        };
        Returns: string;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update'];
