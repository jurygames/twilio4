// pages/api/debug/senders.js
import { supabase } from '../../../lib/supabaseClient';

export default async function handler(req, res) {
  // Return name, type, from presence for quick diagnostics
  const { data, error } = await supabase.from('templates').select('id,name,type,show,from');
  if (error) return res.status(500).json({ error: error.message });
  const rows = data.map(t => ({
    id: t.id,
    name: t.name,
    type: t.type,
    show: t.show,
    hasFrom: Boolean(t.from),
    from: t.from || null
  }));
  res.status(200).json(rows);
}
