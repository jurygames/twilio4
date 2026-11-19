import { requireMessagingRole } from '../../../lib/messagingAuth.js';
import { getSummonsMessagingShows, SummonsMessagingApiError } from '../../../lib/summonsMessagingApi';

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
  try {
    return res.status(200).json(await getSummonsMessagingShows(session.accessToken));
  } catch (error) {
    if (error instanceof SummonsMessagingApiError) return res.status(error.status).json({ error: error.code });
    return res.status(503).json({ error: 'show_source_unavailable' });
  }
}
