
import React, { useState } from 'react';
import { X, Plus, Trash2, Tag, Loader2, Pencil, Check } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { Theme } from '../types';
import { client } from '../api/client';

interface SystemSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  onUpdateCategories: (newCats: string[]) => void;
  theme: Theme;
  token: string;
}

export const SystemSettingsModal: React.FC<SystemSettingsModalProps> = ({ 
  isOpen, onClose, categories = [], onUpdateCategories, theme, token 
}) => {
  const [newCat, setNewCat] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Edit State
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const isDark = theme === 'dark';
  const textPrimary = isDark ? "text-white" : "text-black";
  const textSecondary = isDark ? "text-white/60" : "text-black/60";

  const handleAdd = async () => {
    if (!newCat.trim()) return;
    if (categories.includes(newCat.trim())) {
      alert("分类已存在");
      return;
    }
    
    setLoading(true);
    const updated = [...categories, newCat.trim()];
    const success = await client.saveCategories(updated, token);
    if (success) {
      onUpdateCategories(updated);
      setNewCat('');
    } else {
      alert("保存失败");
    }
    setLoading(false);
  };

  const handleDelete = async (cat: string) => {
    if (!confirm(`确定要删除分类 "${cat}" 吗？`)) return;
    
    setLoading(true);
    const updated = categories.filter(c => c !== cat);
    const success = await client.saveCategories(updated, token);
    if (success) {
      onUpdateCategories(updated);
    } else {
      alert("删除失败");
    }
    setLoading(false);
  };

  const startEdit = (cat: string) => {
      setEditingCat(cat);
      setEditValue(cat);
  };

  const cancelEdit = () => {
      setEditingCat(null);
      setEditValue('');
  };

  const saveEdit = async () => {
      if (!editingCat || !editValue.trim()) return;
      if (editValue.trim() === editingCat) {
          cancelEdit();
          return;
      }
      if (categories.includes(editValue.trim())) {
          alert("分类名已存在");
          return;
      }

      setLoading(true);
      const updated = categories.map(c => c === editingCat ? editValue.trim() : c);
      const success = await client.saveCategories(updated, token);
      if (success) {
          onUpdateCategories(updated);
          cancelEdit();
      } else {
          alert("更新失败");
      }
      setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in ${isDark ? 'bg-black/60 backdrop-blur-sm' : 'bg-white/60 backdrop-blur-md'}`}>
      <GlassCard className="w-full max-w-md flex flex-col max-h-[80vh]" hoverEffect={false} theme={theme}>
        
        {/* Header */}
        <div className="flex-shrink-0 p-6 pb-4 flex justify-between items-center border-b border-transparent">
            <div>
              <h2 className={`text-xl font-serif ${textPrimary}`}>系统设置</h2>
              <p className={`text-xs ${textSecondary}`}>管理作品集基础配置</p>
            </div>
            <button onClick={onClose} className={`${textSecondary} hover:${textPrimary} transition-colors`}>
              <X size={20} />
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="mb-2 flex items-center gap-2">
                <Tag size={16} className={textPrimary} />
                <h3 className={`text-sm font-semibold ${textPrimary}`}>作品分类管理</h3>
            </div>
            
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

            <div className="space-y-2">
                {categories.map(cat => (
                    <div key={cat} className={`flex justify-between items-center p-3 rounded-lg border ${isDark ? 'bg-white/5 border-white/5' : 'bg-black/5 border-black/5'}`}>
                        {editingCat === cat ? (
                            <div className="flex items-center gap-2 flex-1">
                                <input 
                                    type="text" 
                                    value={editValue} 
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className={`flex-1 bg-transparent border-b text-sm focus:outline-none ${isDark ? 'border-white/50 text-white' : 'border-black/50 text-black'}`}
                                    autoFocus
                                />
                                <button onClick={saveEdit} disabled={loading} className="text-green-500 hover:text-green-400 p-1">
                                    <Check size={16} />
                                </button>
                                <button onClick={cancelEdit} disabled={loading} className="text-red-400 hover:text-red-500 p-1">
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <span className={`text-sm ${textPrimary}`}>{cat}</span>
                                <div className="flex items-center gap-1">
                                    <button 
                                        onClick={() => startEdit(cat)}
                                        disabled={loading}
                                        className={`p-1 opacity-60 hover:opacity-100 transition-opacity ${isDark ? 'text-white' : 'text-black'}`}
                                        title="编辑"
                                    >
                                        <Pencil size={14} />
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(cat)}
                                        disabled={loading}
                                        className="text-red-400 hover:text-red-500 p-1 opacity-60 hover:opacity-100 transition-opacity"
                                        title="删除"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>

      </GlassCard>
    </div>
  );
};
