// pages/api/templates/index.js
import { supabase } from '../../../lib/supabaseClient';

function adaptToSchema(updates, allowedKeys) {
  const out = {};
  const has = (k) => allowedKeys.includes(k);
  if ('from' in updates) {
    if (has('from')) out.from = updates.from;
    else if (has('from_number')) out.from_number = updates.from;
    else if (has('fromNumber')) out.fromNumber = updates.from;
    else if (has('sender')) out.sender = updates.from;
  }
  ['from_number','fromNumber','sender'].forEach(k => {
    if (k in updates && has(k)) out[k] = updates[k];
  });
  const media = updates.mediaUrl ?? updates.mp3Url ?? updates.media_url ?? updates.url;
  if (media !== undefined) {
    if (has('mediaUrl')) out.mediaUrl = media;
    else if (has('mp3Url')) out.mp3Url = media;
    else if (has('media_url')) out.media_url = media;
    else if (has('url')) out.url = media;
  }
  ['name','type','show','content','summary'].forEach(k => {
    if (k in updates && has(k)) out[k] = updates[k];
  });
  Object.keys(updates).forEach(k => {
    if (!(k in out) && has(k)) out[k] = updates[k];
  });
  return out;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .order('name', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }
  if (req.method === 'POST') {
    const tpl = req.body;
    const probe = await supabase.from('templates').select('*').limit(1);
    if (probe.error) return res.status(500).json({ error: probe.error.message });
    const allowedKeys = probe.data && probe.data[0] ? Object.keys(probe.data[0]) : [];
    const mapped = adaptToSchema(tpl, allowedKeys);
    if (Object.keys(mapped).length === 0) {
      return res.status(400).json({ error: "No valid fields for insert based on current schema" });
    }
    const { data, error } = await supabase
      .from('templates')
      .insert([mapped])
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }
  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
