import type { Context } from 'hono';
import type { Env } from '../../types';

export const onRequestPost = async (c: Context<{ Bindings: Env }>): Promise<Response> => {
  const env = c.env;

  if (!env.ANAM_API_KEY) {
    return c.json({ error: 'Server configuration error: missing ANAM_API_KEY' }, 500);
  }

  const avatarId = env.ANAM_AVATAR_ID || '30fa96d0-26c4-4e55-94a0-517025942e18';
  const voiceId = env.ANAM_VOICE_ID || '6bfbe25a-979d-40f3-a92b-5394170af54b';

  const personaConfig = {
    name: 'Aíngel',
    avatarId,
    voiceId,
    llmId: 'CUSTOMER_CLIENT_V1',
    systemPrompt: 'You are Aíngel, a caring AI companion.',
  };

  try {
    const apiUrl = env.ANAM_API_URL || 'https://api.anam.ai';
    const response = await fetch(`${apiUrl}/v1/auth/session-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.ANAM_API_KEY}`,
      },
      body: JSON.stringify({ personaConfig }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[anam-token] Error:', response.status, errorText);
      return c.json({ error: `Failed to get session token: ${response.status}` }, 500);
    }

    const data = await response.json() as { sessionToken?: string };
    if (!data.sessionToken) {
      return c.json({ error: 'No session token received' }, 500);
    }

    return c.json({ sessionToken: data.sessionToken });
  } catch (error) {
    console.error('[anam-token] Request failed:', error);
    return c.json({ error: 'Failed to connect to Anam API' }, 500);
  }
};
