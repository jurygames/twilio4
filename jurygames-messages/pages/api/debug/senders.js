// pages/api/debug/senders.js
import { supabase } from '../../../lib/supabaseClient';
export default async function handler(req, res) {
  const { data, error } = await supabase.from('templates').select('id,name,type,show,from,from_number,fromNumber,sender,mediaUrl,mp3Url');
  if (error) return res.status(500).json({ error: error.message });
  const rows = (data || []).map(t => ({
    id: t.id, name: t.name, type: t.type, show: t.show,
    from: t.from || t.from_number || t.fromNumber || t.sender || null,
    hasFrom: Boolean(t.from || t.from_number || t.fromNumber || t.sender),
    mediaUrl: t.mediaUrl || t.mp3Url || null
  }));
  res.status(200).json(rows);
}
