// pages/api/templates/index.js
import { supabase } from '../../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Removed order by created_at as column doesn't exist; ordering by name instead
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .order('name', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }
  if (req.method === 'POST') {
    const tpl = req.body;
    const { data, error } = await supabase
      .from('templates')
      .insert([tpl])
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }
  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
