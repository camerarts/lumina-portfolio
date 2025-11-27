
import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Tag, Loader2, Pencil, Check, GripVertical, Image as ImageIcon, CheckCircle } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { Theme, Photo } from '../types';
import { client } from '../api/client';

interface SystemSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  onUpdateCategories: (newCats: string[]) => void;
  theme: Theme;
  token: string;
}

type Tab = 'categories' | 'batch_edit';

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

  // === BATCH EDIT STATE ===
  const [recentPhotos, setRecentPhotos] = useState<Photo[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  
  // Batch fields
  const [batchCamera, setBatchCamera] = useState('');
  const [batchLens, setBatchLens] = useState('');
  const [batchLocation, setBatchLocation] = useState('');
  const [batchDate, setBatchDate] = useState('');
  const [batchLat, setBatchLat] = useState('');
  const [batchLng, setBatchLng] = useState('');

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
    // Important for Firefox
    e.dataTransfer.setData("text/plain", String(index));
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = "move";
  };

  const onDrop = async (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === index) return;

    const newCategories = [...categories];
    const [movedItem] = newCategories.splice(draggedItemIndex, 1);
    newCategories.splice(index, 0, movedItem);

    onUpdateCategories(newCategories); // Optimistic UI update
    setDraggedItemIndex(null);

    // Persist order
    setLoading(true);
    await client.saveCategories(newCategories, token);
    setLoading(false);
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
         // Update local list to reflect changes
         const updatedList = recentPhotos.map(p => {
             if (selectedPhotos.has(p.id)) {
                 return {
                     ...p,
                     exif: {
                         ...p.exif,
                         ...updates
                     }
                 };
             }
             return p;
         });
         setRecentPhotos(updatedList);
         // Clear fields
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
                    onClick={() => setActiveTab('batch_edit')}
                    className={`text-sm pb-1 border-b-2 transition-colors ${activeTab === 'batch_edit' ? (isDark ? 'border-white text-white' : 'border-black text-black') : 'border-transparent opacity-50'}`}
                  >
                      批量修改元数据
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

            {/* === BATCH EDIT TAB === */}
            {activeTab === 'batch_edit' && (
                <div className="h-full flex flex-col md:flex-row gap-6">
                    {/* Left: Selection Grid */}
                    <div className="flex-1 flex flex-col min-h-0">
                         <div className="flex justify-between items-center mb-2">
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
                             <div className="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-3 md:grid-cols-4 gap-2 pr-2 pb-20">
                                 {recentPhotos.map(photo => (
                                     <div 
                                       key={photo.id}
                                       onClick={() => togglePhotoSelection(photo.id)}
                                       className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${selectedPhotos.has(photo.id) ? 'border-blue-500 opacity-100' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                     >
                                         <img src={photo.url} alt="" className="w-full h-full object-cover" />
                                         {selectedPhotos.has(photo.id) && (
                                             <div className="absolute top-1 right-1 bg-blue-500 rounded-full p-0.5">
                                                 <Check size={10} className="text-white" />
                                             </div>
                                         )}
                                     </div>
                                 ))}
                             </div>
                         )}
                    </div>

                    {/* Right: Input Fields */}
                    <div className={`w-full md:w-80 flex-shrink-0 p-4 rounded-xl border flex flex-col ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'}`}>
                         <h3 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${textPrimary}`}>
                             <Tag size={14} /> 批量修改 ({selectedPhotos.size} 张)
                         </h3>

                         <div className="space-y-3 flex-1 overflow-y-auto">
                            <div>
                                <label className={`block text-xs mb-1 ${textSecondary}`}>相机型号</label>
                                <input type="text" value={batchCamera} onChange={e=>setBatchCamera(e.target.value)} className={`w-full text-xs p-2 rounded border bg-transparent ${isDark ? 'border-white/20 text-white' : 'border-black/20 text-black'}`} placeholder="保持原样" />
                            </div>
                            <div>
                                <label className={`block text-xs mb-1 ${textSecondary}`}>镜头</label>
                                <input type="text" value={batchLens} onChange={e=>setBatchLens(e.target.value)} className={`w-full text-xs p-2 rounded border bg-transparent ${isDark ? 'border-white/20 text-white' : 'border-black/20 text-black'}`} placeholder="保持原样" />
                            </div>
                            <div>
                                <label className={`block text-xs mb-1 ${textSecondary}`}>地点名称</label>
                                <input type="text" value={batchLocation} onChange={e=>setBatchLocation(e.target.value)} className={`w-full text-xs p-2 rounded border bg-transparent ${isDark ? 'border-white/20 text-white' : 'border-black/20 text-black'}`} placeholder="保持原样" />
                            </div>
                             <div>
                                <label className={`block text-xs mb-1 ${textSecondary}`}>日期</label>
                                <input type="date" value={batchDate} onChange={e=>setBatchDate(e.target.value)} className={`w-full text-xs p-2 rounded border bg-transparent ${isDark ? 'border-white/20 text-white' : 'border-black/20 text-black'}`} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className={`block text-xs mb-1 ${textSecondary}`}>纬度</label>
                                    <input type="number" step="any" value={batchLat} onChange={e=>setBatchLat(e.target.value)} className={`w-full text-xs p-2 rounded border bg-transparent ${isDark ? 'border-white/20 text-white' : 'border-black/20 text-black'}`} placeholder="0.00" />
                                </div>
                                <div>
                                    <label className={`block text-xs mb-1 ${textSecondary}`}>经度</label>
                                    <input type="number" step="any" value={batchLng} onChange={e=>setBatchLng(e.target.value)} className={`w-full text-xs p-2 rounded border bg-transparent ${isDark ? 'border-white/20 text-white' : 'border-black/20 text-black'}`} placeholder="0.00" />
                                </div>
                            </div>
                         </div>

                         <button 
                             onClick={handleBatchUpdate}
                             disabled={loading || selectedPhotos.size === 0}
                             className={`w-full mt-4 py-2.5 rounded-lg font-medium text-sm transition-transform active:scale-95 ${isDark ? 'bg-white text-black disabled:bg-white/20' : 'bg-black text-white disabled:bg-black/20'}`}
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
