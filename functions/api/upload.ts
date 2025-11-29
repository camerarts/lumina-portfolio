
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
    const metaStr = formData.get('meta') as string;

    if (!metaStr) {
      return new Response('Missing metadata', { status: 400 });
    }

    const meta = JSON.parse(metaStr);
    const isEdit = !!(meta.id && meta.id.length > 0);
    
    let photoId = meta.id;
    
    // Inverted timestamp for descending sort
    const now = new Date().toISOString();
    const timestamp = Date.now();
    const invertedTs = 9999999999999 - timestamp;

    if (!photoId) photoId = crypto.randomUUID();

    // Check for existing data if editing
    let existingData: any = null;
    if (isEdit) {
       const lookupKey = `lookup:${photoId}`;
       const existingDataKey = await env.PHOTO_KV.get(lookupKey);
       if (existingDataKey) {
         existingData = await env.PHOTO_KV.get(existingDataKey, 'json');
       }
    }

    // Handle Files
    const fileSmall = formData.get('file_small') as File | null;
    const fileMedium = formData.get('file_medium') as File | null;
    const fileLarge = formData.get('file_large') as File | null;
    const legacyFile = formData.get('file') as File | null; // Fallback

    let urls = existingData?.urls || {};
    let mainUrl = existingData?.url || '';
    let objectKey = existingData?.object_key || ''; // Main/Large object key
    let sizeBytes = existingData?.size_bytes || 0;

    // Helper to upload
    const uploadVariant = async (file: File, suffix: string) => {
        const ext = 'jpg';
        const key = `photos/${photoId}${suffix}.${ext}`;
        await env.PHOTO_BUCKET.put(key, await file.arrayBuffer(), {
            httpMetadata: { contentType: file.type },
        });
        return `${env.IMAGE_BASE_URL}/${key}`;
    };

    if (fileSmall || fileMedium || fileLarge) {
        if (fileSmall) urls.small = await uploadVariant(fileSmall, '_s');
        if (fileMedium) urls.medium = await uploadVariant(fileMedium, '_m');
        if (fileLarge) {
            urls.large = await uploadVariant(fileLarge, '_l');
            // Update main attributes based on Large
            objectKey = `photos/${photoId}_l.jpg`;
            sizeBytes = fileLarge.size;
            mainUrl = urls.large; 
        }
    } else if (legacyFile) {
        // Fallback for old single-file upload style
        const url = await uploadVariant(legacyFile, ''); // No suffix
        mainUrl = url;
        urls = { small: url, medium: url, large: url }; // Duplicate for safety
        objectKey = `photos/${photoId}.jpg`;
        sizeBytes = legacyFile.size;
    }

    // Ensure urls exist even if editing metadata only and no file uploaded
    if (!urls.large && mainUrl) urls.large = mainUrl;
    if (!urls.medium && mainUrl) urls.medium = mainUrl;
    if (!urls.small && mainUrl) urls.small = mainUrl;

    // Prepare Final Data
    const photoData = {
      id: photoId,
      title: meta.title,
      description: meta.description || '',
      tags: [meta.category],
      created_at: existingData ? existingData.created_at : now,
      updated_at: now,
      object_key: objectKey,
      mime: 'image/jpeg',
      size_bytes: sizeBytes,
      width: meta.width,
      height: meta.height,
      exif: meta.exif || {},
      rating: meta.rating || 0,
      is_public: 1,
      url: mainUrl,
      urls: urls 
    };

    // Determine Key
    let dataKey = `data:${invertedTs}:${photoId}`; 
    
    if (isEdit) {
       const lookupKey = `lookup:${photoId}`;
       const existingDataKey = await env.PHOTO_KV.get(lookupKey);
       if (existingDataKey) {
         dataKey = existingDataKey;
       } else {
         await env.PHOTO_KV.put(lookupKey, dataKey);
       }
    } else {
       const lookupKey = `lookup:${photoId}`;
       await env.PHOTO_KV.put(lookupKey, dataKey);
    }

    await env.PHOTO_KV.put(dataKey, JSON.stringify(photoData));

    return new Response(JSON.stringify({ 
      success: true, 
      id: photoId, 
      url: mainUrl,
      urls: urls
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
