
import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Loader2, ChevronDown, Trash2, Star, Calendar as CalendarIcon, MapPin, CheckCircle, Cloud, Layers, Image as ImageIcon, Check, AlertCircle, ArrowRight, FileImage, RefreshCw, UploadCloud, ScanLine, Camera } from 'lucide-react';
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

// ==========================================
// Helper Functions
// ==========================================

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const timeOutId = setTimeout(() => reject(new Error("Compression timeout")), 15000); // 15s timeout for large files

    const maxSizeInBytes = 2 * 1024 * 1024; // 2MB
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = objectUrl;
    img.onload = () => {
      clearTimeout(timeOutId);
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
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context unavailable')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.9;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      
      // Binary Search-ish reduction
      const maxStringLength = maxSizeInBytes * 1.37; // Approx base64 length for 2MB
      while (dataUrl.length > maxStringLength && quality > 0.3) {
         quality -= 0.1;
         dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(dataUrl);
    };
    img.onerror = (e) => { 
        clearTimeout(timeOutId);
        URL.revokeObjectURL(objectUrl); 
        reject(e); 
    }
  });
};

// Helper: Convert EXIF Rational object (numerator/denominator) to number
const rationalToNumber = (data: any): number => {
    if (typeof data === 'number') return data;
    if (data && typeof data === 'object' && 'numerator' in data && 'denominator' in data) {
        if (data.denominator === 0) return 0;
        return data.numerator / data.denominator;
    }
    if (data instanceof Number) return data.valueOf();
    return Number(data) || 0;
};

// Helper to parse raw tags into our format
const parseExifTags = (tags: any) => {
    const data: any = {};
    
    // Helper to safely get string and clean null bytes
    const getStr = (key: string) => tags[key] ? String(tags[key]).replace(/\0/g, '').trim() : '';

    // 1. Camera
    const make = getStr('Make');
    const model = getStr('Model');
    if (model) {
        // If model already contains make (e.g. "Canon EOS 5D"), don't prepend make
        data.camera = model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`.trim();
    }

    // 2. Lens (Try multiple tags)
    // LensModel is 0xA434, Lens is 0xFDEA sometimes. exif-js maps common ones.
    const lensModel = getStr('LensModel') || getStr('Lens') || getStr('LensInfo');
    if (lensModel) data.lens = lensModel;

    // 3. Technical Specs
    if (tags['ISOSpeedRatings']) {
        // ISO might be just a number or a rational
        data.iso = String(tags['ISOSpeedRatings']); 
    }
    
    if (tags['FNumber']) {
        const f = rationalToNumber(tags['FNumber']);
        if (f > 0) data.aperture = `f/${f.toFixed(1)}`.replace('.0', '');
    }
    
    if (tags['ExposureTime']) {
        const t = rationalToNumber(tags['ExposureTime']);
        if (t > 0) {
             // Format: 1/125s instead of 0.008s
             data.shutter = t < 1 ? `1/${Math.round(1/t)}s` : `${t}s`;
        }
    }

    if (tags['FocalLength']) {
        const fl = rationalToNumber(tags['FocalLength']);
        if (fl > 0) data.focalLength = `${Math.round(fl)}mm`;
    }

    if (tags['DateTimeOriginal']) {
        // Format: "YYYY:MM:DD HH:MM:SS" -> "YYYY-MM-DD"
        const dt = String(tags['DateTimeOriginal']);
        if (dt.length >= 10) {
            data.date = dt.substring(0, 10).replace(/:/g, '-');
        }
    }

    // 4. GPS
    const lat = tags['GPSLatitude'];
    const latRef = tags['GPSLatitudeRef'];
    const lon = tags['GPSLongitude'];
    const lonRef = tags['GPSLongitudeRef'];

    if (lat && lon && lat.length === 3 && lon.length === 3) {
        // GPSLatitude is an array of 3 Rationals [deg, min, sec]
        const dLat = rationalToNumber(lat[0]);
        const mLat = rationalToNumber(lat[1]);
        const sLat = rationalToNumber(lat[2]);
        
        let ddLat = dLat + mLat / 60 + sLat / 3600;
        if (latRef === 'S') ddLat = -ddLat;

        const dLon = rationalToNumber(lon[0]);
        const mLon = rationalToNumber(lon[1]);
        const sLon = rationalToNumber(lon[2]);
        
        let ddLon = dLon + mLon / 60 + sLon / 3600;
        if (lonRef === 'W') ddLon = -ddLon;

        // Ensure valid coordinates
        if (!isNaN(ddLat) && !isNaN(ddLon) && (ddLat !== 0 || ddLon !== 0)) {
            data.latitude = ddLat;
            data.longitude = ddLon;
        }
    }

    return data;
};

const extractExif = async (file: File): Promise<any> => {
  // 1. Check file type warnings
  const type = file.type.toLowerCase();
  if (type.includes('png') || type.includes('webp')) {
      alert("提示：PNG/WebP 格式通常不包含 EXIF 信息，建议使用 JPG/JPEG 原图。");
      return {};
  }
  if (type.includes('heic')) {
      alert("提示：HEIC 格式暂不支持直接读取 EXIF，建议先转换为 JPG。");
      return {};
  }

  // 2. Reliable Method: Create Image -> EXIF.getData
  // This avoids issues with ArrayBuffer slicing or direct file parsing on some browsers/file sizes
  return new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      
      img.onload = function() {
          // Explicitly cast 'this' to any to avoid TS errors with exif-js
          EXIF.getData(img as any, function(this: any) {
              // Retrieve all tags safely
              const allTags = EXIF.getAllTags(this);
              
              URL.revokeObjectURL(objectUrl); // Clean up memory
              
              if (allTags && Object.keys(allTags).length > 0) {
                  console.log("EXIF extracted successfully via Image object");
                  resolve(parseExifTags(allTags));
              } else {
                  console.warn("No EXIF tags found in image");
                  resolve({});
              }
          });
      };

      img.onerror = function() {
          URL.revokeObjectURL(objectUrl);
          console.error("Failed to load image for EXIF extraction");
          resolve({});
      };

      img.src = objectUrl;
  });
};

const processImageFile = async (file: File): Promise<{base64: string, exif: any, width: number, height: number}> => {
   // This is used for Batch Mode mainly
   const [base64, exif] = await Promise.all([compressImage(file), extractExif(file)]);
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

const fetchAddressFromCoords = async (lat: number, lng: number): Promise<string> => {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=zh-CN`);
        if (!response.ok) return '';
        const data = await response.json();
        const addr = data.address;
        if (!addr) return '';
        
        const parts = [];
        if (addr.district || addr.county) parts.push(addr.district || addr.county);
        if (addr.city || addr.town) parts.push(addr.city || addr.town);
        if (addr.state || addr.province) parts.push(addr.state || addr.province);
        if (addr.country) parts.push(addr.country);

        return parts.join(', ');
    } catch (e) {
        console.error("Geocoding error", e);
        return '';
    }
}

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
    categories = DEFAULT_CATEGORIES 
}) => {
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>(''); 
  const [presets, setPresets] = useState<Presets>({ cameras: [], lenses: [] });

  // -----------------------
  // Single Mode State
  // -----------------------
  // Raw file state
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [originalPreview, setOriginalPreview] = useState<string>('');
  const [compressedPreview, setCompressedPreview] = useState<string>('');
  const [isParsed, setIsParsed] = useState(false); // Parsed (Compressed + EXIF)

  // Photo Data State
  const [uploadedPhotoId, setUploadedPhotoId] = useState<string>(''); // If processed and uploaded
  const [imageUrl, setImageUrl] = useState<string>(''); // Final URL
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
  const [manualLocation, setManualLocation] = useState(false);

  // Result Overlay State
  const [resultState, setResultState] = useState<{
      show: boolean; success: boolean; title: string; message: string;
  }>({ show: false, success: false, title: '', message: '' });

  // -----------------------
  // Batch Mode State
  // -----------------------
  const [batchList, setBatchList] = useState<BatchItem[]>([]);
  const [batchCategory, setBatchCategory] = useState<string>(categories[0]);
  const [batchDate, setBatchDate] = useState('');
  const [batchLat, setBatchLat] = useState('');
  const [batchLng, setBatchLng] = useState('');
  const [batchLocationName, setBatchLocationName] = useState(''); 
  const [batchManualLoc, setBatchManualLoc] = useState(false);

  // Map Refs
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerInstance = useRef<any>(null);

  const isDark = theme === 'dark';
  const textPrimary = isDark ? "text-white" : "text-black";
  const textSecondary = isDark ? "text-white/60" : "text-black/60";

  // Init
  useEffect(() => {
    if (isOpen) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;
      const defaultCat = categories[0] || '默认';

      client.getPresets().then(p => {
        if(p) setPresets(p);
      });

      if (editingPhoto) {
        setMode('single');
        setOriginalFile(null);
        setOriginalPreview('');
        setCompressedPreview(editingPhoto.url); // Use existing URL as preview
        setUploadedPhotoId(editingPhoto.id);
        setImageUrl(editingPhoto.url);
        setIsParsed(true); // Editing implies parsed
        
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
        setManualLocation(true); 
      } else {
        // Reset Single
        setOriginalFile(null); setOriginalPreview(''); setCompressedPreview(''); 
        setUploadedPhotoId(''); setImageUrl(''); setIsParsed(false);
        setImageDims({width:0,height:0}); setTitle(''); setRating(5);
        setCategory(defaultCat);
        setCamera(''); setLens(''); setAperture(''); setShutter(''); setIso(''); setLocation(''); setFocalLength(''); 
        setLatitude(''); setLongitude('');
        setDate(todayStr);
        setManualLocation(false);

        // Reset Batch
        setBatchList([]);
        setBatchCategory(defaultCat);
        setBatchDate(todayStr);
        setBatchLat(''); setBatchLng(''); setBatchLocationName('');
        setBatchManualLoc(false);
      }
      setResultState({ show: false, success: false, title: '', message: '' });
      setUploadStatus('');
    }
  }, [isOpen, editingPhoto, categories]);

  // Map Initialization
  useEffect(() => {
    if (!isOpen) {
        if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
        return;
    }
    
    if (mapInstance.current && mapRef.current && mapInstance.current.getContainer() !== mapRef.current) {
         mapInstance.current.remove();
         mapInstance.current = null;
    }

    const timer = setTimeout(() => {
        const L = (window as any).L;
        if (!L || !mapRef.current) return;

        let latStr = mode === 'single' ? latitude : batchLat;
        let lngStr = mode === 'single' ? longitude : batchLng;
        let center: [number, number] | null = null;
        
        const latNum = parseFloat(latStr);
        const lngNum = parseFloat(lngStr);
        
        if (!isNaN(latNum) && !isNaN(lngNum)) center = [latNum, lngNum];

        const initMap = (startCenter: [number, number]) => {
            if (mapInstance.current) return;
            
            mapInstance.current = L.map(mapRef.current, { center: startCenter, zoom: 4, zoomControl: false, attributionControl: false });
            const map = mapInstance.current;
            const layerStyle = theme === 'dark' ? 'dark_all' : 'light_all';
            L.tileLayer(`https://{s}.basemaps.cartocdn.com/${layerStyle}/{z}/{x}/{y}{r}.png`, { maxZoom: 20, subdomains: 'abcd' }).addTo(map);
            
            const dotIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color: ${theme === 'dark' ? '#ffffff' : '#000000'}; width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.5); border: 2px solid rgba(255,255,255,0.5);"></div>`,
                iconSize: [12, 12], iconAnchor: [6, 6]
            });
            
            markerInstance.current = L.marker(startCenter, { icon: dotIcon, draggable: true }).addTo(map);
            
            const updateCoordsAndAddress = async (lat: number, lng: number) => {
                const latS = lat.toFixed(6);
                const lngS = lng.toFixed(6);
                
                if (mode === 'single') {
                    setLatitude(latS); setLongitude(lngS);
                    if (!manualLocation) {
                        const addr = await fetchAddressFromCoords(lat, lng);
                        if (addr) setLocation(addr);
                    }
                } else {
                    setBatchLat(latS); setBatchLng(lngS);
                    if (!batchManualLoc) {
                        const addr = await fetchAddressFromCoords(lat, lng);
                        if (addr) setBatchLocationName(addr);
                    }
                }
            };

            markerInstance.current.on('dragend', (event: any) => {
                const pos = event.target.getLatLng();
                updateCoordsAndAddress(pos.lat, pos.lng);
            });
            
            map.on('click', (e: any) => {
                markerInstance.current.setLatLng(e.latlng);
                updateCoordsAndAddress(e.latlng.lat, e.latlng.lng);
            });
            
            setTimeout(() => { map.invalidateSize(); }, 200);
        };

        if (center) {
            initMap(center);
        } else if (navigator.geolocation) {
             navigator.geolocation.getCurrentPosition(
                 (pos) => {
                     const userCenter: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                     initMap(userCenter);
                     // Set default user location if empty
                     if (mode === 'single' && !latitude) {
                         setLatitude(pos.coords.latitude.toFixed(6));
                         setLongitude(pos.coords.longitude.toFixed(6));
                         if(!manualLocation) {
                            fetchAddressFromCoords(pos.coords.latitude, pos.coords.longitude).then(addr => {
                                if(addr) setLocation(addr);
                            });
                         }
                     }
                 },
                 (err) => initMap([35.6895, 139.6917]),
                 { timeout: 5000 }
             );
        } else {
            initMap([35.6895, 139.6917]);
        }
        
    }, 100);
    return () => clearTimeout(timer);
  }, [isOpen, theme, mode]);

  // Update map marker
  useEffect(() => {
       if (!mapInstance.current || !markerInstance.current) return;
       const latStr = mode === 'single' ? latitude : batchLat;
       const lngStr = mode === 'single' ? longitude : batchLng;
       const lat = parseFloat(latStr);
       const lng = parseFloat(lngStr);
       
       if (!isNaN(lat) && !isNaN(lng)) {
           const cur = markerInstance.current.getLatLng();
           if (Math.abs(cur.lat - lat) > 0.0001 || Math.abs(cur.lng - lng) > 0.0001) {
               markerInstance.current.setLatLng([lat, lng]);
               mapInstance.current.setView([lat, lng], mapInstance.current.getZoom());
           }
       }
  }, [latitude, longitude, batchLat, batchLng, mode]);


  // SINGLE: Handle File Selection (Instant Preview)
  const handleSingleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setOriginalFile(file);
      setOriginalPreview(URL.createObjectURL(file));
      
      // Strict Reset of all previous photo data
      setCompressedPreview('');
      setUploadedPhotoId('');
      setImageUrl('');
      setIsParsed(false); // Reset parse state
      
      setTitle(''); 
      setCamera(''); 
      setLens(''); 
      setAperture(''); 
      setShutter(''); 
      setIso(''); 
      setLocation(''); 
      setFocalLength(''); 
      // Do not reset GPS if we want to keep user current location logic, 
      // but to fix "retains previous version info" bug, strictly resetting might be safer.
      // However, the map init logic will try to refill it if it's empty.
      setLatitude('');
      setLongitude('');
      setManualLocation(false);
    }
  };

  // SINGLE: Parse Step (Compress + EXIF)
  const handleParse = async () => {
    if (!originalFile) return;
    setLoading(true);
    setUploadStatus('正在解析图片...');
    
    try {
        // 1. Compress
        const compressedBase64 = await compressImage(originalFile);
        setCompressedPreview(compressedBase64);
        
        // 2. Extract EXIF
        setUploadStatus('读取EXIF信息...');
        const exif = await extractExif(originalFile);

        // Fill form
        if(exif.camera) setCamera(exif.camera);
        if(exif.lens) setLens(exif.lens);
        if(exif.iso) setIso(exif.iso);
        if(exif.aperture) setAperture(exif.aperture);
        if(exif.shutter) setShutter(exif.shutter);
        if(exif.focalLength) setFocalLength(exif.focalLength);
        if(exif.date) setDate(exif.date);
        
        if(exif.latitude && exif.longitude) {
            setLatitude(String(exif.latitude));
            setLongitude(String(exif.longitude));
            const addr = await fetchAddressFromCoords(exif.latitude, exif.longitude);
            if(addr) {
                setLocation(addr);
                setManualLocation(false);
            }
        }

        // Get Dims
        const img = new Image();
        img.src = compressedBase64;
        await new Promise(r => img.onload = r);
        setImageDims({ width: img.naturalWidth, height: img.naturalHeight });

        setIsParsed(true);

    } catch(err: any) {
        alert("解析失败: " + err.message);
    } finally {
        setLoading(false);
        setUploadStatus('');
    }
  };

  // SINGLE: Upload Step (Cloud)
  const handleUploadToCloud = async () => {
      if (!compressedPreview || !originalFile) return;
      setLoading(true);
      setUploadStatus('上传到云端...');

      try {
        const tempPhotoData: Photo = {
            id: '', url: '', title: title || originalFile.name.replace(/\.[^/.]+$/, ""), category, rating, width: imageDims.width, height: imageDims.height, exif: {} as any
        };
        
        const result = await client.uploadPhoto(compressedPreview, tempPhotoData, token);
        setUploadedPhotoId(result.id);
        setImageUrl(result.url); 
        
        if (!title) setTitle(originalFile.name.replace(/\.[^/.]+$/, ""));
      } catch (err: any) {
        alert("上传失败: " + err.message);
      } finally {
        setLoading(false);
        setUploadStatus('');
      }
  };


  // SINGLE: Handle Final Save (Metadata Update)
  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl && !editingPhoto) return;

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    const hasGPS = !isNaN(latNum) && !isNaN(lngNum);

    if (!hasGPS) {
        alert("请设置地理坐标 (必选)");
        return;
    }

    setLoading(true);
    setUploadStatus('保存信息...');

    const photoData: Photo = {
      id: editingPhoto ? editingPhoto.id : uploadedPhotoId,
      url: imageUrl, 
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
          title: editingPhoto ? '修改成功' : '发布成功',
          message: editingPhoto ? '作品信息已更新。' : '作品及信息已成功发布。'
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

  // BATCH... (Kept same)
  const handleBatchFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      const files = Array.from(e.target.files);
      if (files.length === 0) return;
      const newItems: BatchItem[] = [];
      for (const file of files) {
          const id = Math.random().toString(36).substr(2, 9);
          try {
             const { base64, width, height, exif } = await processImageFile(file);
             newItems.push({ id, file, status: 'pending', thumbnail: base64, width, height, exif });
          } catch (e) {}
      }
      setBatchList(prev => [...prev, ...newItems]);
  };

  const removeBatchItem = (id: string) => setBatchList(prev => prev.filter(i => i.id !== id));

  const handleBatchSubmit = async () => {
      if (batchList.length === 0) return;
      const latNum = parseFloat(batchLat);
      const lngNum = parseFloat(batchLng);
      const hasCommonGPS = !isNaN(latNum) && !isNaN(lngNum);

      if (!hasCommonGPS) {
          const missingGPS = batchList.filter(item => !item.exif.latitude || !item.exif.longitude);
          if (missingGPS.length > 0) {
              alert(`存在 ${missingGPS.length} 张图片缺少地理坐标。请在地图上设定统一坐标。`);
              return;
          }
      }
      setLoading(true);
      let successCount = 0; let failCount = 0;
      const queue = [...batchList];

      for (let i = 0; i < queue.length; i++) {
          const item = queue[i];
          if (item.status === 'success') { successCount++; continue; }
          setBatchList(prev => prev.map(p => p.id === item.id ? { ...p, status: 'uploading' } : p));
          try {
              const title = item.file.name.replace(/\.[^/.]+$/, "");
              const photoData: Photo = {
                  id: '', url: '', title: title, category: batchCategory, rating: 5, width: item.width, height: item.height,
                  exif: {
                      ...item.exif,
                      date: batchDate || item.exif.date,
                      location: batchLocationName || item.exif.location,
                      latitude: hasCommonGPS ? latNum : item.exif.latitude,
                      longitude: hasCommonGPS ? lngNum : item.exif.longitude
                  }
              };
              const result = await client.uploadPhoto(item.thumbnail, photoData, token);
              onUpload(result);
              setBatchList(prev => prev.map(p => p.id === item.id ? { ...p, status: 'success' } : p));
              successCount++;
          } catch (err: any) {
              setBatchList(prev => prev.map(p => p.id === item.id ? { ...p, status: 'error', errorMsg: err.message } : p));
              failCount++;
          }
      }
      setLoading(false);
      setResultState({ show: true, success: failCount === 0, title: '批量上传完成', message: `成功: ${successCount} 张，失败: ${failCount} 张。` });
  };

  const ResultOverlay = () => {
      if (!resultState.show) return null;
      return (
          <div className={`absolute inset-0 z-50 flex items-center justify-center p-6 animate-fade-in backdrop-blur-md ${isDark ? 'bg-black/80' : 'bg-white/80'}`}>
              <GlassCard className="w-full max-w-sm p-8 text-center" hoverEffect={false} theme={theme}>
                  <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${resultState.success ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                      {resultState.success ? <Check size={32} /> : <AlertCircle size={32} />}
                  </div>
                  <h3 className={`text-xl font-serif mb-2 ${textPrimary}`}>{resultState.title}</h3>
                  <p className={`text-sm mb-6 ${textSecondary}`}>{resultState.message}</p>
                  <div className="flex gap-3 justify-center">
                      <button onClick={onClose} className={`px-6 py-2 rounded-lg border transition-colors ${isDark ? 'border-white/20 text-white hover:bg-white/10' : 'border-black/20 text-black hover:bg-black/5'}`}>关闭</button>
                      <button 
                         onClick={() => {
                             setResultState(prev => ({...prev, show: false}));
                             if (mode === 'single' && !editingPhoto) {
                                 setOriginalFile(null); setOriginalPreview(''); setCompressedPreview(''); setUploadedPhotoId(''); setImageUrl(''); setTitle(''); setIsParsed(false);
                                 setCamera(''); setLens(''); setAperture(''); setShutter(''); setIso(''); setLocation(''); setFocalLength(''); setLatitude(''); setLongitude('');
                             } else if (mode === 'batch') {
                                 setBatchList(prev => prev.filter(p => p.status !== 'success'));
                             } else if (editingPhoto) {
                                 onClose();
                             }
                         }}
                         className={`px-6 py-2 rounded-lg font-medium ${isDark ? 'bg-white text-black' : 'bg-black text-white'}`}
                      >
                         {editingPhoto ? '完成' : '继续上传'}
                      </button>
                  </div>
              </GlassCard>
          </div>
      );
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in ${isDark ? 'bg-black/80 backdrop-blur-sm' : 'bg-white/60 backdrop-blur-md'}`}>
      <GlassCard className="w-full max-w-4xl h-[95vh] flex flex-col relative overflow-hidden" hoverEffect={false} theme={theme}>
        
        <div className="flex-shrink-0 p-6 pb-2 flex justify-between items-center border-b border-transparent">
            <div>
                <h2 className={`text-2xl font-serif ${textPrimary}`}>{editingPhoto ? '编辑作品' : '上传作品'}</h2>
                {!editingPhoto && (
                    <div className="flex gap-4 mt-2">
                        <button onClick={() => setMode('single')} className={`text-xs uppercase tracking-widest pb-1 border-b-2 transition-colors ${mode === 'single' ? (isDark ? 'border-white text-white' : 'border-black text-black') : 'border-transparent opacity-50'}`}>单张精修</button>
                        <button onClick={() => setMode('batch')} className={`text-xs uppercase tracking-widest pb-1 border-b-2 transition-colors ${mode === 'batch' ? (isDark ? 'border-white text-white' : 'border-black text-black') : 'border-transparent opacity-50'}`}>批量上传</button>
                    </div>
                )}
            </div>
            <button onClick={onClose} className={`${textSecondary} hover:${textPrimary} transition-colors`}><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-4 custom-scrollbar">
          
          {mode === 'single' && (
             <form onSubmit={handleSaveInfo} className="space-y-6">
                
                {/* 1. SELECTION & PREVIEW AREA */}
                <div className="flex flex-col md:flex-row gap-6 items-center">
                    {/* LEFT: Raw / Original */}
                    <div className="flex-1 w-full space-y-2">
                        <div className={`w-full aspect-[4/3] rounded-xl border-2 border-dashed flex flex-col items-center justify-center relative overflow-hidden group transition-colors 
                           ${isDark ? 'border-white/20 bg-white/5' : 'border-black/20 bg-black/5'}
                           ${!originalPreview && !editingPhoto ? 'hover:border-white/40 cursor-pointer' : ''}
                        `}>
                            {originalPreview ? (
                                <img src={originalPreview} alt="Original" className="w-full h-full object-contain" />
                            ) : editingPhoto ? (
                                <img src={editingPhoto.url} alt="Original" className="w-full h-full object-contain opacity-50 grayscale" /> 
                            ) : (
                                <div className={`flex flex-col items-center pointer-events-none ${isDark ? 'text-white/50' : 'text-black/50'}`}>
                                    <FileImage size={32} className="mb-2" />
                                    <span className="text-sm">1. 选择原始图片 (RAW/JPG)</span>
                                </div>
                            )}
                            
                            {!uploadedPhotoId && (
                                <input type="file" accept="image/jpeg,image/tiff,image/png" onChange={handleSingleFileSelect} className="absolute inset-0 opacity-0 cursor-pointer" />
                            )}
                        </div>
                        <p className={`text-xs text-center ${textSecondary}`}>原始预览 (本地)</p>
                    </div>

                    {/* CENTER ARROW */}
                    <div className={`hidden md:flex flex-shrink-0 items-center justify-center w-8 ${isDark ? 'text-white/50' : 'text-black/50'}`}>
                        <ArrowRight size={24} />
                    </div>

                    {/* RIGHT: Compressed / Result */}
                    <div className="flex-1 w-full space-y-2">
                        <div className={`w-full aspect-[4/3] rounded-xl border flex flex-col items-center justify-center relative overflow-hidden
                           ${isDark ? 'bg-black/40 border-white/10' : 'bg-gray-100 border-black/10'}
                        `}>
                            {compressedPreview ? (
                                <img src={compressedPreview} alt="Processed" className="w-full h-full object-contain" />
                            ) : (
                                <div className={`flex flex-col items-center ${isDark ? 'text-white/30' : 'text-black/30'}`}>
                                    {loading ? <Loader2 size={32} className="animate-spin mb-2" /> : <Cloud size={32} className="mb-2" />}
                                    <span className="text-sm">{loading ? uploadStatus : '2. 等待处理'}</span>
                                </div>
                            )}
                            {uploadedPhotoId && (
                                <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 shadow-lg">
                                    <Check size={12} /> 已上传
                                </div>
                            )}
                        </div>
                         <p className={`text-xs text-center ${textSecondary}`}>处理后预览 (云端)</p>
                    </div>
                </div>

                {/* ACTION BUTTONS: SPLIT PARSE & UPLOAD */}
                {originalFile && !uploadedPhotoId && (
                    <div className="flex gap-4">
                        {/* Parse Button - Always visible */}
                        <button 
                            type="button"
                            onClick={handleParse}
                            disabled={loading}
                            className={`flex-1 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:scale-[1.01] transition-transform
                                ${isDark ? 'bg-blue-600 text-white disabled:bg-blue-600/50' : 'bg-blue-600 text-white disabled:bg-blue-600/50'}
                            `}
                        >
                            {loading && !isParsed ? <Loader2 className="animate-spin" /> : <Camera />}
                            {loading && !isParsed ? '正在解析...' : '解析相机数据'}
                        </button>
                        
                        {/* Upload Button - Always visible, enabled after parse */}
                        <button 
                            type="button"
                            onClick={handleUploadToCloud}
                            disabled={loading || !isParsed}
                            className={`flex-1 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:scale-[1.01] transition-transform animate-fade-in
                                ${isDark ? 'bg-green-600 text-white disabled:bg-green-600/30 disabled:opacity-50' : 'bg-green-600 text-white disabled:bg-green-600/30 disabled:opacity-50'}
                            `}
                        >
                            {loading && isParsed ? <Loader2 className="animate-spin" /> : <UploadCloud />}
                            {loading && isParsed ? '正在上传...' : '上传图片'}
                        </button>
                    </div>
                )}
                
                {/* 2. METADATA FORM (Visible after Parse, but Save enabled after Upload) */}
                {(isParsed || editingPhoto) && (
                    <div className="animate-fade-in space-y-6">
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
                                    <SmartInput label="地点" value={location} onChange={(val) => { setLocation(val); setManualLocation(true); }} storageKey="location" theme={theme} placeholder="自动获取或手动输入" />
                                </div>
                            </div>

                            <div className={`mt-4 p-3 rounded-lg border ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'}`}>
                                <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-2 text-xs opacity-60">
                                        <MapPin size={12} />
                                        <span>地理坐标 <span className="text-red-400">*必填</span></span>
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

                        {/* Save button only available if uploaded (or editing existing) */}
                        {(uploadedPhotoId || editingPhoto) && (
                            <button type="submit" disabled={loading} className={`w-full font-semibold py-3 rounded-xl hover:scale-[1.02] transition-transform disabled:opacity-50 shadow-lg mb-4 ${isDark ? 'bg-white text-black shadow-white/10' : 'bg-black text-white shadow-black/10'}`}>
                                {loading ? '保存中...' : '保存作品信息'}
                            </button>
                        )}
                    </div>
                )}
             </form>
          )}

          {mode === 'batch' && (
             <div className="space-y-6">
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
                            <SmartInput label="统一地点名称" value={batchLocationName} onChange={(val) => { setBatchLocationName(val); setBatchManualLoc(true); }} storageKey="location" theme={theme} />
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <SmartInput label="纬度" value={batchLat} onChange={setBatchLat} storageKey="gps_lat" placeholder="0.00" theme={theme} />
                                <SmartInput label="经度" value={batchLng} onChange={setBatchLng} storageKey="gps_lng" placeholder="0.00" theme={theme} />
                            </div>
                         </div>
                         <div ref={mode === 'batch' ? mapRef : null} className="w-full h-32 rounded-md overflow-hidden bg-gray-100 relative z-0" />
                    </div>
                </div>

                <div className={`w-full h-32 rounded-xl border-2 border-dashed flex flex-col items-center justify-center relative transition-colors ${isDark ? 'border-white/20 hover:border-white/40' : 'border-black/20 hover:border-black/40'}`}>
                    <div className={`flex flex-col items-center pointer-events-none ${isDark ? 'text-white/50' : 'text-black/50'}`}>
                        <Upload size={30} className="mb-2" />
                        <span className="text-sm">添加照片 (支持多选)</span>
                    </div>
                    <input type="file" multiple accept="image/jpeg,image/tiff,image/png" onChange={handleBatchFiles} className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>

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
                                <button onClick={() => removeBatchItem(item.id)} className="p-2 opacity-50 hover:opacity-100 text-red-400"><Trash2 size={16} /></button>
                            )}
                            {item.status === 'success' && <CheckCircle size={16} className="text-green-500 mr-2" />}
                            {item.status === 'uploading' && <Loader2 size={16} className="animate-spin text-blue-500 mr-2" />}
                            {item.status === 'error' && <AlertCircle size={16} className="text-red-500 mr-2" />}
                        </div>
                    ))}
                </div>

                <button onClick={handleBatchSubmit} disabled={loading || batchList.length === 0 || batchList.every(i => i.status === 'success')} className={`w-full font-semibold py-3 rounded-xl hover:scale-[1.02] transition-transform disabled:opacity-50 shadow-lg mb-4 ${isDark ? 'bg-white text-black shadow-white/10' : 'bg-black text-white shadow-black/10'}`}>
                  {loading ? '正在批量上传...' : `开始上传 (${batchList.filter(i => i.status === 'pending').length} 张)`}
                </button>
             </div>
          )}
        </div>
        <ResultOverlay />
      </GlassCard>
    </div>
  );
};
