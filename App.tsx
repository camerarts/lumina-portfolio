
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Menu, Plus, LogOut, Filter, Settings, Moon, Sun, Trash2, Pencil, Check, SlidersHorizontal, Globe, Cog, ChevronDown, AlignLeft, Map, Loader2 } from 'lucide-react';
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

// Helper Hook for Responsive Columns
function useColumns() {
  const [cols, setCols] = useState(1);
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      if (w >= 1280) setCols(4); // xl
      else if (w >= 1024) setCols(3); // lg
      else if (w >= 768) setCols(2); // md
      else setCols(1);
    };
    handleResize(); // Initial
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return cols;
}

const PAGE_SIZE = 24; // Load batch size
const FEED_TABS = ['全部', '精选', '最新', '随览', '附近', '远方'];

const App: React.FC = () => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  
  const [globalLoading, setGlobalLoading] = useState(false);
  const [customCategories, setCustomCategories] = useState<string[]>(DEFAULT_CATEGORIES);

  const [activeCategory, setActiveCategory] = useState<string>(Category.ALL);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('全部');
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
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [shuffleTrigger, setShuffleTrigger] = useState(0);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  
  const numCols = useColumns();
  const isDark = theme === 'dark';

  // Initial Data Fetch
  useEffect(() => {
    const fetchInitData = async () => {
      try {
        const catsData = await client.getCategories();
        if (catsData && catsData.length > 0) setCustomCategories(catsData);
      } catch (error) {
        console.error("Failed to fetch categories:", error);
      }
    };
    fetchInitData();
    
    // Check Admin Token
    const savedToken = localStorage.getItem('lumina_token');
    if (savedToken) { setAdminToken(savedToken); setIsAdmin(true); }
  }, []);

  // Fetch Photos Logic
  const fetchPhotos = useCallback(async (pageNum: number, isReset: boolean = false) => {
      if (isReset) {
          setGlobalLoading(true);
          setHasMore(true);
      } else {
          setLoadingMore(true);
      }

      try {
          const newPhotos = await client.getPhotos(pageNum, PAGE_SIZE);
          
          setPhotos(prev => {
              // Avoid duplicates if any
              const existingIds = new Set(isReset ? [] : prev.map(p => p.id));
              const uniqueNew = newPhotos.filter(p => !existingIds.has(p.id));
              return isReset ? newPhotos : [...prev, ...uniqueNew];
          });
          
          if (newPhotos.length < PAGE_SIZE) {
              setHasMore(false);
          }
      } catch (error) {
          console.error("Fetch failed", error);
      } finally {
          setGlobalLoading(false);
          setLoadingMore(false);
      }
  }, []);

  // Reset and fetch when ViewMode, Tab, or Category changes
  useEffect(() => {
      setPage(1);
      // If switching to Map or specific filters that rely on Client-side sorting (Nearby, Random), 
      // we might ideally want more data, but for performance we stick to pagination.
      fetchPhotos(1, true);
      window.scrollTo(0,0);
  }, [activeCategory, activeTab, shuffleTrigger, viewMode, fetchPhotos]);

  // Infinite Scroll Observer
  useEffect(() => {
    if (loadingMore || !hasMore || viewMode === 'map') return;
    
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            setPage(prev => {
                const nextPage = prev + 1;
                fetchPhotos(nextPage, false);
                return nextPage;
            });
        }
    }, { threshold: 0.1 });
    
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [loadingMore, hasMore, viewMode, fetchPhotos]);

  useEffect(() => {
    const closeDropdown = () => setIsCategoryOpen(false);
    if(isCategoryOpen) window.addEventListener('click', closeDropdown);
    return () => window.removeEventListener('click', closeDropdown);
  }, [isCategoryOpen]);

  const handleLoginSuccess = (token: string) => { setAdminToken(token); setIsAdmin(true); localStorage.setItem('lumina_token', token); };
  const handleLogout = () => { setIsAdmin(false); setIsManageMode(false); setAdminToken(''); localStorage.removeItem('lumina_token'); };

  // === Minimal Flat Background ===
  const Background = () => (
    <div className={`fixed inset-0 overflow-hidden pointer-events-none -z-10 transition-colors duration-1000 ${isDark ? 'bg-black' : 'bg-[#F9F9F9]'}`}>
    </div>
  );

  const handleTabClick = (tab: string) => {
    if (viewMode === 'map') setViewMode('grid');
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

  // Client-side filtering/sorting on the *fetched* data
  // Note: For true scalability, "Rating", "Random", "Location" sorts should happen on backend.
  // With current simple KV backend, we filter the accumulated paginated list.
  const filteredPhotos = useMemo(() => {
    let result = photos.filter(p => {
      if (activeCategory === Category.ALL) return true;
      if (activeCategory === Category.HORIZONTAL) return (p.width || 0) >= (p.height || 0);
      if (activeCategory === Category.VERTICAL) return (p.height || 0) > (p.width || 0);
      return p.category === activeCategory;
    });

    switch (activeTab) {
      case '精选': result = result.filter(p => (p.rating || 0) >= 4).sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
      case '随览': 
          // Simple client-side shuffle of loaded items
          const t = shuffleTrigger; 
          result = [...result].sort(() => Math.random() - 0.5); 
          break;
      case '附近':
      case '远方':
        if (userLocation) {
          result = result.sort((a, b) => {
            const latA = a.exif?.latitude; const lngA = a.exif?.longitude;
            const latB = b.exif?.latitude; const lngB = b.exif?.longitude;
            const distA = (latA && lngA) ? getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, latA, lngA) : 99999;
            const distB = (latB && lngB) ? getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, latB, lngB) : 99999;
            return activeTab === '附近' ? distA - distB : distB - distA;
          });
        }
        break;
      default: break; // '全部' and '最新'
    }
    return result;
  }, [photos, activeCategory, activeTab, shuffleTrigger, userLocation]);

  // Distribute photos into columns Left-to-Right (Row by Row visual order)
  const columns = useMemo(() => {
    const cols: Photo[][] = Array.from({ length: numCols }, () => []);
    filteredPhotos.forEach((photo, i) => {
      cols[i % numCols].push(photo);
    });
    return cols;
  }, [filteredPhotos, numCols]);

  const handleUpdatePhoto = (newPhoto: Photo) => {
    setPhotos(prev => {
        const index = prev.findIndex(p => p.id === newPhoto.id);
        if (index >= 0) { const u = [...prev]; u[index] = newPhoto; return u; }
        return [newPhoto, ...prev];
    });
    if (!photoToEdit) { setActiveCategory(Category.ALL); setActiveTab('全部'); setViewMode('grid'); }
  };

  const handleRatingChange = async (photo: Photo, newRating: number) => {
      const updatedPhoto = { ...photo, rating: newRating };
      // Optimistic Update
      setPhotos(prev => prev.map(p => p.id === photo.id ? updatedPhoto : p));
      if (selectedPhoto?.id === photo.id) setSelectedPhoto(updatedPhoto);
      // Persist
      try {
          await client.uploadPhoto(photo.url, updatedPhoto, adminToken);
      } catch (error) {}
  };

  const handleDeletePhoto = async (e: React.MouseEvent, photoId: string) => {
    e.stopPropagation(); e.preventDefault();
    // Direct delete without confirmation
    await client.deletePhoto(photoId, adminToken);
    setPhotos(prev => prev.filter(p => p.id !== photoId));
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
  const containerPadding = "px-6 md:px-16 lg:px-24";
  const containerMaxWidth = "max-w-[1600px]";

  return (
    <div className={`min-h-screen font-sans selection:bg-gray-500/30 ${isDark ? "text-white" : "text-black"}`}>
      <Background />
      <ProgressBar isLoading={globalLoading} theme={theme} />

      {/* === Header === */}
      <header className={`sticky top-0 left-0 right-0 z-50 transition-colors duration-300 border-b ${isDark ? 'bg-[#141414] border-white/5' : 'bg-white border-gray-100'}`}>
          <div className={`${containerMaxWidth} mx-auto ${containerPadding} py-6`}>
              
              {/* Row 1: Logo */}
              <div 
                  onClick={() => window.location.reload()}
                  className="font-serif text-3xl md:text-5xl tracking-[0.1em] cursor-pointer select-none font-light mb-6 md:mb-8"
              >
                  LUMINA
              </div>

              {/* Row 2: Controls */}
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                  
                  {/* Left Group: Tabs + Map Button */}
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-12 w-full lg:w-auto">
                      
                      {/* Tabs */}
                      <div className="flex items-center gap-8 md:gap-10 overflow-x-auto w-full md:w-auto no-scrollbar pb-1 md:pb-0">
                          {FEED_TABS.map(tab => (
                            <button
                                key={tab}
                                onClick={() => handleTabClick(tab)}
                                className={`text-xl md:text-2xl font-serif tracking-wide transition-all duration-300 whitespace-nowrap
                                    ${activeTab === tab 
                                        ? (isDark ? 'text-white font-medium scale-105' : 'text-black font-medium scale-105') 
                                        : (isDark ? 'text-white/20 hover:text-white/60' : 'text-black/20 hover:text-black/60')}
                                `}
                            >
                                {tab}
                            </button>
                          ))}
                      </div>

                      {/* Prominent Map Toggle */}
                      <button 
                        onClick={() => setViewMode(v => v === 'grid' ? 'map' : 'grid')} 
                        className={`flex items-center gap-2 px-6 py-2 rounded-full transition-all duration-300 shadow-sm whitespace-nowrap
                            ${viewMode === 'map' 
                                ? (isDark ? 'bg-white text-black font-medium' : 'bg-black text-white font-medium') 
                                : (isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-gray-100 hover:bg-gray-200 text-black')}
                        `}
                      >
                         {viewMode === 'map' ? <AlignLeft size={16} /> : <Map size={16} />}
                         <span className="text-sm tracking-widest uppercase">{viewMode === 'map' ? '返回列表' : '地图模式'}</span>
                      </button>

                  </div>

                  {/* Right Group: Categories & Settings */}
                  <div className="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-end">
                       
                       {/* Category Dropdown */}
                       <div className="relative z-50">
                            <button onClick={(e) => { e.stopPropagation(); setIsCategoryOpen(!isCategoryOpen); }} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${isDark ? 'border-white/10 hover:border-white/30 text-white/80' : 'border-black/10 hover:border-black/30 text-black/80'}`}>
                                {activeCategory === Category.ALL ? '全部分类' : activeCategory}
                                <ChevronDown size={12} className={`transition-transform duration-300 ${isCategoryOpen ? 'rotate-180' : ''}`} />
                            </button>
                            <div className={`absolute top-full right-0 mt-2 w-48 max-h-80 overflow-y-auto custom-scrollbar rounded-xl shadow-2xl border p-2 transition-all origin-top-right ${isCategoryOpen ? 'opacity-100 scale-100 visible' : 'opacity-0 scale-95 invisible'} ${isDark ? 'bg-[#1a1a1a] border-white/10' : 'bg-white border-black/5'}`}>
                                {displayCategories.map(cat => (
                                    <button key={cat} onClick={() => setActiveCategory(cat)} className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${activeCategory === cat ? (isDark ? 'bg-white/10 text-white' : 'bg-black/5 text-black') : 'opacity-60 hover:opacity-100 hover:bg-white/5'}`}>
                                        {cat}
                                    </button>
                                ))}
                            </div>
                       </div>

                       <div className={`h-6 w-[1px] mx-2 ${isDark ? 'bg-white/10' : 'bg-black/10'}`}></div>

                       {/* Theme Toggle */}
                       <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className="w-9 h-9 flex items-center justify-center rounded-lg opacity-40 hover:opacity-100 hover:bg-white/5 transition-colors">
                           {isDark ? <Moon size={18} strokeWidth={1.5} /> : <Sun size={18} strokeWidth={1.5} />}
                       </button>

                       {/* Admin Actions */}
                       {isAdmin ? (
                            <div className="flex items-center gap-1">
                                <button onClick={() => setIsManageMode(!isManageMode)} className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${isManageMode ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'opacity-40 hover:opacity-100 hover:bg-white/5'}`} title="管理"><Pencil size={18} strokeWidth={1.5} /></button>
                                <button onClick={() => {setPhotoToEdit(null); setIsUploadOpen(true);}} className="w-9 h-9 flex items-center justify-center rounded-lg opacity-40 hover:opacity-100 hover:bg-white/5 transition-colors" title="上传"><Plus size={20} strokeWidth={1.5} /></button>
                                <button onClick={() => setIsSettingsOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-lg opacity-40 hover:opacity-100 hover:bg-white/5 transition-colors" title="设置"><Cog size={18} strokeWidth={1.5} /></button>
                                <button onClick={handleLogout} className="w-9 h-9 flex items-center justify-center rounded-lg opacity-40 hover:opacity-100 hover:bg-white/5 transition-colors" title="退出"><LogOut size={18} strokeWidth={1.5} /></button>
                            </div>
                       ) : (
                            <button onClick={() => setIsLoginOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-lg opacity-40 hover:opacity-100 hover:bg-white/5 transition-colors"><Settings size={18} strokeWidth={1.5} /></button>
                       )}
                  </div>
              </div>
          </div>
      </header>

      {/* Main Content Area */}
      <main className={`mt-6 pb-12 ${containerPadding} ${containerMaxWidth} mx-auto min-h-screen`}>
        {viewMode === 'map' ? (
           <div className={`w-full h-[70vh] rounded-3xl overflow-hidden border shadow-2xl animate-fade-in ${isDark ? 'border-white/10' : 'border-black/5'}`}>
             <MapView photos={photos} theme={theme} onPhotoClick={handlePhotoClick} onMapLoadStatus={(isLoading) => setGlobalLoading(isLoading)} />
           </div>
        ) : (
          <>
            <div className="flex gap-6 items-start">
               {columns.map((colPhotos, colIndex) => (
                   <div key={colIndex} className="flex-1 flex flex-col gap-6">
                       {colPhotos.map((photo) => (
                           <div key={photo.id} className="animate-fade-in group relative">
                               {/* Flat Card Design */}
                               <div 
                                   onClick={() => handlePhotoClick(photo)}
                                   className={`
                                       relative overflow-hidden cursor-zoom-in transition-all duration-700 ease-out rounded-sm
                                       shadow-lg hover:shadow-2xl hover:-translate-y-1 
                                       bg-white 
                                       ${isManageMode ? '' : ''}
                                   `}
                               >
                                   {/* Optimization: Use Medium size (960px) for grid */}
                                   <img 
                                       src={photo.urls?.medium || photo.url} 
                                       alt={photo.title} 
                                       className="w-full h-auto object-cover block"
                                       loading="lazy"
                                   />
                                   
                                   {/* Overlay */}
                                   {!isManageMode && (
                                       <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-6">
                                           <p className="text-white font-serif text-2xl tracking-wide transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500">{photo.title}</p>
                                           <div className="flex items-center gap-2 mt-2 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500 delay-100">
                                               <span className="text-white/80 text-xs uppercase tracking-widest">{photo.category}</span>
                                               {photo.exif?.location && <span className="text-white/60 text-xs">• {photo.exif.location.split(' ')[0]}</span>}
                                           </div>
                                       </div>
                                   )}
                                   
                                   {/* Manage Overlay */}
                                   {isManageMode && (
                                      <div className="absolute inset-0 bg-black/20 flex items-start justify-between p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button onClick={(e) => { e.stopPropagation(); setPhotoToEdit(photo); setIsUploadOpen(true); }} className="bg-white/90 text-black p-2.5 rounded-full hover:scale-110 transition-transform shadow-xl backdrop-blur-sm"><Pencil size={16} /></button>
                                          <button onClick={(e) => handleDeletePhoto(e, photo.id)} className="bg-red-500/90 text-white p-2.5 rounded-full hover:scale-110 transition-transform shadow-xl backdrop-blur-sm"><Trash2 size={16} /></button>
                                      </div>
                                   )}
                               </div>
                           </div>
                       ))}
                   </div>
               ))}
            </div>
            
            {/* Infinite Scroll Trigger / Loading Indicator */}
            {hasMore && (
                <div ref={loadMoreRef} className="h-32 w-full flex items-center justify-center mt-12 opacity-50">
                    {loadingMore && <Loader2 className="animate-spin" size={24} />}
                </div>
            )}
            
            {!hasMore && filteredPhotos.length > 0 && (
                 <div className="text-center py-12 opacity-30 text-xs tracking-widest uppercase">
                     - End of Collection -
                 </div>
            )}
            
            {!globalLoading && filteredPhotos.length === 0 && (
              <div className={`text-center py-40 flex flex-col items-center justify-center opacity-30`}>
                  <AlignLeft size={64} strokeWidth={0.5} className="mb-6" />
                  <p className="font-serif text-2xl tracking-widest">暂无相关作品</p>
              </div>
            )}
          </>
        )}
      </main>

      <PhotoModal 
        photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} 
        onNext={handleNext} onPrev={handlePrev} hasNext={filteredPhotos.findIndex(p => p.id === selectedPhoto?.id) < filteredPhotos.length - 1} hasPrev={filteredPhotos.findIndex(p => p.id === selectedPhoto?.id) > 0} 
        theme={theme} slideDirection={slideDirection} isAdmin={isAdmin} 
        onRate={handleRatingChange}
        onUpdatePhoto={handleUpdatePhoto}
      />
      
      <UploadModal isOpen={isUploadOpen} onClose={() => { setIsUploadOpen(false); setPhotoToEdit(null); }} onUpload={handleUpdatePhoto} theme={theme} editingPhoto={photoToEdit} token={adminToken} categories={customCategories} />
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onLoginSuccess={handleLoginSuccess} theme={theme} />
      <SystemSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} categories={customCategories} onUpdateCategories={setCustomCategories} theme={theme} token={adminToken} />
    </div>
  );
};

export default App;
