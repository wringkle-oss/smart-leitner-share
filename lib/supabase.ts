import { createClient } from "@supabase/supabase-js";

export type DeckRecord = {
  id: number | string;
  code: string;
  name: string;
  raw_text?: string | null;
  created_at?: string;
};

export type CardRecord = {
  front: string;
  back: string;
  position: number;
};

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false
    }
  });
}
