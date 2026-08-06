/**
 * Database types for the Supabase client.
 *
 * HAND-MAINTAINED, NOT GENERATED. Read that twice before trusting anything
 * below.
 *
 * This file used to describe four tables, and every one of them was wrong —
 * not slightly wrong, but describing a schema this product has never had.
 * `vouchers` claimed `discount_type`, `discount_value`, `max_usage`,
 * `start_date` and a `status` enum; the real table has `discount_amount`,
 * `total_quantity`, `remaining_quantity`, `is_active` and `expires_at`.
 * `streamers` claimed a string id and an `email` column. None of it had ever
 * been true, and nothing caught it because the single file that imports
 * `Database` never actually applied it to a query.
 *
 * A wrong type file is worse than no type file: it hands you a green
 * type-check for a query that cannot run.
 *
 * The shapes below are reconstructed from what the application actually reads
 * and writes, cross-checked against the migrations in supabase/migrations.
 * They are therefore a best-effort mirror, not ground truth. Regenerate from
 * the live database when you can:
 *
 *   npx supabase gen types typescript --project-id <ref> --schema public \
 *     > types/supabase.ts
 *
 * Only the tables the application actually types are listed. An absent table is
 * honest — an invented one is not.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      /**
       * Discount codes. Locked down by
       * supabase/migrations/20260806100000_lock_down_vouchers.sql: readable by
       * anyone while `is_active`, writable only by the service role.
       */
      vouchers: {
        Row: {
          id: string
          code: string
          description: string | null
          /** Flat rupiah amount off the total. Not a percentage. */
          discount_amount: number
          total_quantity: number
          /**
           * Decremented by public.decrement_voucher_quantity() after a payment
           * settles. Never negative — the function clamps at zero.
           */
          remaining_quantity: number
          is_active: boolean
          expires_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          description?: string | null
          discount_amount: number
          total_quantity: number
          remaining_quantity: number
          is_active?: boolean
          expires_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          code?: string
          description?: string | null
          discount_amount?: number
          total_quantity?: number
          remaining_quantity?: number
          is_active?: boolean
          expires_at?: string | null
          created_at?: string
        }
      }

      /**
       * One row per redemption. Written only by the service role, from
       * services/payment/payment-service.ts after Midtrans settles.
       */
      voucher_usage: {
        Row: {
          id: string
          voucher_id: string
          /** bookings.id is a bigint, so this is a number and not a uuid. */
          booking_id: number
          user_id: string
          discount_applied: number
          /** The pre-discount total, in rupiah. */
          original_price: number
          /** What was actually charged. */
          final_price: number
          used_at: string
        }
        Insert: {
          id?: string
          voucher_id: string
          booking_id: number
          user_id: string
          discount_applied: number
          original_price: number
          final_price: number
          used_at?: string
        }
        Update: {
          id?: string
          voucher_id?: string
          booking_id?: number
          user_id?: string
          discount_applied?: number
          original_price?: number
          final_price?: number
          used_at?: string
        }
      }

      /**
       * The profile row for every account, brand and host alike. Keyed by the
       * auth user id.
       */
      users: {
        Row: {
          id: string
          email: string | null
          first_name: string | null
          last_name: string | null
          /**
           * NULL until the role picker runs. Every routing decision in the app
           * reads this, which is why an auth user without a `users` row is a
           * broken half-state rather than a missing profile.
           */
          user_type: 'client' | 'streamer' | null
          phone: string | null
          profile_picture_url: string | null
          /** Canonical city slug from lib/cities. Preferred over `location`. */
          city_slug: string | null
          /** Legacy free-text city. Still read as a fallback. */
          location: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          user_type?: 'client' | 'streamer' | null
          phone?: string | null
          profile_picture_url?: string | null
          city_slug?: string | null
          location?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          user_type?: 'client' | 'streamer' | null
          phone?: string | null
          profile_picture_url?: string | null
          city_slug?: string | null
          location?: string | null
          created_at?: string
          updated_at?: string
        }
      }

      /**
       * A host's public listing. Created near-empty by the role picker and
       * filled in over the following days, so almost every column is nullable —
       * see the note on the `Streamer` interface in components/streamer-card.
       */
      streamers: {
        Row: {
          /** bigint, not a uuid. `user_id` is the auth key. */
          id: number
          user_id: string
          username: string | null
          first_name: string | null
          last_name: string | null
          bio: string | null
          /** Legacy free-text city; `city_slug` is canonical. */
          location: string | null
          city_slug: string | null
          /**
           * Where a brand ships product. Never select this on a public query —
           * it is the address the KYC pipeline exists to protect.
           */
          full_address: string | null
          category: string | null
          platform: string | null
          /** Base hourly rate. The brand pays this x 1.3, x 1.443 with tax. */
          price: number | null
          previous_price: number | null
          discount_percentage: number | null
          last_price_update: string | null
          image_url: string | null
          video_url: string | null
          rating: number | null
          is_active: boolean | null
          /** 'pending' | 'approved' | 'rejected'. Only 'approved' is bookable. */
          verification_status: string | null
          profile_published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          user_id: string
          username?: string | null
          first_name?: string | null
          last_name?: string | null
          bio?: string | null
          location?: string | null
          city_slug?: string | null
          full_address?: string | null
          category?: string | null
          platform?: string | null
          price?: number | null
          previous_price?: number | null
          discount_percentage?: number | null
          last_price_update?: string | null
          image_url?: string | null
          video_url?: string | null
          rating?: number | null
          is_active?: boolean | null
          verification_status?: string | null
          profile_published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          username?: string | null
          first_name?: string | null
          last_name?: string | null
          bio?: string | null
          location?: string | null
          city_slug?: string | null
          full_address?: string | null
          category?: string | null
          platform?: string | null
          price?: number | null
          previous_price?: number | null
          discount_percentage?: number | null
          last_price_update?: string | null
          image_url?: string | null
          video_url?: string | null
          rating?: number | null
          is_active?: boolean | null
          verification_status?: string | null
          profile_published_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      /**
       * Defined by
       * supabase/migrations/20260806120000_decrement_voucher_quantity.sql.
       * service_role only — a session-callable decrement would let anyone burn
       * a live voucher's stock to zero without paying.
       */
      decrement_voucher_quantity: {
        Args: { voucher_uuid: string }
        /** The new remaining count, or null if nothing was decremented. */
        Returns: number | null
      }
      /** True when the caller's email is in public.admin_users. */
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
