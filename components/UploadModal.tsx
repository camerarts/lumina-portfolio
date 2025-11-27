
import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Loader2, ChevronDown, Trash2, Star, Calendar as CalendarIcon, MapPin, CheckCircle, Cloud, Layers, Image as ImageIcon, Check, AlertCircle } from 'lucide-react';
import { Category, Photo, Theme, DEFAULT_CATEGORIES, Presets } from '../types';
import { GlassCard } from './GlassCard';
import EXIF from 'exif-js';
import { client } from '../api/client';

// ==========================================
// Types & Interfaces
// ==========================================

interface SmartInputProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  storageKey: string;
  placeholder?: string;
  theme: Theme;
  type?: string;
  readOnly?: boolean;
  suggestions?: string[]; // New: Dropdown options from backend presets
}

interface BatchItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  thumbnail: string;
  width: number;
  height: number;
  exif: any;
  errorMsg?: string;
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (photo: Photo) => void;
  theme: Theme;
  editingPhoto?: Photo | null;
  token: string;
  categories?: string[]; // Prop for dynamic categories
}

interface ProcessedImage {
  base64: string;
  width: number;
  height: number;
  exif: any;
}

// ==========================================
// Helper Functions
// ==========================================

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const maxSizeInBytes = 2 * 1024 * 1024; // 2MB
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = objectUrl;
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let width = img.naturalWidth;
      let height = img.naturalHeight;
      const MAX_DIMENSION = 2560;
      let needsResize = false;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        needsResize = true;
        const ratio = width / height;
        if (width > height) { width = MAX_DIMENSION; height = width / ratio; } 
        else { height = MAX_DIMENSION; width = height * ratio; }
      }
      if (file.size <= maxSizeInBytes && !needsResize) {
         const reader = new FileReader();
         reader.onload = (e) => resolve(e.target?.result as string);
         reader.onerror = reject;
         reader.readAsDataURL(file);
         return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context unavailable')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.9;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      const maxStringLength = maxSizeInBytes * 1.37;
      while (dataUrl.length > maxStringLength && quality > 0.3) {
         quality -= 0.1;
         dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(dataUrl);
    };
    img.onerror = (e) => { URL.revokeObjectURL(objectUrl); reject(e); }
  });
};

const extractExif = (file: File): Promise<any> => {
  return new Promise((resolve) => {
    EXIF.getData(file as any, function(this: any) {
        if (!this || !this.exifdata) { resolve({}); return; }
        const getTag = (tag: string) => EXIF.getTag(this, tag);
        
        const data: any = {};

        const make = getTag('Make');
        const model = getTag('Model');
        if (model) {
            const cleanMake = make ? make.replace(/\0/g, '').trim() : '';
            const cleanModel = model.replace(/\0/g, '').trim();
            data.camera = cleanModel.startsWith(cleanMake) ? cleanModel : `${cleanMake} ${cleanModel}`.trim();
        }
        
        const isoVal = getTag('ISOSpeedRatings'); if (isoVal) data.iso = String(isoVal);
        const fNumber = getTag('FNumber'); if (fNumber) data.aperture = `f/${Number(fNumber).toFixed(1)}`.replace('.0', '');
        const exposure = getTag('ExposureTime'); if (exposure) data.shutter = typeof exposure === 'number' ? (exposure < 1 ? `1/${Math.round(1/exposure)}s` : `${exposure}s`) : `${exposure.numerator}/${exposure.denominator}s`;
        const focal = getTag('FocalLength'); if (focal) data.focalLength = `${Math.round(typeof focal === 'number' ? focal : focal.numerator / focal.denominator)}mm`;
        const dateTag = getTag('DateTimeOriginal'); if (dateTag) data.date = dateTag.split(' ')[0].replace(/:/g, '-');
        
        const lat = getTag("GPSLatitude"); const latRef = getTag("GPSLatitudeRef");
        const lon = getTag("GPSLongitude"); const lonRef = getTag("GPSLongitudeRef");
        if (lat && lon && latRef && lonRef) {
           const safeLat = [Number(lat[0]), Number(lat[1]), Number(lat[2])];
           const safeLon = [Number(lon[0]), Number(lon[1]), Number(lon[2])];
           let ddLat = safeLat[0] + safeLat[1]/60 + safeLat[2]/3600; if(latRef === "S") ddLat *= -1;
           let ddLon = safeLon[0] + safeLon[1]/60 + safeLon[2]/3600; if(lonRef === "W") ddLon *= -1;
           if (!isNaN(ddLat) && !isNaN(ddLon)) { 
             data.latitude = ddLat; 
             data.longitude = ddLon; 
           }
        }
        resolve(data);
    });
  });
};

const processImageFile = async (file: File): Promise<ProcessedImage> => {
   const [base64, exif] = await Promise.all([compressImage(file), extractExif(file)]);
   // Get dims from base64
   return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
          resolve({
              base64,
              exif,
              width: img.naturalWidth,
              height: img.naturalHeight
          });
      };
      img.src = base64;
   });
};

// ==========================================
// Sub-Components
// ==========================================

const SmartInput: React.FC<SmartInputProps> = ({ label, value, onChange, storageKey, placeholder, theme, type = 'text', readOnly = false, suggestions = [] }) => {
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    if (type !== 'text' || readOnly) return; 
    const saved = localStorage.getItem(`lumina_history_${storageKey}`);
    if (saved) {
      setHistory(JSON.parse(saved));
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [storageKey, type, readOnly]);

  const saveToHistory = () => {
    if (type !== 'text' || !value.trim() || readOnly) return;
    const newHistory = Array.from(new Set([value, ...history])).slice(10);
    setHistory(newHistory);
    localStorage.setItem(`lumina_history_${storageKey}`, JSON.stringify(newHistory));
  };

  const deleteFromHistory = (e: React.MouseEvent, item: string) => {
    e.stopPropagation();
    const newHistory = history.filter(h => h !== item);
    setHistory(newHistory);
    localStorage.setItem(`lumina_history_${storageKey}`, JSON.stringify(newHistory));
  };

  // Combine Presets (Suggestions) and History, removing duplicates
  const allOptions = Array.from(new Set([...suggestions, ...history]));

  const inputClass = isDark 
    ? "bg-white/5 border-white/10 text-white focus:bg-white/10 focus:border-white/30 placeholder:text-white/20" 
    : "bg-black/5 border-black/10 text-black focus:bg-black/5 focus:border-black/30 placeholder:text-black/30";
  
  const labelClass = isDark ? "text-white/60" : "text-black/50";
  const dropdownClass = isDark ? "bg-[#1a1f35] border-white/10 text-white/80" : "bg-white border-black/10 text-black/80";

  return (
    <div className="relative" ref={wrapperRef}>
      <label className={`block text-xs uppercase tracking-wider mb-1 ${labelClass}`}>{label}</label>
      <div className="relative">
        <input 
          type={type}
          value={value} 
          onChange={(e) => onChange(e.target.value)}
          onBlur={saveToHistory}
          onFocus={() => type === 'text' && !readOnly && setShowHistory(true)}
          readOnly={readOnly}
          className={`w-full border rounded p-2 text-xs focus:outline-none transition-colors ${inputClass} ${type === 'date' ? 'min-h-[34px]' : ''} ${readOnly ? 'cursor-not-allowed opacity-70' : ''}`}
          placeholder={placeholder}
        />
        {type === 'text' && allOptions.length > 0 && !readOnly && (
          <button 
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className={`absolute right-2 top-1/2 -translate-y-1/2 hover:scale-110 ${isDark ? 'text-white/30 hover:text-white' : 'text-black/30 hover:text-black'}`}
          >
            <ChevronDown size={14} />
          </button>
        )}
      </div>

      {showHistory && allOptions.length > 0 && !readOnly && (
        <div className={`absolute z-50 top-full left-0 right-0 mt-1 border rounded-lg shadow-xl overflow-hidden max-h-40 overflow-y-auto ${dropdownClass}`}>
          {allOptions.map((item) => (
            <div 
              key={item} 
              className={`flex justify-between items-center px-3 py-2 cursor-pointer group hover:opacity-80`}
              onClick={() => { onChange(item); setShowHistory(false); }}
            >
              <span className="truncate flex-1">{item}</span>
              {/* Only show delete for history items, not managed presets */}
              {history.includes(item) && !suggestions.includes(item) && (
                <button 
                    onClick={(e) => deleteFromHistory(e, item)}
                    className="opacity-50 hover:opacity-100 text-red-400 hover:text-red-500 p-1 transition-opacity"
                >
                    <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ==========================================
// Main Component
// ==========================================

export const UploadModal: React.FC<UploadModalProps> = ({ 
    isOpen, onClose, onUpload, theme, editingPhoto, token, 
    categories = DEFAULT_CATEGORIES // Default fallback
}) => {
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>(''); // Text status
  const [presets, setPresets] = useState<Presets>({ cameras: [], lenses: [] });

  // Fetch presets on open
  useEffect(() => {
      if (isOpen) {
          client.getPresets().then(p => {
              if(p) setPresets(p);
          });
      }
  }, [isOpen]);
  
  // Result Overlay State
  const [resultState, setResultState] = useState<{
      show: boolean;
      success: boolean;
      title: string;
      message: string;
  }>({ show: false, success: false, title: '', message: '' });

  // -----------------------
  // Single Mode State
  // -----------------------
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageDims, setImageDims] = useState<{width: number, height: number}>({ width: 0, height: 0 });
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>(categories[0]);
  const [rating, setRating] = useState(5);
  
  const [camera, setCamera] = useState('');
  const [lens, setLens] = useState('');
  const [aperture, setAperture] = useState('');
  const [shutter, setShutter] = useState('');
  const [iso, setIso] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [focalLength, setFocalLength] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  // -----------------------
  // Batch Mode State
  // -----------------------
  const [batchList, setBatchList] = useState<BatchItem[]>([]);
  const [batchCategory, setBatchCategory] = useState<string>(categories[0]);
  const [batchDate, setBatchDate] = useState('');
  const [batchLat, setBatchLat] = useState('');
  const [batchLng, setBatchLng] = useState('');
  const [batchLocationName, setBatchLocationName] = useState(''); 
  
  // Map logic shared ref
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerInstance = useRef<any>(null);

  const isDark = theme === 'dark';
  const textPrimary = isDark ? "text-white" : "text-black";
  const textSecondary = isDark ? "text-white/60" : "text-black/60";

  // Init
  useEffect(() => {
    if (isOpen) {
      // Defaults
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;

      // Reset Category if it doesn't match available options (optional safety)
      const defaultCat = categories[0] || '默认';

      if (editingPhoto) {
        setMode('single');
        setImageUrl(editingPhoto.url);
        setTitle(editingPhoto.title);
        setCategory(editingPhoto.category || defaultCat);
        setRating(editingPhoto.rating || 0);
        setImageDims({ width: editingPhoto.width || 0, height: editingPhoto.height || 0 });
        
        setCamera(editingPhoto.exif.camera);
        setLens(editingPhoto.exif.lens);
        setAperture(editingPhoto.exif.aperture);
        setShutter(editingPhoto.exif.shutterSpeed);
        setIso(editingPhoto.exif.iso);
        setLocation(editingPhoto.exif.location);
        setDate(editingPhoto.exif.date);
        setFocalLength(editingPhoto.exif.focalLength || '');
        setLatitude(editingPhoto.exif.latitude ? String(editingPhoto.exif.latitude) : '');
        setLongitude(editingPhoto.exif.longitude ? String(editingPhoto.exif.longitude) : '');
      } else {
        // Reset Single
        setImageUrl(''); setImageDims({width:0,height:0}); setTitle(''); setRating(5);
        setCategory(defaultCat);
        setCamera(''); setLens(''); setAperture(''); setShutter(''); setIso(''); setLocation(''); setFocalLength(''); 
        setLatitude(''); setLongitude('');
        setDate(todayStr);

        // Reset Batch
        setBatchList([]);
        setBatchCategory(defaultCat);
        setBatchDate(todayStr);
        setBatchLat(''); setBatchLng(''); setBatchLocationName('');
      }
      setResultState({ show: false, success: false, title: '', message: '' });
      setUploadStatus('');
    }
  }, [isOpen, editingPhoto, categories]);

  // Shared Map Initialization
  useEffect(() => {
    if (!isOpen) {
        if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
        return;
    }
    
    // Check for container mismatch (happens when switching modes)
    if (mapInstance.current && mapRef.current && mapInstance.current.getContainer() !== mapRef.current) {
         mapInstance.current.remove();
         mapInstance.current = null;
    }

    // Delay slightly to allow DOM to render
    const timer = setTimeout(() => {
        const L = (window as any).L;
        if (!L || !mapRef.current) return;

        // Current Active Coords
        let latStr = mode === 'single' ? latitude : batchLat;
        let lngStr = mode === 'single' ? longitude : batchLng;
        
        // Defaults if empty
        let center: [number, number] = [35.6895, 139.6917];
        const latNum = parseFloat(latStr);
        const lngNum = parseFloat(lngStr);
        if (!isNaN(latNum) && !isNaN(lngNum)) center = [latNum, lngNum];

        if (!mapInstance.current) {
            mapInstance.current = L.map(mapRef.current, { center: center, zoom: 2, zoomControl: false, attributionControl: false });
            const map = mapInstance.current;
            const layerStyle = theme === 'dark' ? 'dark_all' : 'light_all';
            L.tileLayer(`https://{s}.basemaps.cartocdn.com/${layerStyle}/{z}/{x}/{y}{r}.png`, { maxZoom: 20, subdomains: 'abcd' }).addTo(map);
            
            const dotIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color: ${theme === 'dark' ? '#ffffff' : '#000000'}; width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.5); border: 2px solid rgba(255,255,255,0.5);"></div>`,
                iconSize: [12, 12], iconAnchor: [6, 6]
            });
            
            markerInstance.current = L.marker(center, { icon: dotIcon, draggable: true }).addTo(map);
            
            const updateCoords = (lat: number, lng: number) => {
                const latS = lat.toFixed(6);
                const lngS = lng.toFixed(6);
                if (mode === 'single') {
                    setLatitude(latS); setLongitude(lngS);
                } else {
                    setBatchLat(latS); setBatchLng(lngS);
                }
            };

            markerInstance.current.on('dragend', function(event: any) {
                const pos = event.target.getLatLng();
                updateCoords(pos.lat, pos.lng);
            });
            
            map.on('click', function(e: any) {
                markerInstance.current.setLatLng(e.latlng);
                updateCoords(e.latlng.lat, e.latlng.lng);
            });
            
            // Fix map resize issues in modal
            setTimeout(() => { map.invalidateSize(); }, 200);

        } else {
            // Update existing map if coords changed externally (e.g. EXIF loaded)
            mapInstance.current.invalidateSize();
            if (!isNaN(latNum) && !isNaN(lngNum)) {
                // Only pan if distance is significant to avoid jitter
                const cur = markerInstance.current.getLatLng();
                if (Math.abs(cur.lat - latNum) > 0.0001 || Math.abs(cur.lng - lngNum) > 0.0001) {
                    markerInstance.current.setLatLng([latNum, lngNum]);
                    mapInstance.current.setView([latNum, lngNum], mapInstance.current.getZoom());
                }
            }
        }
    }, 100);
    return () => clearTimeout(timer);
  }, [isOpen, theme, mode, latitude, longitude, batchLat, batchLng]); // Dependencies to trigger updates

  // SINGLE: Handle File Selection
  const handleSingleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLoading(true);
      setUploadStatus('解析图片中...');
      try {
        const { base64, width, height, exif } = await processImageFile(file);
        setImageUrl(base64);
        setImageDims({ width, height });
        
        // Auto-fill EXIF fields
        if(exif.camera) setCamera(exif.camera);
        if(exif.iso) setIso(exif.iso);
        if(exif.aperture) setAperture(exif.aperture);
        if(exif.shutter) setShutter(exif.shutter);
        if(exif.focalLength) setFocalLength(exif.focalLength);
        if(exif.date) setDate(exif.date);
        if(exif.latitude && exif.longitude) {
            setLatitude(String(exif.latitude));
            setLongitude(String(exif.longitude));
        }
      } catch (err) {
        alert("图片处理失败");
      } finally {
        setLoading(false);
        setUploadStatus('');
      }
    }
  };

  // SINGLE: Handle Submit
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl) return;

    // Check mandatory GPS
    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    const hasGPS = !isNaN(latNum) && !isNaN(lngNum);

    if (!hasGPS) {
        alert("请设置地理坐标 (必选)");
        return;
    }

    setLoading(true);
    setUploadStatus(editingPhoto ? '保存中...' : '上传中...');

    const photoData: Photo = {
      id: editingPhoto ? editingPhoto.id : '',
      url: editingPhoto ? editingPhoto.url : '',
      title: title || '未命名作品',
      category: category,
      width: imageDims.width,
      height: imageDims.height,
      rating: rating,
      exif: { 
        camera, lens, aperture, shutterSpeed: shutter, iso, location, date, focalLength,
        latitude: latNum, 
        longitude: lngNum
      }
    };

    try {
      const result = await client.uploadPhoto(imageUrl, photoData, token);
      onUpload(result); 
      setResultState({
          show: true,
          success: true,
          title: editingPhoto ? '修改成功' : '上传成功',
          message: editingPhoto ? '作品信息已更新。' : '作品已成功发布到作品集。'
      });
    } catch (err: any) {
      setResultState({
          show: true,
          success: false,
          title: '操作失败',
          message: err.message || '未知错误'
      });
    } finally {
      setLoading(false);
      setUploadStatus('');
    }
  };

  // BATCH: Handle File Selection
  const handleBatchFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      const newItems: BatchItem[] = [];
      
      for (const file of files) {
          const id = Math.random().toString(36).substr(2, 9);
          try {
             const { base64, width, height, exif } = await processImageFile(file);
             newItems.push({
                 id, file, status: 'pending', thumbnail: base64, width, height, exif
             });
          } catch (e) {
              console.error("Skipped file", file.name);
          }
      }
      setBatchList(prev => [...prev, ...newItems]);
  };

  // BATCH: Remove item
  const removeBatchItem = (id: string) => {
      setBatchList(prev => prev.filter(i => i.id !== id));
  };

  // BATCH: Submit
  const handleBatchSubmit = async () => {
      if (batchList.length === 0) return;

      const latNum = parseFloat(batchLat);
      const lngNum = parseFloat(batchLng);
      const hasCommonGPS = !isNaN(latNum) && !isNaN(lngNum);

      // Validation: If no common GPS set, ensure ALL items have EXIF GPS
      if (!hasCommonGPS) {
          const missingGPS = batchList.filter(item => !item.exif.latitude || !item.exif.longitude);
          if (missingGPS.length > 0) {
              alert(`存在 ${missingGPS.length} 张图片缺少地理坐标。请在地图上设定统一坐标，或确保所有图片含有GPS信息。`);
              return;
          }
      }
      
      setLoading(true);
      let successCount = 0;
      let failCount = 0;

      // Clone list to update status in place
      const queue = [...batchList];

      for (let i = 0; i < queue.length; i++) {
          const item = queue[i];
          if (item.status === 'success') {
              successCount++;
              continue; // Skip already done
          }

          // Update Status -> Uploading
          setBatchList(prev => prev.map(p => p.id === item.id ? { ...p, status: 'uploading' } : p));
          
          try {
              // Prepare Data
              // 1. Title defaults to filename without extension
              const title = item.file.name.replace(/\.[^/.]+$/, "");
              
              const photoData: Photo = {
                  id: '',
                  url: '',
                  title: title,
                  category: batchCategory,
                  rating: 5,
                  width: item.width,
                  height: item.height,
                  exif: {
                      ...item.exif, // Keep camera/lens/iso/shutter from file
                      date: batchDate || item.exif.date, // Override date if set
                      location: batchLocationName || item.exif.location,
                      latitude: hasCommonGPS ? latNum : item.exif.latitude,
                      longitude: hasCommonGPS ? lngNum : item.exif.longitude
                  }
              };

              const result = await client.uploadPhoto(item.thumbnail, photoData, token);
              
              // Notify App
              onUpload(result);
              
              setBatchList(prev => prev.map(p => p.id === item.id ? { ...p, status: 'success' } : p));
              successCount++;
          } catch (err: any) {
              console.error(err);
              setBatchList(prev => prev.map(p => p.id === item.id ? { ...p, status: 'error', errorMsg: err.message } : p));
              failCount++;
          }
      }

      setLoading(false);
      setResultState({
          show: true,
          success: failCount === 0,
          title: '批量上传完成',
          message: `成功: ${successCount} 张，失败: ${failCount} 张。`
      });
  };

  // Result Modal Content
  const ResultOverlay = () => {
      if (!resultState.show) return null;
      
      const isSuccess = resultState.success;
      
      return (
          <div className={`absolute inset-0 z-50 flex items-center justify-center p-6 animate-fade-in backdrop-blur-md ${isDark ? 'bg-black/80' : 'bg-white/80'}`}>
              <GlassCard className="w-full max-w-sm p-8 text-center" hoverEffect={false} theme={theme}>
                  <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${isSuccess ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                      {isSuccess ? <Check size={32} /> : <AlertCircle size={32} />}
                  </div>
                  <h3 className={`text-xl font-serif mb-2 ${textPrimary}`}>{resultState.title}</h3>
                  <p className={`text-sm mb-6 ${textSecondary}`}>{resultState.message}</p>
                  
                  <div className="flex gap-3 justify-center">
                      <button 
                         onClick={onClose}
                         className={`px-6 py-2 rounded-lg border transition-colors ${isDark ? 'border-white/20 text-white hover:bg-white/10' : 'border-black/20 text-black hover:bg-black/5'}`}
                      >
                          关闭
                      </button>
                      
                      {/* Continue Button logic */}
                      {mode === 'single' ? (
                          <button 
                             onClick={() => {
                                 // Reset for next
                                 setResultState(prev => ({...prev, show: false}));
                                 if (!editingPhoto) {
                                     setImageUrl(''); setTitle(''); setUploadStatus('');
                                     // Keep category/location as they might be repetitive
                                 } else {
                                     onClose();
                                 }
                             }}
                             className={`px-6 py-2 rounded-lg font-medium ${isDark ? 'bg-white text-black' : 'bg-black text-white'}`}
                          >
                             {editingPhoto ? '完成' : '继续上传'}
                          </button>
                      ) : (
                           <button 
                             onClick={() => {
                                 setResultState(prev => ({...prev, show: false}));
                                 // Clear successes?
                                 setBatchList(prev => prev.filter(p => p.status !== 'success'));
                             }}
                             className={`px-6 py-2 rounded-lg font-medium ${isDark ? 'bg-white text-black' : 'bg-black text-white'}`}
                          >
                             继续上传
                          </button>
                      )}
                  </div>
              </GlassCard>
          </div>
      );
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in ${isDark ? 'bg-black/80 backdrop-blur-sm' : 'bg-white/60 backdrop-blur-md'}`}>
      <GlassCard className="w-full max-w-2xl h-[90vh] flex flex-col relative overflow-hidden" hoverEffect={false} theme={theme}>
        
        {/* Header */}
        <div className="flex-shrink-0 p-6 pb-2 flex justify-between items-center border-b border-transparent">
            <div>
                <h2 className={`text-2xl font-serif ${textPrimary}`}>{editingPhoto ? '编辑作品' : '上传作品'}</h2>
                
                {/* Tabs - Only show if not editing */}
                {!editingPhoto && (
                    <div className="flex gap-4 mt-2">
                        <button 
                           onClick={() => setMode('single')}
                           className={`text-xs uppercase tracking-widest pb-1 border-b-2 transition-colors ${mode === 'single' ? (isDark ? 'border-white text-white' : 'border-black text-black') : 'border-transparent opacity-50'}`}
                        >
                            单张上传
                        </button>
                        <button 
                           onClick={() => setMode('batch')}
                           className={`text-xs uppercase tracking-widest pb-1 border-b-2 transition-colors ${mode === 'batch' ? (isDark ? 'border-white text-white' : 'border-black text-black') : 'border-transparent opacity-50'}`}
                        >
                            批量上传
                        </button>
                    </div>
                )}
            </div>
            <button onClick={onClose} className={`${textSecondary} hover:${textPrimary} transition-colors`}>
              <X size={24} />
            </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 pt-4 custom-scrollbar">
          
          {/* ================= SINGLE MODE FORM ================= */}
          {mode === 'single' && (
             <form onSubmit={handleSingleSubmit} className="space-y-6">
                {/* Image Drop/Preview */}
                <div className={`w-full aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center relative overflow-hidden group transition-colors flex-shrink-0
                   ${isDark ? 'border-white/20 bg-white/5 hover:border-white/40' : 'border-black/20 bg-black/5 hover:border-black/40'}
                `}>
                  {imageUrl ? (
                    <img src={imageUrl} alt="Preview" className="w-full h-full object-contain" />
                  ) : (
                    <div className={`flex flex-col items-center ${isDark ? 'text-white/50' : 'text-black/50'}`}>
                      {loading ? <Loader2 className="animate-spin mb-2" /> : <Upload size={40} className="mb-2" />}
                      <span className="text-sm">点击选择或拖拽图片</span>
                    </div>
                  )}
                  {uploadStatus && !resultState.show && (
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-2 py-1 rounded-full backdrop-blur-md flex items-center gap-1">
                          <Loader2 size={10} className="animate-spin"/>
                          {uploadStatus}
                      </div>
                  )}
                  <input type="file" accept="image/jpeg,image/tiff,image/png" onChange={handleSingleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>

                {/* Main Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs uppercase tracking-wider mb-1 ${textSecondary}`}>作品标题</label>
                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={`w-full border rounded-lg p-2 focus:outline-none transition-colors ${isDark ? 'bg-white/10 border-white/10 text-white focus:border-white/40' : 'bg-black/5 border-black/10 text-black focus:border-black/40'}`} />
                  </div>
                  <div>
                    <label className={`block text-xs uppercase tracking-wider mb-1 ${textSecondary}`}>作品分类</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className={`w-full border rounded-lg p-2 focus:outline-none ${isDark ? 'bg-white/10 border-white/10 text-white [&>option]:text-black' : 'bg-black/5 border-black/10 text-black'}`}>
                      {categories.map(c => (<option key={c} value={c}>{c}</option>))}
                    </select>
                  </div>
                </div>

                {/* Rating */}
                <div>
                   <label className={`block text-xs uppercase tracking-wider mb-1 ${textSecondary}`}>评级</label>
                   <div className="flex gap-2">
                     {[1,2,3,4,5].map(s => (
                       <button type="button" key={s} onClick={() => setRating(s)} className="focus:outline-none hover:scale-110 transition-transform">
                         <Star size={20} className={s <= rating ? (isDark ? 'text-white fill-white' : 'text-black fill-black') : (isDark ? 'text-white/20' : 'text-black/20')} />
                       </button>
                     ))}
                   </div>
                </div>

                {/* EXIF Section */}
                <div className={`border-t pt-4 ${isDark ? 'border-white/10' : 'border-black/10'}`}>
                  <div className="flex justify-between items-end mb-3">
                     <h3 className={`text-sm font-medium ${isDark ? 'text-white/80' : 'text-black/80'}`}>EXIF 参数信息</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     <SmartInput label="相机型号" value={camera} onChange={setCamera} storageKey="camera" theme={theme} suggestions={presets.cameras} />
                     <SmartInput label="镜头" value={lens} onChange={setLens} storageKey="lens" theme={theme} suggestions={presets.lenses} />
                     <SmartInput label="焦段" value={focalLength} onChange={setFocalLength} storageKey="focal" theme={theme} />
                     <SmartInput label="光圈" value={aperture} onChange={setAperture} storageKey="aperture" theme={theme} />
                     <SmartInput label="快门" value={shutter} onChange={setShutter} storageKey="shutter" theme={theme} />
                     <SmartInput label="ISO" value={iso} onChange={setIso} storageKey="iso" theme={theme} />
                     <div className="col-span-2">
                        <SmartInput label="地点" value={location} onChange={setLocation} storageKey="location" theme={theme} />
                     </div>
                  </div>

                  {/* Map Section */}
                  <div className={`mt-4 p-3 rounded-lg border ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'}`}>
                     <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2 text-xs opacity-60">
                            <MapPin size={12} />
                            <span>地理坐标 <span className="text-red-400">*必填</span> (拖动黑点选择)</span>
                        </div>
                        {(latitude && longitude) && <div className="flex items-center gap-1 text-xs text-green-500"><CheckCircle size={12} /><span>已锁定</span></div>}
                     </div>
                     <div className="grid grid-cols-2 gap-4 mb-2">
                        <SmartInput label="纬度" value={latitude} onChange={setLatitude} storageKey="gps_lat" placeholder="0.00" theme={theme} />
                        <SmartInput label="经度" value={longitude} onChange={setLongitude} storageKey="gps_lng" placeholder="0.00" theme={theme} />
                     </div>
                     <div ref={mode === 'single' ? mapRef : null} className="w-full h-48 rounded-md overflow-hidden bg-gray-100 relative z-0" />
                  </div>

                  <div className="mt-4">
                     <SmartInput label="拍摄日期" value={date} onChange={setDate} storageKey="date" theme={theme} type="date" />
                  </div>
                </div>

                <button type="submit" disabled={!imageUrl || loading} className={`w-full font-semibold py-3 rounded-xl hover:scale-[1.02] transition-transform disabled:opacity-50 shadow-lg mb-4 ${isDark ? 'bg-white text-black shadow-white/10' : 'bg-black text-white shadow-black/10'}`}>
                  {loading ? '处理中...' : (editingPhoto ? '保存修改' : '发布到作品集')}
                </button>
             </form>
          )}

          {/* ================= BATCH MODE FORM ================= */}
          {mode === 'batch' && (
             <div className="space-y-6">
                {/* Common Settings Area */}
                <div className={`p-4 rounded-xl border ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'}`}>
                    <h3 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${textPrimary}`}>
                        <Layers size={14} /> 统一设置 (应用到所有图片)
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className={`block text-xs uppercase tracking-wider mb-1 ${textSecondary}`}>统一分类</label>
                            <select value={batchCategory} onChange={(e) => setBatchCategory(e.target.value)} className={`w-full border rounded-lg p-2 focus:outline-none ${isDark ? 'bg-white/10 border-white/10 text-white [&>option]:text-black' : 'bg-black/5 border-black/10 text-black'}`}>
                                {categories.map(c => (<option key={c} value={c}>{c}</option>))}
                            </select>
                        </div>
                        <div>
                            <SmartInput label="拍摄日期" value={batchDate} onChange={setBatchDate} storageKey="date" theme={theme} type="date" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <SmartInput label="统一地点名称" value={batchLocationName} onChange={setBatchLocationName} storageKey="location" theme={theme} />
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <SmartInput label="纬度" value={batchLat} onChange={setBatchLat} storageKey="gps_lat" placeholder="0.00" theme={theme} />
                                <SmartInput label="经度" value={batchLng} onChange={setBatchLng} storageKey="gps_lng" placeholder="0.00" theme={theme} />
                            </div>
                         </div>
                         <div ref={mode === 'batch' ? mapRef : null} className="w-full h-32 rounded-md overflow-hidden bg-gray-100 relative z-0" />
                    </div>
                </div>

                {/* File Drop Area */}
                <div className={`w-full h-32 rounded-xl border-2 border-dashed flex flex-col items-center justify-center relative transition-colors ${isDark ? 'border-white/20 hover:border-white/40' : 'border-black/20 hover:border-black/40'}`}>
                    <div className={`flex flex-col items-center pointer-events-none ${isDark ? 'text-white/50' : 'text-black/50'}`}>
                        <Upload size={30} className="mb-2" />
                        <span className="text-sm">添加照片 (支持多选)</span>
                    </div>
                    <input type="file" multiple accept="image/jpeg,image/tiff,image/png" onChange={handleBatchFiles} className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>

                {/* File List */}
                <div className="space-y-2">
                    <h3 className={`text-xs uppercase tracking-wider ${textSecondary}`}>已添加队列 ({batchList.length})</h3>
                    
                    {batchList.length === 0 && <p className={`text-xs italic ${textSecondary}`}>暂无图片</p>}
                    
                    {batchList.map((item) => (
                        <div key={item.id} className={`flex items-center gap-3 p-2 rounded-lg border ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'}`}>
                            <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-gray-500">
                                <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm truncate ${textPrimary}`}>{item.file.name}</p>
                                <p className={`text-[10px] ${textSecondary}`}>
                                    {item.status === 'pending' && '等待上传'}
                                    {item.status === 'uploading' && '正在上传...'}
                                    {item.status === 'success' && '上传成功'}
                                    {item.status === 'error' && <span className="text-red-400">失败: {item.errorMsg}</span>}
                                </p>
                            </div>
                            
                            {item.status === 'pending' && (
                                <button onClick={() => removeBatchItem(item.id)} className="p-2 opacity-50 hover:opacity-100 text-red-400">
                                    <Trash2 size={16} />
                                </button>
                            )}
                            {item.status === 'success' && <CheckCircle size={16} className="text-green-500 mr-2" />}
                            {item.status === 'uploading' && <Loader2 size={16} className="animate-spin text-blue-500 mr-2" />}
                            {item.status === 'error' && <AlertCircle size={16} className="text-red-500 mr-2" />}
                        </div>
                    ))}
                </div>

                {/* Footer Action */}
                <button 
                   onClick={handleBatchSubmit} 
                   disabled={loading || batchList.length === 0 || batchList.every(i => i.status === 'success')}
                   className={`w-full font-semibold py-3 rounded-xl hover:scale-[1.02] transition-transform disabled:opacity-50 shadow-lg mb-4 ${isDark ? 'bg-white text-black shadow-white/10' : 'bg-black text-white shadow-black/10'}`}
                >
                  {loading ? '正在批量上传...' : `开始上传 (${batchList.filter(i => i.status === 'pending').length} 张)`}
                </button>
             </div>
          )}

        </div>

        {/* Result Overlay Popup */}
        <ResultOverlay />

      </GlassCard>
    </div>
  );
};
