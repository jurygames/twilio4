// pages/api/templates/index.js
import { getServiceSupabaseClient } from '../../../lib/supabaseClient';
import { requireMessagingRole } from '../../../lib/messagingAuth';
import security from '../../../lib/security';

const { allowedSenders, isTrustedMutation, validateTemplateDraft } = security;

function templateForClient(row) {
  return {
    id: row.id,
    name: row.name || '',
    type: row.type || '',
    show: row.show || '',
    from_number: row.from_number || row.from || row.fromNumber || row.sender || '',
    content: row.content || '',
    media_url: row.media_url || row.mediaUrl || row.mp3Url || '',
    summary: row.summary || '',
  };
}

function privateResponse(res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Vary', 'Cookie');
}

export default async function handler(req, res) {
  privateResponse(res);
  if (req.method === 'GET') {
    const session = await requireMessagingRole(req, res, 'operator');
    if (!session) return;
    try {
      const { data, error } = await getServiceSupabaseClient()
        .from('templates')
        .select('*')
        .order('name', { ascending: true });
      if (error) return res.status(503).json({ error: 'template_store_unavailable' });
      return res.status(200).json({ templates: (data || []).map(templateForClient), allowedFromNumbers: allowedSenders() });
    } catch {
      return res.status(503).json({ error: 'template_store_unavailable' });
    }
  }
  if (req.method === 'POST') {
    const session = await requireMessagingRole(req, res, 'admin');
    if (!session) return;
    if (!isTrustedMutation(req)) return res.status(403).json({ error: 'same_origin_required' });
    const checked = validateTemplateDraft(req.body);
    if (!checked.ok) return res.status(400).json({ error: checked.error });
    try {
      const { data, error } = await getServiceSupabaseClient()
        .from('templates')
        .insert([checked.template])
        .select('*')
        .single();
      if (error) return res.status(503).json({ error: 'template_store_unavailable' });
      return res.status(201).json(templateForClient(data));
    } catch {
      return res.status(503).json({ error: 'template_store_unavailable' });
    }
  }
  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).json({ error: 'method_not_allowed' });
}
