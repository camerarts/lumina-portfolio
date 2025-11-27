
import { Category, Photo } from '../types';

const API_ROOT = '/api';

export const client = {
  // 验证密码
  async verifyPassword(password: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_ROOT}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data.success === true;
    } catch (e) {
      console.error("Verification error", e);
      return false;
    }
  },

  // 获取照片列表
  async getPhotos(page = 1, pageSize = 100, category?: Category): Promise<Photo[]> {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString()
    });
    if (category && category !== Category.ALL) {
      params.append('category', category);
    }

    try {
      const res = await fetch(`${API_ROOT}/photos?${params}`);
      
      if (!res.ok) {
        if (res.status === 404) {
          console.warn('API Endpoint not found (404). Returning empty list.');
          return [];
        }
        const errorText = await res.text().catch(() => 'Unknown Error');
        throw new Error(`Failed to fetch photos: ${res.status} ${errorText}`);
      }
      
      const data = await res.json();
      return data.items || [];
    } catch (error) {
      console.error("API Error:", error);
      // In case of network error or 404, return empty array to keep app usable
      return [];
    }
  },

  // 上传或更新照片
  async uploadPhoto(dataUrl: string, metadata: Photo, token: string): Promise<Photo> {
    const formData = new FormData();
    formData.append('meta', JSON.stringify(metadata));

    // Check if dataUrl is a Base64 string (New Upload or New File)
    // or a Remote URL (Edit Metadata Only)
    const isBase64 = dataUrl.startsWith('data:');

    if (isBase64) {
      // Convert Base64 to Blob for FormData
      try {
        const arr = dataUrl.split(',');
        const mimeMatch = arr[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const file = new File([u8arr], 'image.jpg', { type: mime });
        formData.append('file', file);
      } catch (e) {
        throw new Error("Failed to process image data. Please try selecting the image again.");
      }
    } else {
      // It's likely an existing URL, so we don't send a 'file'
      // The backend will see 'file' is missing and treat it as a metadata update
      console.log("Updating metadata only for existing image...");
    }

    const res = await fetch(`${API_ROOT}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!res.ok) {
      const err = await res.text().catch(() => 'Unknown Error');
      throw new Error(`Upload failed: ${res.status} ${err}`);
    }

    const result = await res.json();
    return { ...metadata, url: result.url, id: result.id };
  },

  // 删除照片
  async deletePhoto(id: string, token: string): Promise<void> {
    const res = await fetch(`${API_ROOT}/photos/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const err = await res.text().catch(() => 'Unknown Error');
      throw new Error(`Delete failed: ${res.status} ${err}`);
    }
  }
};
