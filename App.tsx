
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Menu, Plus, LogOut, Filter, Settings, Moon, Sun, Trash2, Pencil, Check, SlidersHorizontal, Globe, Cog, ChevronDown, AlignLeft, Map } from 'lucide-react';
import { GlassCard } from './components/GlassCard';
import { PhotoModal } from './components/PhotoModal';
import { UploadModal } from './components/UploadModal';
import { LoginModal } from './components/LoginModal';
import { SystemSettingsModal } from './components/SystemSettingsModal';
import { MapView } from './components/MapView';
import { ProgressBar } from './components/ProgressBar';
import { Category, Photo, Theme, DEFAULT_CATEGORIES } from './types';
import { client } from './api/client';

// Helper: Calculate distance
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function deg2rad(deg: number) { return deg * (Math.PI / 180); }

const PAGE_SIZE = 9;
const FEED_TABS = ['精选', '最新', '随览', '附近', '远方'];

const App: React.FC = () => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [customCategories, setCustomCategories] = useState<string[]>(DEFAULT_CATEGORIES);

  useEffect(() => {
    const fetchInitData = async () => {
      try {
        setGlobalLoading(true);
        const [photosData, catsData] = await Promise.all([
            client.getPhotos(1, 100),
            client.getCategories()
        ]);
        setPhotos(photosData);
        if (catsData && catsData.length > 0) setCustomCategories(catsData);
      } catch (error) {
        console.error("Failed to fetch initial data:", error);
      } finally {
        setGlobalLoading(false);
      }
    };
    fetchInitData();
  }, []);

  const [activeCategory, setActiveCategory] = useState<string>(Category.ALL);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('最新');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState<string>('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isManageMode, setIsManageMode] = useState(false);
  const [photoToEdit, setPhotoToEdit] = useState<Photo | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('right');
  const [theme, setTheme] = useState<Theme>('light');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [shuffleTrigger, setShuffleTrigger] = useState(0);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    const savedToken = localStorage.getItem('lumina_token');
    if (savedToken) { setAdminToken(savedToken); setIsAdmin(true); }
  }, []);
  
  useEffect(() => {
    const closeDropdown = () => setIsCategoryOpen(false);
    if(isCategoryOpen) window.addEventListener('click', closeDropdown);
    return () => window.removeEventListener('click', closeDropdown);
  }, [isCategoryOpen]);

  const handleLoginSuccess = (token: string) => { setAdminToken(token); setIsAdmin(true); localStorage.setItem('lumina_token', token); };
  const handleLogout = () => { setIsAdmin(false); setIsManageMode(false); setAdminToken(''); localStorage.removeItem('lumina_token'); };

  // === Minimal Flat Background ===
  const Background = () => (
    <div className={`fixed inset-0 overflow-hidden pointer-events-none -z-10 transition-colors duration-1000 ${isDark ? 'bg-[#0a0a0a]' : 'bg-[#fafafa]'}`}>
    </div>
  );

  const handleTabClick = (tab: string) => {
    if (viewMode === 'map') setViewMode('grid');
    setGlobalLoading(true);
    setTimeout(() => setGlobalLoading(false), 500);
    if (tab === '随览') setShuffleTrigger(prev => prev + 1);
    if ((tab === '附近' || tab === '远方') && !userLocation) {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err) => alert("无法获取位置信息"), { timeout: 5000 }
        );
      }
    }
    setActiveTab(tab);
  };

  const filteredPhotos = useMemo(() => {
    let result = photos.filter(p => {
      if (activeCategory === Category.ALL) return true;
      if (activeCategory === Category.HORIZONTAL) return (p.width || 0) >= (p.height || 0);
      if (activeCategory === Category.VERTICAL) return (p.height || 0) > (p.width || 0);
      return p.category === activeCategory;
    });

    switch (activeTab) {
      case '精选': result = result.filter(p => (p.rating || 0) >= 4).sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
      case '随览': const t = shuffleTrigger; result = [...result].sort(() => Math.random() - 0.5); break;
      case '附近':
      case '远方':
        if (userLocation) {
          result = result.sort((a, b) => {
            const distA = (a.exif?.latitude && a.exif?.longitude) ? getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, a.exif.latitude, a.exif.longitude) : 99999;
            const distB = (b.exif?.latitude && b.exif?.longitude) ? getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, b.exif.latitude, b.exif.longitude) : 99999;
            return activeTab === '附近' ? distA - distB : distB - distA;
          });
        }
        break;
      default: break; 
    }
    return result;
  }, [photos, activeCategory, activeTab, shuffleTrigger, userLocation]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); window.scrollTo(0,0); }, [activeCategory, activeTab, shuffleTrigger, viewMode]);

  useEffect(() => {
    if (viewMode === 'map') return;
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filteredPhotos.length));
    }, { threshold: 0.1 });
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [filteredPhotos.length, viewMode]); 

  const visiblePhotos = filteredPhotos.slice(0, visibleCount);

  const handleUpdatePhoto = (newPhoto: Photo) => {
    setPhotos(prev => {
        const index = prev.findIndex(p => p.id === newPhoto.id);
        if (index >= 0) { const u = [...prev]; u[index] = newPhoto; return u; }
        return [newPhoto, ...prev];
    });
    if (!photoToEdit) { setActiveCategory(Category.ALL); setActiveTab('最新'); setViewMode('grid'); window.scrollTo(0,0); }
  };

  const handleDeletePhoto = async (e: React.MouseEvent, photoId: string) => {
    e.stopPropagation(); e.preventDefault();
    if (window.confirm('确定删除?')) {
        await client.deletePhoto(photoId, adminToken);
        setPhotos(prev => prev.filter(p => p.id !== photoId));
    }
  };

  const handlePhotoClick = (photo: Photo) => { if (!isManageMode) setSelectedPhoto(photo); };
  const handleNext = () => {
    if (!selectedPhoto) return;
    setSlideDirection('right');
    const idx = filteredPhotos.findIndex(p => p.id === selectedPhoto.id);
    if (idx < filteredPhotos.length - 1) setSelectedPhoto(filteredPhotos[idx + 1]);
  };
  const handlePrev = () => {
    if (!selectedPhoto) return;
    setSlideDirection('left');
    const idx = filteredPhotos.findIndex(p => p.id === selectedPhoto.id);
    if (idx > 0) setSelectedPhoto(filteredPhotos[idx - 1]);
  };

  const displayCategories = [Category.ALL, ...customCategories, Category.HORIZONTAL, Category.VERTICAL];
  const textPrimary = isDark ? "text-white" : "text-black";
  const textSecondary = isDark ? "text-white/50" : "text-black/50";

  return (
    <div className={`min-h-screen font-sans selection:bg-gray-500/30 ${textPrimary}`}>
      <Background />
      <ProgressBar isLoading={globalLoading} theme={theme} />

      {/* === New High-End Two-Row Header === */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 backdrop-blur-md border-b ${isDark ? 'bg-black/80 border-white/5' : 'bg-white/90 border-black/5'}`}>
          <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-4">
              
              {/* Row 1: Logo Area */}
              <div 
                  onClick={() => { setActiveTab('最新'); setActiveCategory(Category.ALL); setViewMode('grid'); window.scrollTo({top:0, behavior:'smooth'}); }}
                  className="font-serif text-3xl md:text-4xl tracking-[0.2em] cursor-pointer select-none font-light mb-4"
              >
                  LUMINA
              </div>

              {/* Row 2: Navigation & Controls */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  
                  {/* Left: Feed Tabs & Map Toggle */}
                  <div className="flex items-center gap-6 overflow-x-auto w-full md:w-auto no-scrollbar">
                      {FEED_TABS.map(tab => (
                        <button
                            key={tab}
                            onClick={() => handleTabClick(tab)}
                            className={`text-xs md:text-sm uppercase tracking-widest py-1 whitespace-nowrap transition-all relative group
                                ${activeTab === tab ? 'opacity-100 font-medium' : 'opacity-40 hover:opacity-80'}
                            `}
                        >
                            {tab}
                            <span className={`absolute bottom-0 left-0 h-[1px] bg-current transition-all duration-300
                                ${activeTab === tab ? 'w-full' : 'w-0 group-hover:w-1/2'}
                            `}/>
                        </button>
                      ))}

                      {/* Prominent Map Toggle */}
                      <div className={`h-6 w-[1px] ${isDark ? 'bg-white/10' : 'bg-black/10'}`}></div>
                      
                      <button 
                        onClick={() => setViewMode(v => v === 'grid' ? 'map' : 'grid')} 
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-full transition-all duration-300 shadow-sm
                            ${viewMode === 'map' 
                                ? (isDark ? 'bg-white text-black font-medium' : 'bg-black text-white font-medium') 
                                : (isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/5 hover:bg-black/10 text-black')}
                        `}
                      >
                         {viewMode === 'map' ? <AlignLeft size={14} /> : <Map size={14} />}
                         <span className="text-xs tracking-wider">{viewMode === 'map' ? '列表' : '地图'}</span>
                      </button>
                  </div>

                  {/* Right: Categories & Tools */}
                  <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                       {/* Category Dropdown */}
                       <div className="relative z-50">
                            <button onClick={(e) => { e.stopPropagation(); setIsCategoryOpen(!isCategoryOpen); }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${isDark ? 'border-white/10 hover:border-white/30' : 'border-black/10 hover:border-black/30'}`}>
                                {activeCategory === Category.ALL ? '分类' : activeCategory}
                                <ChevronDown size={10} className={`transition-transform duration-300 ${isCategoryOpen ? 'rotate-180' : ''}`} />
                            </button>
                            <div className={`absolute top-full right-0 mt-2 w-40 max-h-64 overflow-y-auto custom-scrollbar rounded-lg shadow-2xl border p-1 transition-all origin-top-right ${isCategoryOpen ? 'opacity-100 scale-100 visible' : 'opacity-0 scale-95 invisible'} ${isDark ? 'bg-black/90 border-white/10' : 'bg-white/95 border-black/5'}`}>
                                {displayCategories.map(cat => (
                                    <button key={cat} onClick={() => setActiveCategory(cat)} className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors ${activeCategory === cat ? (isDark ? 'bg-white/20 text-white' : 'bg-black/10 text-black') : 'opacity-60 hover:opacity-100 hover:bg-white/5'}`}>
                                        {cat}
                                    </button>
                                ))}
                            </div>
                       </div>

                       {/* Theme Toggle */}
                       <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className="w-8 h-8 flex items-center justify-center rounded-md opacity-50 hover:opacity-100 hover:bg-white/5 transition-colors">
                           {isDark ? <Moon size={16} strokeWidth={1.5} /> : <Sun size={16} strokeWidth={1.5} />}
                       </button>

                       {/* Admin Actions */}
                       {isAdmin ? (
                            <div className={`flex items-center gap-2 border-l pl-3 ml-1 ${isDark ? 'border-white/10' : 'border-black/10'}`}>
                                <button onClick={() => setIsManageMode(!isManageMode)} className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${isManageMode ? 'bg-blue-500 text-white' : 'opacity-50 hover:opacity-100 hover:bg-white/5'}`} title="管理"><Pencil size={16} strokeWidth={1.5} /></button>
                                <button onClick={() => {setPhotoToEdit(null); setIsUploadOpen(true);}} className="w-8 h-8 flex items-center justify-center rounded-md opacity-50 hover:opacity-100 hover:bg-white/5 transition-colors" title="上传"><Plus size={18} strokeWidth={1.5} /></button>
                                <button onClick={() => setIsSettingsOpen(true)} className="w-8 h-8 flex items-center justify-center rounded-md opacity-50 hover:opacity-100 hover:bg-white/5 transition-colors" title="设置"><Cog size={16} strokeWidth={1.5} /></button>
                                <button onClick={handleLogout} className="w-8 h-8 flex items-center justify-center rounded-md opacity-50 hover:opacity-100 hover:bg-white/5 transition-colors" title="退出"><LogOut size={16} strokeWidth={1.5} /></button>
                            </div>
                       ) : (
                            <div className={`border-l pl-3 ml-1 ${isDark ? 'border-white/10' : 'border-black/10'}`}>
                               <button onClick={() => setIsLoginOpen(true)} className="w-8 h-8 flex items-center justify-center rounded-md opacity-50 hover:opacity-100 hover:bg-white/5 transition-colors"><Settings size={16} strokeWidth={1.5} /></button>
                            </div>
                       )}
                  </div>
              </div>
          </div>
      </header>

      {/* Main Content Area */}
      <main className={`pt-36 md:pt-40 pb-12 px-4 md:px-8 max-w-[1600px] mx-auto min-h-screen`}>
        {viewMode === 'map' ? (
           <div className={`w-full h-[75vh] rounded-2xl overflow-hidden border shadow-lg ${isDark ? 'border-white/10' : 'border-black/5'}`}>
             <MapView photos={filteredPhotos} theme={theme} onPhotoClick={handlePhotoClick} onMapLoadStatus={(isLoading) => setGlobalLoading(isLoading)} />
           </div>
        ) : (
          <>
            <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6">
              {visiblePhotos.map((photo) => (
                <div key={photo.id} className="break-inside-avoid animate-fade-in group relative mb-6">
                    {/* Flat Card Design */}
                    <div 
                        onClick={() => handlePhotoClick(photo)}
                        className={`
                            relative overflow-hidden cursor-zoom-in transition-all duration-500
                            ${isManageMode ? '' : 'hover:shadow-2xl hover:-translate-y-1'}
                        `}
                    >
                        <img 
                            src={photo.url} 
                            alt={photo.title} 
                            className="w-full h-auto object-cover block"
                            loading="lazy"
                        />
                        
                        {/* Overlay */}
                        {!isManageMode && (
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
                                <p className="text-white font-serif text-lg tracking-wide transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">{photo.title}</p>
                                <p className="text-white/70 text-xs uppercase tracking-wider mt-1 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 delay-75">{photo.category}</p>
                            </div>
                        )}
                        
                        {/* Manage Overlay */}
                        {isManageMode && (
                           <div className="absolute inset-0 bg-black/10 flex items-start justify-between p-3">
                               <button onClick={(e) => { e.stopPropagation(); setPhotoToEdit(photo); setIsUploadOpen(true); }} className="bg-white text-black p-2 rounded-full hover:scale-110 transition-transform shadow-lg"><Pencil size={14} /></button>
                               <button onClick={(e) => handleDeletePhoto(e, photo.id)} className="bg-red-500 text-white p-2 rounded-full hover:scale-110 transition-transform shadow-lg"><Trash2 size={14} /></button>
                           </div>
                        )}
                    </div>
                </div>
              ))}
            </div>
            
            <div ref={loadMoreRef} className="h-20 w-full opacity-0 pointer-events-none" />
            
            {filteredPhotos.length === 0 && (
              <div className={`text-center py-32 flex flex-col items-center justify-center opacity-40`}>
                  <AlignLeft size={48} strokeWidth={0.5} className="mb-4" />
                  <p className="font-serif text-xl">暂无相关作品</p>
              </div>
            )}
          </>
        )}
      </main>

      <PhotoModal 
        photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} 
        onNext={handleNext} onPrev={handlePrev} hasNext={filteredPhotos.findIndex(p => p.id === selectedPhoto?.id) < filteredPhotos.length - 1} hasPrev={filteredPhotos.findIndex(p => p.id === selectedPhoto?.id) > 0} 
        theme={theme} slideDirection={slideDirection} isAdmin={isAdmin} onUpdatePhoto={handleUpdatePhoto}
      />
      
      <UploadModal isOpen={isUploadOpen} onClose={() => { setIsUploadOpen(false); setPhotoToEdit(null); }} onUpload={handleUpdatePhoto} theme={theme} editingPhoto={photoToEdit} token={adminToken} categories={customCategories} />
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onLoginSuccess={handleLoginSuccess} theme={theme} />
      <SystemSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} categories={customCategories} onUpdateCategories={setCustomCategories} theme={theme} token={adminToken} />
    </div>
  );
};

export default App;
