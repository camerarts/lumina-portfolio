
import { Env } from '../types';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Verify Token
  const authHeader = request.headers.get('Authorization');
  const expectedToken = `Bearer ${env.ADMIN_TOKEN}`;
  
  if (!authHeader || authHeader !== expectedToken) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body = await request.json() as { 
      ids: string[], 
      updates: {
        camera?: string;
        lens?: string;
        location?: string;
        date?: string;
        latitude?: number;
        longitude?: number;
      }
    };

    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return new Response('No IDs provided', { status: 400 });
    }

    const results = await Promise.all(body.ids.map(async (id) => {
      try {
        const lookupKey = `lookup:${id}`;
        const dataKey = await env.PHOTO_KV.get(lookupKey);
        
        if (!dataKey) return { id, success: false, error: 'Not found' };

        const existingDataStr = await env.PHOTO_KV.get(dataKey);
        if (!existingDataStr) return { id, success: false, error: 'Data missing' };

        const photoData = JSON.parse(existingDataStr);

        // Merge updates into EXIF/Metadata
        const updatedPhoto = {
          ...photoData,
          exif: {
            ...photoData.exif,
            ...(body.updates.camera !== undefined && { camera: body.updates.camera }),
            ...(body.updates.lens !== undefined && { lens: body.updates.lens }),
            ...(body.updates.location !== undefined && { location: body.updates.location }),
            ...(body.updates.date !== undefined && { date: body.updates.date }),
            ...(body.updates.latitude !== undefined && { latitude: body.updates.latitude }),
            ...(body.updates.longitude !== undefined && { longitude: body.updates.longitude }),
          }
        };

        await env.PHOTO_KV.put(dataKey, JSON.stringify(updatedPhoto));
        return { id, success: true };
      } catch (err: any) {
        return { id, success: false, error: err.message };
      }
    }));

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
