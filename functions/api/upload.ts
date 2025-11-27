
import { Env } from '../types';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // 1. Verify Token
  const authHeader = request.headers.get('Authorization');
  const expectedToken = `Bearer ${env.ADMIN_TOKEN}`;
  
  if (!authHeader || authHeader !== expectedToken) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const metaStr = formData.get('meta') as string;

    if (!file || !metaStr) {
      return new Response('Missing file or metadata', { status: 400 });
    }

    const meta = JSON.parse(metaStr);
    
    // 2. Prepare Data
    const photoId = crypto.randomUUID();
    const ext = 'jpg'; 
    const objectKey = `photos/${photoId}.${ext}`;
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    // Inverted timestamp for descending sort (Newest first)
    // 9999999999999 is safe until year 2286
    const invertedTs = 9999999999999 - timestamp;

    // 3. Upload to R2
    await env.PHOTO_BUCKET.put(objectKey, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: file.type,
      },
    });

    // 4. Store Metadata in KV
    const imageUrl = `${env.IMAGE_BASE_URL}/${objectKey}`;
    
    const photoData = {
      id: photoId,
      title: meta.title,
      description: '',
      tags: [meta.category],
      created_at: now,
      updated_at: now,
      object_key: objectKey,
      mime: file.type,
      size_bytes: file.size,
      width: meta.width,
      height: meta.height,
      exif: meta.exif || {},
      rating: meta.rating || 0,
      is_public: 1,
      url: imageUrl
    };

    // Primary Data Key: data:{inverted_timestamp}:{id}
    const dataKey = `data:${invertedTs}:${photoId}`;
    
    // Lookup Key for Deletion: lookup:{id} -> dataKey
    const lookupKey = `lookup:${photoId}`;

    // Write to KV
    await env.PHOTO_KV.put(dataKey, JSON.stringify(photoData));
    await env.PHOTO_KV.put(lookupKey, dataKey);

    // 5. Return success
    return new Response(JSON.stringify({ 
      success: true, 
      id: photoId, 
      url: imageUrl 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
