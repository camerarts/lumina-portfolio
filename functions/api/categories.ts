
import { Env } from '../types';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context;
  try {
    const categoriesStr = await env.PHOTO_KV.get('system:categories');
    const categories = categoriesStr ? JSON.parse(categoriesStr) : null;
    return new Response(JSON.stringify({ categories }), {
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
    const body = await request.json() as { categories: string[] };
    if (!Array.isArray(body.categories)) {
        return new Response('Invalid data', { status: 400 });
    }

    await env.PHOTO_KV.put('system:categories', JSON.stringify(body.categories));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
