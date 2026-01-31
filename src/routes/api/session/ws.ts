import type { Context } from 'hono';
import type { Env } from '../../../types';

export const onRequestGet = async (c: Context<{ Bindings: Env }>): Promise<Response> => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const id = c.env.SESSION_DO.idFromName(user.id);
  const stub = c.env.SESSION_DO.get(id);

  // Forward the upgrade request to the DO
  return stub.fetch(c.req.raw);
};
