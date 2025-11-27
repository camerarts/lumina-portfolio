
export enum Category {
  ALL = '全部',
  LANDSCAPE = '风光',
  PORTRAIT = '人像',
  STREET = '人文',
  MACRO = '微距',
  BW = '黑白',
  HORIZONTAL = '横屏',
  VERTICAL = '竖屏'
}

export const DEFAULT_CATEGORIES = ['风光', '人像', '人文', '微距', '黑白'];

export type Theme = 'dark' | 'light';

export interface ExifData {
  camera: string;
  lens: string;
  aperture: string;
  shutterSpeed: string;
  iso: string;
  location: string;
  date: string;
  focalLength?: string;
  latitude?: number;
  longitude?: number;
}

export interface Photo {
  id: string;
  url: string;
  title: string;
  category: string; // Changed from Category enum to string to support dynamic categories
  exif: ExifData;
  width?: number;
  height?: number;
  rating?: number; // 0-5
}

export interface User {
  isAuthenticated: boolean;
  username?: string;
}
