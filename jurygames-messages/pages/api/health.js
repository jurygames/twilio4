// pages/api/health.js
import { supabase } from "../../lib/supabaseClient";
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    }

    const { data, error } = await supabase.from("templates").select("id").limit(1);
    if (error) throw error;
    res.status(200).json({ ok: true, ts: new Date().toISOString(), templatesSeen: Array.isArray(data) ? data.length : 0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
