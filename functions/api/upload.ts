
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
    const file = formData.get('file') as File | null;
    const metaStr = formData.get('meta') as string;

    if (!metaStr) {
      return new Response('Missing metadata', { status: 400 });
    }

    const meta = JSON.parse(metaStr);
    const isEdit = !!(meta.id && meta.id.length > 0);
    
    let photoId = meta.id;
    let imageUrl = meta.url;
    let objectKey = '';
    let mimeType = '';
    let sizeBytes = 0;
    
    // Inverted timestamp for descending sort
    const now = new Date().toISOString();
    const timestamp = Date.now();
    const invertedTs = 9999999999999 - timestamp;

    // SCENARIO A: NEW UPLOAD or EDIT WITH NEW FILE
    if (file && file.size > 0) {
       // If it's a new photo, generate ID
       if (!photoId) photoId = crypto.randomUUID();
       
       const ext = 'jpg'; 
       objectKey = `photos/${photoId}.${ext}`; // Overwrite if same ID
       
       await env.PHOTO_BUCKET.put(objectKey, await file.arrayBuffer(), {
         httpMetadata: { contentType: file.type },
       });

       imageUrl = `${env.IMAGE_BASE_URL}/${objectKey}`;
       mimeType = file.type;
       sizeBytes = file.size;
    } 
    // SCENARIO B: EDIT METADATA ONLY (No File)
    else if (isEdit) {
       // We need to fetch the existing data to preserve file info
       const lookupKey = `lookup:${photoId}`;
       const existingDataKey = await env.PHOTO_KV.get(lookupKey);
       if (!existingDataKey) {
         return new Response('Photo not found for editing', { status: 404 });
       }
       const existingData: any = await env.PHOTO_KV.get(existingDataKey, 'json');
       
       if (!existingData) {
         return new Response('Photo data corrupted', { status: 500 });
       }

       // Preserve technical details
       imageUrl = existingData.url;
       objectKey = existingData.object_key;
       mimeType = existingData.mime;
       sizeBytes = existingData.size_bytes;
       // We don't change the dataKey (timestamp) to keep position in feed, 
       // OR we could update it to bump to top. Let's keep position for now.
    } else {
       return new Response('File required for new uploads', { status: 400 });
    }

    // Prepare Final Data
    const photoData = {
      id: photoId,
      title: meta.title,
      description: meta.description || '',
      tags: [meta.category],
      created_at: isEdit ? undefined : now, // Keep original creation date if possible, but simplified here
      updated_at: now,
      object_key: objectKey,
      mime: mimeType,
      size_bytes: sizeBytes,
      width: meta.width,
      height: meta.height,
      exif: meta.exif || {},
      rating: meta.rating || 0,
      is_public: 1,
      url: imageUrl
    };

    // If editing, we overwrite the OLD key. 
    // Optimization: If we wanted to "Bump" the post, we'd delete old key and make new one.
    // For now, let's just find the old key and overwrite the value.
    
    let dataKey = `data:${invertedTs}:${photoId}`; // Default for new
    
    if (isEdit) {
       const lookupKey = `lookup:${photoId}`;
       const existingDataKey = await env.PHOTO_KV.get(lookupKey);
       if (existingDataKey) {
         dataKey = existingDataKey; // Use the EXISTING timestamp key to preserve sort order
         photoData.created_at = (await env.PHOTO_KV.get(existingDataKey, 'json') as any).created_at;
       } else {
         // Should have been caught above, but fallback
         await env.PHOTO_KV.put(lookupKey, dataKey);
       }
    } else {
       // New upload: Create lookup
       const lookupKey = `lookup:${photoId}`;
       await env.PHOTO_KV.put(lookupKey, dataKey);
    }

    // Write to KV
    await env.PHOTO_KV.put(dataKey, JSON.stringify(photoData));

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
