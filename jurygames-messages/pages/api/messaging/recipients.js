import { requireMessagingRole } from '../../../lib/messagingAuth.js';
import { getSummonsShowRecipients, SummonsMessagingApiError } from '../../../lib/summonsMessagingApi';

function privateResponse(res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Vary', 'Cookie');
}

export default async function handler(req, res) {
  privateResponse(res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  const session = await requireMessagingRole(req, res, 'operator');
  if (!session) return;
  const showId = typeof req.query?.show_id === 'string' ? req.query.show_id.trim() : '';
  if (!showId || showId.length > 256) return res.status(400).json({ error: 'show_id_required' });
  try {
    return res.status(200).json(await getSummonsShowRecipients(session.accessToken, showId));
  } catch (error) {
    if (error instanceof SummonsMessagingApiError) {
      return res.status(error.status).json({ error: error.code, ...(error.status === 409 ? { showId } : {}) });
    }
    return res.status(503).json({ error: 'contact_source_unavailable' });
  }
}
