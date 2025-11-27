
import { Env } from '../types';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context;
  try {
    const presetsStr = await env.PHOTO_KV.get('system:presets');
    const presets = presetsStr ? JSON.parse(presetsStr) : { cameras: [], lenses: [] };
    return new Response(JSON.stringify(presets), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Verify Token
  const authHeader = request.headers.get('Authorization');
  const expectedToken = `Bearer ${env.ADMIN_TOKEN}`;
  if (!authHeader || authHeader !== expectedToken) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body = await request.json() as any;
    if (!body.cameras || !Array.isArray(body.cameras) || !body.lenses || !Array.isArray(body.lenses)) {
        return new Response('Invalid data structure', { status: 400 });
    }

    await env.PHOTO_KV.put('system:presets', JSON.stringify(body));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
