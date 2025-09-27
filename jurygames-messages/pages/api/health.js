// pages/api/health.js
import { supabase } from "../../lib/supabaseClient";
export default async function handler(req, res) {
  try {
    const { data, error } = await supabase.from("templates").select("id").limit(1);
    if (error) throw error;
    res.status(200).json({ ok: true, ts: new Date().toISOString(), templatesSeen: Array.isArray(data) ? data.length : 0 });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message });
  }
}
