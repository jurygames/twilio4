// pages/api/templates/[id].js
import { requireMessagingRole, messagingUserClient } from '../../../lib/messagingAuth';
import security from '../../../lib/security';

const { isTrustedMutation, validateTemplateDraft } = security;

function templateForValidation(row) {
  return { ...row, from_number: row.from_number || row.from || row.fromNumber || row.sender || '', media_url: row.media_url || row.mediaUrl || row.mp3Url || '' };
}

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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Vary', 'Cookie');
  const id = typeof req.query?.id === 'string' ? req.query.id : '';
  if (!id || id.length > 128) return res.status(400).json({ error: 'template_id_invalid' });

  if (req.method === 'PATCH') {
    const session = await requireMessagingRole(req, res, 'admin');
    if (!session) return;
    if (!isTrustedMutation(req)) return res.status(403).json({ error: 'same_origin_required' });
    try {
      const client = messagingUserClient(session);
      const current = await client.from('jg_messaging_templates').select('*').eq('id', id).maybeSingle();
      if (current.error) return res.status(503).json({ error: 'template_store_unavailable' });
      if (!current.data) return res.status(404).json({ error: 'template_not_found' });
      const checked = validateTemplateDraft(req.body, process.env, templateForValidation(current.data));
      if (!checked.ok) return res.status(400).json({ error: checked.error });
      const { data, error } = await client.from('jg_messaging_templates').update(checked.template).eq('id', id).select('*').single();
      if (error) return res.status(503).json({ error: 'template_store_unavailable' });
      return res.status(200).json(templateForClient(data));
    } catch {
      return res.status(503).json({ error: 'template_store_unavailable' });
    }
  }
  if (req.method === 'DELETE') {
    const session = await requireMessagingRole(req, res, 'admin');
    if (!session) return;
    if (!isTrustedMutation(req)) return res.status(403).json({ error: 'same_origin_required' });
    try {
      const { error } = await messagingUserClient(session).from('jg_messaging_templates').delete().eq('id', id);
      if (error) return res.status(503).json({ error: 'template_store_unavailable' });
      return res.status(204).end();
    } catch {
      return res.status(503).json({ error: 'template_store_unavailable' });
    }
  }
  res.setHeader('Allow', ['PATCH', 'DELETE']);
  res.status(405).json({ error: 'method_not_allowed' });
}
