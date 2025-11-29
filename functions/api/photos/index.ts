
import { Env } from '../../types';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  
  let page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '30');
  
  if (page < 1) page = 1;

  try {
    if (!env.PHOTO_KV) {
      throw new Error('PHOTO_KV binding is missing in Cloudflare configuration');
    }

    // List Limit: Cloudflare lists up to 1000 keys.
    // For proper pagination beyond 1000 items, we would need 'cursor' support.
    // For this implementation, we list 1000 and slice manually for pages within that range.
    // Ideally, pass 'cursor' from frontend for true infinite scroll > 1000 items.
    
    const listResult = await env.PHOTO_KV.list({ 
      prefix: 'data:', 
      limit: 1000 
    });

    const totalKeys = listResult.keys;
    const startIndex = (page - 1) * pageSize;
    
    if (startIndex >= totalKeys.length) {
       return new Response(JSON.stringify({ items: [] }), { 
         headers: { 'Content-Type': 'application/json' } 
       });
    }

    const pageKeys = totalKeys.slice(startIndex, startIndex + pageSize);

    const items = await Promise.all(pageKeys.map(async (key) => {
       try {
         return await env.PHOTO_KV.get(key.name, 'json');
       } catch (e) {
         return null;
       }
    }));

    const validItems = items.filter(i => i !== null);
    
    // Optimization: Exclude heavy EXIF data for the list view but keep essential fields for Modal display
    const mappedItems = validItems.map((item: any) => ({
      id: item.id,
      title: item.title,
      category: item.tags?.[0] || '全部',
      url: item.url,
      urls: item.urls || { small: item.url, medium: item.url, large: item.url },
      width: item.width,
      height: item.height,
      rating: item.rating,
      exif: {
          // Restore essential details for the Detail Modal
          camera: item.exif?.camera,
          lens: item.exif?.lens,
          aperture: item.exif?.aperture,
          shutterSpeed: item.exif?.shutterSpeed,
          iso: item.exif?.iso,
          focalLength: item.exif?.focalLength,

          // Map & Overlay fields
          location: item.exif?.location || '',
          latitude: item.exif?.latitude,
          longitude: item.exif?.longitude,
          date: item.exif?.date 
      }
    }));

    return new Response(JSON.stringify({ items: mappedItems }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
