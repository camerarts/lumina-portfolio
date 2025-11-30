
import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Tag, Loader2, Pencil, Check, GripVertical, Image as ImageIcon, CheckCircle, MapPin, Camera, Aperture } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { Theme, Photo, Presets } from '../types';
import { client } from '../api/client';

interface SystemSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  onUpdateCategories: (newCats: string[]) => void;
  theme: Theme;
  token: string;
}

type Tab = 'categories' | 'batch_edit' | 'menu_presets';

// Reused Helper from UploadModal for Reverse Geocoding
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

export const SystemSettingsModal: React.FC<SystemSettingsModalProps> = ({ 
  isOpen, onClose, categories = [], onUpdateCategories, theme, token 
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('categories');
  const isDark = theme === 'dark';
  const textPrimary = isDark ? "text-white" : "text-black";
  const textSecondary = isDark ? "text-white/60" : "text-black/60";

  // === CATEGORY MANAGEMENT STATE ===
  const [newCat, setNewCat] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

  // === PRESETS MANAGEMENT STATE ===
  const [presets, setPresets] = useState<Presets>({ cameras: [], lenses: [] });
  const [newCamera, setNewCamera] = useState('');
  const [newLens, setNewLens] = useState('');
  const [loadingPresets, setLoadingPresets] = useState(false);

  // === BATCH EDIT STATE ===
  const [recentPhotos, setRecentPhotos] = useState<Photo[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  
  // Selection Box State
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState({ startX: 0, startY: 0, currentX: 0, currentY: 0 });
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Batch fields
  const [batchCamera, setBatchCamera] = useState('');
  const [batchLens, setBatchLens] = useState('');
  const [batchLocation, setBatchLocation] = useState('');
  const [batchDate, setBatchDate] = useState('');
  const [batchLat, setBatchLat] = useState('');
  const [batchLng, setBatchLng] = useState('');
  const [batchManualLoc, setBatchManualLoc] = useState(false);

  // Map Refs
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerInstance = useRef<any>(null);

  // Fetch data on open
  useEffect(() => {
    if (isOpen) {
       // Fetch Presets and set defaults for batch edit
       const fetchPresets = async () => {
           const p = await client.getPresets();
           if (p) {
               setPresets(p);
               // Default filling for Batch Edit tab fields
               setBatchCamera(prev => prev || (p.cameras && p.cameras[0]) || '');
               setBatchLens(prev => prev || (p.lenses && p.lenses[0]) || '');
           }
       };
       fetchPresets();
    }
  }, [isOpen]);

  // Fetch photos when switching to Batch Tab
  useEffect(() => {
    if (isOpen && activeTab === 'batch_edit' && recentPhotos.length === 0) {
      const fetchPhotos = async () => {
        setLoadingPhotos(true);
        const data = await client.getPhotos(1, 100); // Fetch last 100
        setRecentPhotos(data);
        setLoadingPhotos(false);
      };
      fetchPhotos();
    }
  }, [isOpen, activeTab]);

  // GPS Sync Effect: Update Map when inputs change
  useEffect(() => {
     if (!mapInstance.current || !markerInstance.current) return;
     const lat = parseFloat(batchLat);
     const lng = parseFloat(batchLng);
     if (!isNaN(lat) && !isNaN(lng)) {
         const cur = markerInstance.current.getLatLng();
         if (Math.abs(cur.lat - lat) > 0.0001 || Math.abs(cur.lng - lng) > 0.0001) {
             markerInstance.current.setLatLng([lat, lng]);
             mapInstance.current.setView([lat, lng], mapInstance.current.getZoom());
         }
     }
  }, [batchLat, batchLng]);

  // Map Initialization for Batch Edit
  useEffect(() => {
    if (!isOpen || activeTab !== 'batch_edit') return;

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      const L = (window as any).L;
      if (!L || !mapRef.current) return;

      if (mapInstance.current) {
          mapInstance.current.invalidateSize();
          return;
      }

      // Current Coords
      let center: [number, number] | null = null;
      const latNum = parseFloat(batchLat);
      const lngNum = parseFloat(batchLng);
      if (!isNaN(latNum) && !isNaN(lngNum)) {
         center = [latNum, lngNum];
      }

      const initMap = (startCenter: [number, number]) => {
         if (mapInstance.current) return;

         mapInstance.current = L.map(mapRef.current, {
             center: startCenter,
             zoom: 4,
             zoomControl: false,
             attributionControl: false
         });

         const layerStyle = theme === 'dark' ? 'dark_all' : 'light_all';
         L.tileLayer(`https://{s}.basemaps.cartocdn.com/${layerStyle}/{z}/{x}/{y}{r}.png`, { maxZoom: 20, subdomains: 'abcd' }).addTo(mapInstance.current);

         const dotIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background-color: ${theme === 'dark' ? '#ffffff' : '#000000'}; width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.5); border: 2px solid rgba(255,255,255,0.5);"></div>`,
            iconSize: [12, 12], iconAnchor: [6, 6]
         });

         markerInstance.current = L.marker(startCenter, { icon: dotIcon, draggable: true }).addTo(mapInstance.current);

         // Events
         const updateCoordsAndAddress = async (lat: number, lng: number) => {
             setBatchLat(lat.toFixed(6));
             setBatchLng(lng.toFixed(6));
             if (!batchManualLoc) {
                 const addr = await fetchAddressFromCoords(lat, lng);
                 if (addr) setBatchLocation(addr);
             }
         };

         markerInstance.current.on('dragend', function(event: any) {
            const pos = event.target.getLatLng();
            updateCoordsAndAddress(pos.lat, pos.lng);
         });

         mapInstance.current.on('click', function(e: any) {
            markerInstance.current.setLatLng(e.latlng);
            updateCoordsAndAddress(e.latlng.lat, e.latlng.lng);
         });
         
         setTimeout(() => mapInstance.current?.invalidateSize(), 100);
      };

      if (center) {
          initMap(center);
      } else if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
              (pos) => {
                  const userCenter: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                  initMap(userCenter);
                  if(!batchLat) {
                      setBatchLat(pos.coords.latitude.toFixed(6));
                      setBatchLng(pos.coords.longitude.toFixed(6));
                  }
              },
              (err) => initMap([35.6895, 139.6917]),
              { timeout: 5000 }
          );
      } else {
          initMap([35.6895, 139.6917]);
      }
      
      // Add resize observer for stability
      const resizeObserver = new ResizeObserver(() => {
        if (mapInstance.current) {
            mapInstance.current.invalidateSize();
        }
      });
      resizeObserver.observe(mapRef.current);
      
      return () => resizeObserver.disconnect();

    }, 200);

    return () => clearTimeout(timer);
  }, [isOpen, activeTab, theme]);

  // === CATEGORY LOGIC ===

  const handleAdd = async () => {
    if (!newCat.trim()) return;
    if (categories.includes(newCat.trim())) { alert("分类已存在"); return; }
    setLoading(true);
    const updated = [...categories, newCat.trim()];
    const success = await client.saveCategories(updated, token);
    if (success) { onUpdateCategories(updated); setNewCat(''); } else { alert("保存失败"); }
    setLoading(false);
  };

  const handleDelete = async (cat: string) => {
    if (!confirm(`确定要删除分类 "${cat}" 吗？`)) return;
    setLoading(true);
    const updated = categories.filter(c => c !== cat);
    const success = await client.saveCategories(updated, token);
    if (success) { onUpdateCategories(updated); } else { alert("删除失败"); }
    setLoading(false);
  };

  const startEdit = (cat: string) => { setEditingCat(cat); setEditValue(cat); };
  const cancelEdit = () => { setEditingCat(null); setEditValue(''); };

  const saveEdit = async () => {
      if (!editingCat || !editValue.trim()) return;
      if (editValue.trim() === editingCat) { cancelEdit(); return; }
      if (categories.includes(editValue.trim())) { alert("分类名已存在"); return; }
      setLoading(true);
      const updated = categories.map(c => c === editingCat ? editValue.trim() : c);
      const success = await client.saveCategories(updated, token);
      if (success) { onUpdateCategories(updated); cancelEdit(); } else { alert("更新失败"); }
      setLoading(false);
  };

  // Drag and Drop Handlers
  const onDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDrop = async (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === index) return;

    const newCategories = [...categories];
    const [movedItem] = newCategories.splice(draggedItemIndex, 1);
    newCategories.splice(index, 0, movedItem);

    onUpdateCategories(newCategories);
    setDraggedItemIndex(null);

    setLoading(true);
    await client.saveCategories(newCategories, token);
    setLoading(false);
  };

  // === PRESETS LOGIC ===

  const handleAddPreset = async (type: 'cameras' | 'lenses', value: string) => {
    if (!value.trim()) return;
    if (presets[type].includes(value.trim())) { alert("已存在"); return; }
    
    setLoadingPresets(true);
    const updated = { ...presets, [type]: [...presets[type], value.trim()] };
    const success = await client.savePresets(updated, token);
    if (success) { 
        setPresets(updated); 
        if(type==='cameras') setNewCamera(''); else setNewLens(''); 
    } else { 
        alert("保存失败"); 
    }
    setLoadingPresets(false);
  };

  const handleDeletePreset = async (type: 'cameras' | 'lenses', value: string) => {
    if (!confirm(`确定删除 "${value}" 吗?`)) return;
    setLoadingPresets(true);
    const updated = { ...presets, [type]: presets[type].filter(item => item !== value) };
    const success = await client.savePresets(updated, token);
    if (success) { setPresets(updated); } else { alert("删除失败"); }
    setLoadingPresets(false);
  };

  // === BATCH EDIT LOGIC ===

  const togglePhotoSelection = (id: string) => {
    const newSet = new Set(selectedPhotos);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedPhotos(newSet);
  };

  const selectAll = () => {
     if (selectedPhotos.size === recentPhotos.length) setSelectedPhotos(new Set());
     else setSelectedPhotos(new Set(recentPhotos.map(p => p.id)));
  };

  // --- Box Selection Logic ---
  
  const handleGridMouseDown = (e: React.MouseEvent) => {
    // Only start if clicking background (grid container or scroll container)
    // Closest check prevents starting selection when clicking directly on a photo or its button
    if ((e.target as HTMLElement).closest('[data-photo-item]')) return;
    if (!scrollContainerRef.current) return;
    
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const scrollTop = scrollContainerRef.current.scrollTop;
    
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top + scrollTop;
    
    setIsSelecting(true);
    setSelectionRect({ startX, startY, currentX: startX, currentY: startY });
  };

  useEffect(() => {
    if (!isSelecting) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!scrollContainerRef.current) return;
      const rect = scrollContainerRef.current.getBoundingClientRect();
      const scrollTop = scrollContainerRef.current.scrollTop;
      
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top + scrollTop;
      
      setSelectionRect(prev => ({ ...prev, currentX, currentY }));
    };

    const handleMouseUp = () => {
      if (!scrollContainerRef.current) return;
      
      // Calculate intersection
      const left = Math.min(selectionRect.startX, selectionRect.currentX);
      const top = Math.min(selectionRect.startY, selectionRect.currentY);
      const width = Math.abs(selectionRect.currentX - selectionRect.startX);
      const height = Math.abs(selectionRect.currentY - selectionRect.startY);

      // Only select if box is large enough to be intentional
      if (width > 5 || height > 5) {
          const newSet = new Set(selectedPhotos);
          
          const items = scrollContainerRef.current.querySelectorAll('[data-photo-item]');
          items.forEach((item) => {
             const el = item as HTMLElement;
             // Calculate element position relative to scroll container content
             const itemLeft = el.offsetLeft;
             const itemTop = el.offsetTop;
             const itemW = el.offsetWidth;
             const itemH = el.offsetHeight;
             
             // Check intersection
             if (left < itemLeft + itemW && left + width > itemLeft &&
                 top < itemTop + itemH && top + height > itemTop) {
                 const id = el.getAttribute('data-photo-id');
                 if(id) newSet.add(id);
             }
          });
          setSelectedPhotos(newSet);
      }
      
      setIsSelecting(false);
      setSelectionRect({ startX: 0, startY: 0, currentX: 0, currentY: 0 });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isSelecting, selectionRect, selectedPhotos]);

  const handleBatchUpdate = async () => {
     if (selectedPhotos.size === 0) return;
     
     const updates: any = {};
     if (batchCamera.trim()) updates.camera = batchCamera;
     if (batchLens.trim()) updates.lens = batchLens;
     if (batchLocation.trim()) updates.location = batchLocation;
     if (batchDate) updates.date = batchDate;
     
     if (batchLat && batchLng) {
         const lat = parseFloat(batchLat);
         const lng = parseFloat(batchLng);
         if (!isNaN(lat) && !isNaN(lng)) {
             updates.latitude = lat;
             updates.longitude = lng;
         }
     }

     if (Object.keys(updates).length === 0) {
         alert("请至少输入一项要修改的属性");
         return;
     }

     setLoading(true);
     const success = await client.batchUpdatePhotos(Array.from(selectedPhotos), updates, token);
     if (success) {
         alert("批量更新成功！");
         const updatedList = recentPhotos.map(p => {
             if (selectedPhotos.has(p.id)) {
                 return { ...p, exif: { ...p.exif, ...updates } };
             }
             return p;
         });
         setRecentPhotos(updatedList);
         setSelectedPhotos(new Set());
     } else {
         alert("更新失败，请重试");
     }
     setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in ${isDark ? 'bg-black/60 backdrop-blur-sm' : 'bg-white/60 backdrop-blur-md'}`}>
      <GlassCard className="w-full max-w-4xl flex flex-col h-[85vh]" hoverEffect={false} theme={theme}>
        
        {/* Header */}
        <div className="flex-shrink-0 p-6 pb-2 flex justify-between items-center border-b border-transparent">
            <div>
              <h2 className={`text-xl font-serif ${textPrimary}`}>系统设置</h2>
              <div className="flex gap-4 mt-4">
                  <button 
                    onClick={() => setActiveTab('categories')}
                    className={`text-sm pb-1 border-b-2 transition-colors ${activeTab === 'categories' ? (isDark ? 'border-white text-white' : 'border-black text-black') : 'border-transparent opacity-50'}`}
                  >
                      分类排序
                  </button>
                  <button 
                    onClick={() => setActiveTab('menu_presets')}
                    className={`text-sm pb-1 border-b-2 transition-colors ${activeTab === 'menu_presets' ? (isDark ? 'border-white text-white' : 'border-black text-black') : 'border-transparent opacity-50'}`}
                  >
                      菜单预设置
                  </button>
                  <button 
                    onClick={() => setActiveTab('batch_edit')}
                    className={`text-sm pb-1 border-b-2 transition-colors ${activeTab === 'batch_edit' ? (isDark ? 'border-white text-white' : 'border-black text-black') : 'border-transparent opacity-50'}`}
                  >
                      批量修改
                  </button>
              </div>
            </div>
            <button onClick={onClose} className={`${textSecondary} hover:${textPrimary} transition-colors self-start`}>
              <X size={20} />
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-6 custom-scrollbar">
            
            {/* === CATEGORIES TAB === */}
            {activeTab === 'categories' && (
                <div className="max-w-md mx-auto h-full flex flex-col">
                    <div className="flex gap-2 mb-4">
                        <input 
                        type="text" 
                        value={newCat}
                        onChange={(e) => setNewCat(e.target.value)}
                        placeholder="新建分类名称"
                        className={`flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none border ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-black/5 border-black/10 text-black'}`}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        />
                        <button 
                        onClick={handleAdd}
                        disabled={loading || !newCat.trim()}
                        className={`px-3 py-2 rounded-lg flex items-center justify-center transition-colors ${isDark ? 'bg-white text-black disabled:bg-white/20' : 'bg-black text-white disabled:bg-black/20'}`}
                        >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        </button>
                    </div>

                    <div className="space-y-2 overflow-y-auto flex-1 pb-4">
                        {categories.map((cat, index) => (
                            <div 
                                key={cat} 
                                draggable
                                onDragStart={(e) => onDragStart(e, index)}
                                onDragOver={onDragOver}
                                onDrop={(e) => onDrop(e, index)}
                                className={`flex justify-between items-center p-3 rounded-lg border cursor-move transition-transform ${isDark ? 'bg-white/5 border-white/5 hover:bg-white/10' : 'bg-black/5 border-black/5 hover:bg-black/10'} ${draggedItemIndex === index ? 'opacity-50' : 'opacity-100'}`}
                            >
                                <div className="flex items-center gap-3 flex-1">
                                    <GripVertical size={16} className="opacity-30 cursor-grab" />
                                    {editingCat === cat ? (
                                        <div className="flex items-center gap-2 flex-1">
                                            <input 
                                                type="text" 
                                                value={editValue} 
                                                onChange={(e) => setEditValue(e.target.value)}
                                                className={`flex-1 bg-transparent border-b text-sm focus:outline-none ${isDark ? 'border-white/50 text-white' : 'border-black/50 text-black'}`}
                                                autoFocus
                                            />
                                            <button onClick={saveEdit} disabled={loading} className="text-green-500 hover:text-green-400 p-1"><Check size={16} /></button>
                                            <button onClick={cancelEdit} disabled={loading} className="text-red-400 hover:text-red-500 p-1"><X size={16} /></button>
                                        </div>
                                    ) : (
                                        <span className={`text-sm ${textPrimary}`}>{cat}</span>
                                    )}
                                </div>
                                
                                {editingCat !== cat && (
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => startEdit(cat)} disabled={loading} className={`p-1 opacity-60 hover:opacity-100 transition-opacity ${isDark ? 'text-white' : 'text-black'}`}><Pencil size={14} /></button>
                                        <button onClick={() => handleDelete(cat)} disabled={loading} className="text-red-400 hover:text-red-500 p-1 opacity-60 hover:opacity-100 transition-opacity"><Trash2 size={14} /></button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* === MENU PRESETS TAB === */}
            {activeTab === 'menu_presets' && (
                <div className="h-full grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Cameras */}
                    <div className="flex flex-col h-full">
                        <div className="flex items-center gap-2 mb-3">
                            <Camera size={16} className={textPrimary} />
                            <h3 className={`font-semibold ${textPrimary}`}>相机预设</h3>
                        </div>
                        <div className="flex gap-2 mb-3">
                            <input 
                              value={newCamera} onChange={e => setNewCamera(e.target.value)} 
                              placeholder="添加相机型号"
                              className={`flex-1 rounded-lg px-3 py-2 text-xs border bg-transparent focus:outline-none ${isDark ? 'border-white/10 text-white' : 'border-black/10 text-black'}`}
                            />
                            <button onClick={() => handleAddPreset('cameras', newCamera)} disabled={loadingPresets} className={`px-3 rounded-lg ${isDark ? 'bg-white text-black' : 'bg-black text-white'}`}>
                                <Plus size={16} />
                            </button>
                        </div>
                        <div className={`flex-1 overflow-y-auto rounded-lg border p-2 space-y-1 ${isDark ? 'border-white/10 bg-white/5' : 'border-black/10 bg-black/5'}`}>
                            {presets.cameras.map(item => (
                                <div key={item} className={`flex justify-between items-center p-2 rounded hover:bg-white/10 group`}>
                                    <span className={`text-xs ${textPrimary}`}>{item}</span>
                                    <button onClick={() => handleDeletePreset('cameras', item)} className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Lenses */}
                    <div className="flex flex-col h-full">
                        <div className="flex items-center gap-2 mb-3">
                            <Aperture size={16} className={textPrimary} />
                            <h3 className={`font-semibold ${textPrimary}`}>镜头预设</h3>
                        </div>
                        <div className="flex gap-2 mb-3">
                            <input 
                              value={newLens} onChange={e => setNewLens(e.target.value)} 
                              placeholder="添加镜头型号"
                              className={`flex-1 rounded-lg px-3 py-2 text-xs border bg-transparent focus:outline-none ${isDark ? 'border-white/10 text-white' : 'border-black/10 text-black'}`}
                            />
                            <button onClick={() => handleAddPreset('lenses', newLens)} disabled={loadingPresets} className={`px-3 rounded-lg ${isDark ? 'bg-white text-black' : 'bg-black text-white'}`}>
                                <Plus size={16} />
                            </button>
                        </div>
                        <div className={`flex-1 overflow-y-auto rounded-lg border p-2 space-y-1 ${isDark ? 'border-white/10 bg-white/5' : 'border-black/10 bg-black/5'}`}>
                            {presets.lenses.map(item => (
                                <div key={item} className={`flex justify-between items-center p-2 rounded hover:bg-white/10 group`}>
                                    <span className={`text-xs ${textPrimary}`}>{item}</span>
                                    <button onClick={() => handleDeletePreset('lenses', item)} className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* === BATCH EDIT TAB === */}
            {activeTab === 'batch_edit' && (
                <div className="h-full flex flex-col md:flex-row gap-6 overflow-hidden">
                    {/* Left: Selection Grid */}
                    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-transparent">
                         <div className="flex justify-between items-center mb-2 flex-shrink-0">
                             <h3 className={`text-xs uppercase tracking-wider ${textSecondary}`}>最近上传 ({recentPhotos.length})</h3>
                             <button onClick={selectAll} className={`text-xs underline ${textSecondary}`}>
                                 {selectedPhotos.size === recentPhotos.length ? '取消全选' : '全选'}
                             </button>
                         </div>
                         
                         {loadingPhotos ? (
                             <div className="flex-1 flex items-center justify-center">
                                 <Loader2 className="animate-spin opacity-50" />
                             </div>
                         ) : (
                             <div 
                                ref={scrollContainerRef}
                                className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4 relative select-none"
                                onMouseDown={handleGridMouseDown}
                             >
                                 {/* Selection Box Visual */}
                                 {isSelecting && (
                                    <div 
                                      className="absolute z-50 border border-blue-500 bg-blue-500/20 pointer-events-none"
                                      style={{
                                          left: Math.min(selectionRect.startX, selectionRect.currentX),
                                          top: Math.min(selectionRect.startY, selectionRect.currentY),
                                          width: Math.abs(selectionRect.currentX - selectionRect.startX),
                                          height: Math.abs(selectionRect.currentY - selectionRect.startY),
                                      }}
                                    />
                                 )}

                                 <div className="grid grid-cols-3 md:grid-cols-4 gap-3 auto-rows-max w-full">
                                    {recentPhotos.map(photo => (
                                        <div 
                                        key={photo.id}
                                        data-photo-item
                                        data-photo-id={photo.id}
                                        onClick={() => togglePhotoSelection(photo.id)}
                                        className={`relative w-full aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${selectedPhotos.has(photo.id) ? 'border-blue-500 opacity-100' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                        >
                                            <img src={photo.urls?.small || photo.url} alt="" className="absolute inset-0 w-full h-full object-cover block" />
                                            {selectedPhotos.has(photo.id) && (
                                                <div className="absolute top-1 right-1 bg-blue-500 rounded-full p-0.5 shadow-sm z-10">
                                                    <Check size={10} className="text-white" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                 </div>
                             </div>
                         )}
                    </div>

                    {/* Right: Input Fields */}
                    <div className={`w-full md:w-80 flex-shrink-0 p-4 rounded-xl border flex flex-col overflow-y-auto custom-scrollbar ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'}`}>
                         <h3 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${textPrimary}`}>
                             <Tag size={14} /> 批量修改 ({selectedPhotos.size} 张)
                         </h3>

                         <div className="space-y-3 mb-4">
                            <div>
                                <label className={`block text-xs mb-1 ${textSecondary}`}>相机型号</label>
                                <input 
                                  list="camera-presets"
                                  type="text" value={batchCamera} onChange={e=>setBatchCamera(e.target.value)} 
                                  className={`w-full text-xs p-2 rounded border bg-transparent ${isDark ? 'border-white/20 text-white' : 'border-black/20 text-black'}`} placeholder="保持原样" 
                                />
                                <datalist id="camera-presets">
                                    {presets.cameras.map(c => <option key={c} value={c} />)}
                                </datalist>
                            </div>
                            <div>
                                <label className={`block text-xs mb-1 ${textSecondary}`}>镜头</label>
                                <input 
                                  list="lens-presets"
                                  type="text" value={batchLens} onChange={e=>setBatchLens(e.target.value)} 
                                  className={`w-full text-xs p-2 rounded border bg-transparent ${isDark ? 'border-white/20 text-white' : 'border-black/20 text-black'}`} placeholder="保持原样" 
                                />
                                <datalist id="lens-presets">
                                    {presets.lenses.map(c => <option key={c} value={c} />)}
                                </datalist>
                            </div>
                            <div>
                                <label className={`block text-xs mb-1 ${textSecondary}`}>地点名称</label>
                                <input 
                                    type="text" 
                                    value={batchLocation} 
                                    onChange={(e) => { setBatchLocation(e.target.value); setBatchManualLoc(true); }} 
                                    className={`w-full text-xs p-2 rounded border bg-transparent ${isDark ? 'border-white/20 text-white' : 'border-black/20 text-black'}`} 
                                    placeholder="自动获取或手动输入" 
                                />
                            </div>
                             <div>
                                <label className={`block text-xs mb-1 ${textSecondary}`}>日期</label>
                                <input type="date" value={batchDate} onChange={e=>setBatchDate(e.target.value)} className={`w-full text-xs p-2 rounded border bg-transparent ${isDark ? 'border-white/20 text-white' : 'border-black/20 text-black'}`} />
                            </div>
                            
                            {/* Map for Batch GPS */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className={`block text-xs ${textSecondary}`}>地理坐标</label>
                                    <MapPin size={12} className={textSecondary} />
                                </div>
                                <div ref={mapRef} className="w-full h-32 rounded bg-gray-500/10 overflow-hidden relative z-0" />
                                <div className="grid grid-cols-2 gap-2">
                                    <input type="number" step="any" value={batchLat} onChange={e=>setBatchLat(e.target.value)} className={`w-full text-xs p-2 rounded border bg-transparent ${isDark ? 'border-white/20 text-white' : 'border-black/20 text-black'}`} placeholder="纬度" />
                                    <input type="number" step="any" value={batchLng} onChange={e=>setBatchLng(e.target.value)} className={`w-full text-xs p-2 rounded border bg-transparent ${isDark ? 'border-white/20 text-white' : 'border-black/20 text-black'}`} placeholder="经度" />
                                </div>
                            </div>
                         </div>

                         <button 
                             onClick={handleBatchUpdate}
                             disabled={loading || selectedPhotos.size === 0}
                             className={`w-full py-2.5 rounded-lg font-medium text-sm transition-transform active:scale-95 ${isDark ? 'bg-white text-black disabled:bg-white/20' : 'bg-black text-white disabled:bg-black/20'}`}
                         >
                             {loading ? '处理中...' : '应用修改'}
                         </button>
                    </div>
                </div>
            )}

        </div>

      </GlassCard>
    </div>
  );
};
