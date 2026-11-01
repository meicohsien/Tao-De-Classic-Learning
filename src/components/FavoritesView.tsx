import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageSquareText, Sparkles, PenLine, Quote, BookOpen, ChevronRight, Calendar, X } from 'lucide-react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, getDocs, where, doc, deleteDoc } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';
import { getLaoziChapter, formatChapterMarkdown } from '../data/laoziChapters';

interface DrawRecord {
  id: string;
  chapterNumber: number;
  drawnAt: any;
  reflection?: string;
  detail?: string;
  chapterText?: string;
}

interface JournalEntry {
  id: string;
  content: string;
  type: 'material' | 'reflection' | 'note';
  createdAt: any;
  feedback?: string;
  interpretation?: string;
  mood?: string;
  userMood?: string;
}

interface CombinedFavorite {
  id: string;
  favId: string;
  type: 'fortune' | 'journal';
  savedAt: any;
  data: DrawRecord | JournalEntry;
}

const PREDEFINED_MOODS = [
  { label: '平靜', emoji: '🌿', color: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  { label: '喜悅', emoji: '✨', color: 'bg-amber-50 text-amber-600 border-amber-100' },
  { label: '感恩', emoji: '🙏', color: 'bg-rose-50 text-rose-600 border-rose-100' },
  { label: '覺察', emoji: '👁️', color: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
  { label: '疲憊', emoji: '☁️', color: 'bg-slate-50 text-slate-600 border-slate-100' },
  { label: '困惑', emoji: '🌀', color: 'bg-purple-50 text-purple-600 border-purple-100' },
  { label: '憂鬱', emoji: '💧', color: 'bg-blue-50 text-blue-600 border-blue-100' },
  { label: '焦慮', emoji: '🌪️', color: 'bg-orange-50 text-orange-600 border-orange-100' },
];

export function FavoritesView() {
  const [favorites, setFavorites] = useState<CombinedFavorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFavorite, setSelectedFavorite] = useState<CombinedFavorite | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const favPath = `users/${auth.currentUser.uid}/favorites`;
    const entriesPath = `users/${auth.currentUser.uid}/entries`;
    const historyPath = `users/${auth.currentUser.uid}/laozi_draws`;
    
    // Listen to favorites
    const favQ = query(collection(db, favPath), orderBy('savedAt', 'desc'));
    const unsubscribeFavs = onSnapshot(favQ, async (snapshot) => {
      try {
        const favDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
        
        if (favDocs.length === 0) {
          setFavorites([]);
          setLoading(false);
          return;
        }

        const fortuneFavs = favDocs.filter(f => f.type === 'fortune' || !f.type);
        const journalFavs = favDocs.filter(f => f.type === 'journal');

        let fortuneRecords: DrawRecord[] = [];
        let journalEntries: JournalEntry[] = [];

        // Fetch Fortune details
        if (fortuneFavs.length > 0) {
          const nums = fortuneFavs.map(f => f.chapterNumber).filter(Boolean);
          if (nums.length > 0) {
            const drawsQ = query(collection(db, historyPath), where('chapterNumber', 'in', nums));
            const drawsSnap = await getDocs(drawsQ);
            const records = drawsSnap.docs.map(d => ({ id: d.id, ...d.data() } as DrawRecord));
            
            // Deduplicate to latest
            const latestPerChapter: Record<number, DrawRecord> = {};
            records.forEach(r => {
              if (!latestPerChapter[r.chapterNumber] || (r.drawnAt?.seconds > latestPerChapter[r.chapterNumber].drawnAt?.seconds)) {
                latestPerChapter[r.chapterNumber] = r;
              }
            });
            fortuneRecords = Object.values(latestPerChapter);
          }
        }

        // Fetch Journal details
        if (journalFavs.length > 0) {
          const ids = journalFavs.map(f => f.entryId).filter(Boolean);
          if (ids.length > 0) {
            const entriesSnap = await getDocs(query(collection(db, entriesPath), where('__name__', 'in', ids)));
            journalEntries = entriesSnap.docs.map(d => ({ id: d.id, ...d.data() } as JournalEntry));
          }
        }

        // Combine
        const combined: CombinedFavorite[] = favDocs.map(fav => {
          if (fav.type === 'journal') {
            const entry = journalEntries.find(e => e.id === fav.entryId);
            if (!entry) return null;
            return {
              id: entry.id,
              favId: fav.id,
              type: 'journal',
              savedAt: fav.savedAt,
              data: entry
            };
          } else {
            const record = fortuneRecords.find(r => r.chapterNumber === fav.chapterNumber);
            if (!record) return null;
            return {
              id: record.id,
              favId: fav.id,
              type: 'fortune',
              savedAt: fav.savedAt,
              data: record
            };
          }
        }).filter(Boolean) as CombinedFavorite[];

        setFavorites(combined);
        setLoading(false);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, favPath);
        setLoading(false);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, favPath);
      setLoading(false);
    });

    return () => unsubscribeFavs();
  }, []);

  const removeFavorite = async (favId: string) => {
    if (!auth.currentUser) return;
    const path = `users/${auth.currentUser.uid}/favorites/${favId}`;
    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'favorites', favId));
      if (selectedFavorite?.favId === favId) {
        setSelectedFavorite(null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const getFavDate = (fav: CombinedFavorite) => {
    try {
      const date = fav.savedAt?.toDate ? fav.savedAt.toDate() : (fav.savedAt instanceof Date ? fav.savedAt : new Date());
      return date.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' });
    } catch {
      return '';
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-brand-pink/20 border-t-brand-pink rounded-full animate-spin" />
        <p className="text-slate-400 font-serif italic text-xs tracking-widest">開啟智慧典藏中...</p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-4xl mx-auto space-y-10"
    >
      <div className="flex flex-col items-center space-y-4 text-center mb-12">
        <div className="w-12 h-12 rounded-full bg-brand-pink/10 flex items-center justify-center">
          <Heart className="w-6 h-6 text-brand-pink fill-current" />
        </div>
        <h3 className="text-2xl font-serif font-light tracking-[0.3em] text-slate-800 uppercase">智慧典藏</h3>
        <p className="text-slate-400 font-light italic text-xs tracking-widest">
          「 以預覽凝縮智慧，一鍵啟迪完整宇宙 」
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-6 pb-32">
        {favorites.map((fav) => {
          if (fav.type === 'fortune') {
            const record = fav.data as DrawRecord;
            const local = getLaoziChapter(record.chapterNumber);
            const detail = (record.detail && !record.detail.includes("正在翻閱典籍中") && record.detail.length > 50)
              ? record.detail
              : formatChapterMarkdown(local);
            const wisdomMatch = detail.match(/### 🌈 結語([\s\S]*?)(?=誠心祝福|$)/);
            const wisdom = wisdomMatch ? wisdomMatch[1].trim() : local.quote;
            const shortWisdom = wisdom.replace(/[#*`\n]/g, ' ').slice(0, 75).trim() + (wisdom.length > 75 ? '...' : '');

            return (
              <motion.div 
                key={fav.favId}
                layoutId={`fav-card-${fav.favId}`}
                onClick={() => setSelectedFavorite(fav)}
                className="bg-white/60 hover:bg-white/90 backdrop-blur-md rounded-[2rem] border border-white/50 shadow-sm hover:shadow-xl transition-all duration-300 p-6 flex flex-col justify-between cursor-pointer group relative overflow-hidden h-[240px]"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="text-2xl font-serif font-bold text-brand-pink">
                        #{record.chapterNumber}
                      </div>
                      <span className="text-[10px] tracking-widest text-slate-400 uppercase font-serif">老子智慧</span>
                    </div>
                    
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFavorite(fav.favId);
                      }}
                      className="p-2 text-brand-pink hover:bg-brand-pink/5 rounded-full transition-all shrink-0"
                    >
                      <Heart className="w-4 h-4 fill-current" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center space-x-1.5 text-[10px] text-slate-300 font-serif italic">
                      <Calendar className="w-3 h-3" />
                      <span>{getFavDate(fav)} 典藏</span>
                    </div>
                    {record.reflection ? (
                      <p className="handwritten text-base text-slate-600 line-clamp-2">
                        「 {record.reflection} 」
                      </p>
                    ) : (
                      <p className="text-slate-300 text-xs italic font-light">無留下讀白...</p>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-100/60 pt-3 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 line-clamp-1 italic serif-text max-w-[70%]">
                    {shortWisdom || '載入智慧活水中...'}
                  </span>
                  <span className="text-[9px] text-brand-pink opacity-0 group-hover:opacity-100 transition-opacity font-serif font-light tracking-wider flex items-center gap-1 shrink-0">
                    展開完整 <ChevronRight className="w-2.5 h-2.5" />
                  </span>
                </div>
              </motion.div>
            );
          } else {
            const entry = fav.data as JournalEntry;
            const shortContent = entry.content.replace(/[#*`\n]/g, ' ').slice(0, 75).trim() + (entry.content.length > 75 ? '...' : '');

            return (
              <motion.div 
                key={fav.favId}
                layoutId={`fav-card-${fav.favId}`}
                onClick={() => setSelectedFavorite(fav)}
                className="bg-white/60 hover:bg-white/90 backdrop-blur-md rounded-[2rem] border border-white/50 shadow-sm hover:shadow-xl transition-all duration-300 p-6 flex flex-col justify-between cursor-pointer group relative overflow-hidden h-[240px]"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-xl bg-brand-blue/10 flex items-center justify-center">
                        <PenLine className="w-4 h-4 text-brand-blue" />
                      </div>
                      <span className={cn(
                        "text-[10px] tracking-widest font-serif uppercase",
                        entry.type === 'reflection' ? "text-brand-pink" : "text-brand-blue"
                      )}>
                        {entry.type === 'reflection' ? '心靈讀白' : entry.type === 'material' ? '靈感收藏' : '體悟筆記'}
                      </span>
                    </div>
                    
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFavorite(fav.favId);
                      }}
                      className="p-2 text-brand-pink hover:bg-brand-pink/5 rounded-full transition-all shrink-0"
                    >
                      <Heart className="w-4 h-4 fill-current" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center space-x-1.5 text-[10px] text-slate-300 font-serif italic">
                      <Calendar className="w-3 h-3" />
                      <span>{getFavDate(fav)} 典藏</span>
                    </div>
                    <p className="handwritten text-base text-slate-600 line-clamp-2">
                      {shortContent}
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-100/60 pt-3 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 line-clamp-1 italic serif-text max-w-[70%]">
                    {entry.feedback ? entry.feedback.replace(/[#*`\n]/g, ' ').slice(0, 50) + '...' : '靜候心語中...'}
                  </span>
                  <span className="text-[9px] text-brand-pink opacity-0 group-hover:opacity-100 transition-opacity font-serif font-light tracking-wider flex items-center gap-1 shrink-0">
                    展開完整 <ChevronRight className="w-2.5 h-2.5" />
                  </span>
                </div>
              </motion.div>
            );
          }
        })}

        {favorites.length === 0 && (
          <div className="py-20 text-center space-y-6 col-span-2">
            <div className="w-20 h-20 bg-white/50 backdrop-blur-md rounded-full flex items-center justify-center mx-auto shadow-sm border border-white">
              <Heart className="w-8 h-8 text-slate-200" />
            </div>
            <div className="space-y-2">
              <p className="text-slate-400 font-light italic text-sm tracking-widest">
                心靈之匣尚虛位以待，
              </p>
              <p className="text-slate-300 text-[10px] tracking-[0.2em] uppercase">在「智慧活水」或「心靈讀白」中點擊心形，留住智慧瞬間</p>
            </div>
          </div>
        )}
      </div>

      {/* Modern Overlay Modal for Reading Full Content */}
      <AnimatePresence>
        {selectedFavorite && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedFavorite(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="relative w-full max-w-3xl bg-white/95 rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/50 flex flex-col max-h-[85vh] z-[130]"
            >
              {/* Modal Header */}
              <div className="p-6 md:p-8 border-b border-slate-50 flex items-center justify-between bg-white/50 backdrop-blur-md shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-brand-pink/10 flex items-center justify-center">
                    {selectedFavorite.type === 'fortune' ? (
                      <BookOpen className="w-5 h-5 text-brand-pink" />
                    ) : (
                      <PenLine className="w-5 h-5 text-brand-blue" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-serif text-slate-800 font-medium tracking-widest text-lg">
                      {selectedFavorite.type === 'fortune' 
                        ? `道德經 第 ${(selectedFavorite.data as DrawRecord).chapterNumber} 章 ‧ 智慧典藏`
                        : `${(selectedFavorite.data as JournalEntry).type === 'reflection' ? '心靈讀白' : (selectedFavorite.data as JournalEntry).type === 'material' ? '靈感收藏' : '體悟筆記'} ‧ 智慧典藏`
                      }
                    </h4>
                    <span className="text-[10px] text-slate-400 font-serif italic tracking-wide">
                      {getFavDate(selectedFavorite)} 珍藏保存
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => removeFavorite(selectedFavorite.favId)}
                    className="p-2 text-brand-pink hover:bg-brand-pink/5 rounded-full transition-colors"
                    title="移出收藏"
                  >
                    <Heart className="w-5 h-5 fill-current" />
                  </button>
                  <button 
                    onClick={() => setSelectedFavorite(null)}
                    className="p-2 hover:bg-slate-50 rounded-full text-slate-400 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Core Content */}
              <div className="flex-1 overflow-y-auto p-8 md:p-12 space-y-8 scrollbar-thin">
                {selectedFavorite.type === 'fortune' ? (
                  (() => {
                    const record = selectedFavorite.data as DrawRecord;
                    return (
                      <div className="space-y-8">
                        {/* 沉思讀白 Card */}
                        {record.reflection && (
                          <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 shadow-sm">
                            <div className="flex items-center space-x-2 mb-3">
                              <MessageSquareText className="w-4 h-4 text-brand-blue/60" />
                              <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">當下沉思讀白</h5>
                            </div>
                            <p className="handwritten text-lg text-slate-600 leading-relaxed font-light italic">
                              「 {record.reflection} 」
                            </p>
                          </div>
                        )}

                        {/* Full Interpretation Detail (Scrollable, Complete Detail output) */}
                        <div className="space-y-4">
                          <div className="flex items-center space-x-2 border-b border-slate-50 pb-2">
                            <Sparkles className="w-4 h-4 text-brand-pink" />
                            <h5 className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.2em]">經典篇章 ‧ 完整導讀與詮釋</h5>
                          </div>
                          
                          <div className="p-6 md:p-8 bg-brand-pink/[0.01] rounded-[2rem] border border-brand-pink/5 text-slate-700 leading-relaxed font-serif text-justify prose prose-pink max-w-none shadow-inner">
                            {(() => {
                              const local = getLaoziChapter(record.chapterNumber);
                              const fullDetail = (record.detail && !record.detail.includes("正在翻閱典籍中") && record.detail.length > 50)
                                ? record.detail
                                : formatChapterMarkdown(local);
                              return <ReactMarkdown>{fullDetail}</ReactMarkdown>;
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  (() => {
                    const entry = selectedFavorite.data as JournalEntry;
                    return (
                      <div className="space-y-8">
                        {/* 札記內容 Card */}
                        <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 shadow-sm relative overflow-hidden">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-2">
                              <Quote className="w-4 h-4 text-slate-300" />
                              <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">寫下的原初情境</h5>
                            </div>
                            
                            {entry.userMood && (
                              <span className={cn(
                                "text-[10px] font-medium px-3 py-1 rounded-full border shadow-sm flex items-center gap-1.5",
                                PREDEFINED_MOODS.find(m => m.label === entry.userMood)?.color || "bg-slate-50 text-slate-500 border-slate-100"
                              )}>
                                <span>{PREDEFINED_MOODS.find(m => m.label === entry.userMood)?.emoji}</span>
                                <span>{entry.userMood}</span>
                              </span>
                            )}
                          </div>
                          <p className="handwritten text-lg md:text-xl text-slate-600 leading-relaxed font-light">
                            {entry.content}
                          </p>
                        </div>

                        {/* 導師指引 Card */}
                        <div className="space-y-4">
                          <div className="flex items-center space-x-2 border-b border-slate-50 pb-2">
                            <Sparkles className="w-4 h-4 text-brand-pink" />
                            <h5 className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.2em]">人生導師 ‧ 水之映照</h5>
                          </div>
                          
                          <div className="p-5 md:p-8 bg-brand-pink/[0.02] rounded-[1.5rem] border border-brand-pink/5 text-slate-700 leading-relaxed font-serif shadow-inner">
                            {entry.feedback ? (
                              <ReactMarkdown
                                components={{
                                  h3: ({ node, ...props }) => (
                                    <h3 {...props} className="text-base md:text-lg font-serif font-semibold text-slate-800 mt-6 mb-3 first:mt-0 pb-1 border-b border-slate-100/70" />
                                  ),
                                  blockquote: ({ node, ...props }) => (
                                    <blockquote {...props} className="my-4 p-4 md:p-5 bg-gradient-to-r from-amber-50/90 via-amber-50/40 to-transparent border-l-4 border-amber-300 rounded-r-2xl font-serif text-slate-700 italic shadow-xs leading-relaxed" />
                                  ),
                                  p: ({ node, ...props }) => (
                                    <p {...props} className="text-slate-600 font-serif leading-loose my-3 text-[14.5px] md:text-[15.5px]" />
                                  ),
                                  ul: ({ node, ...props }) => (
                                    <ul {...props} className="space-y-2.5 my-3 pl-0 list-none" />
                                  ),
                                  li: ({ node, ...props }) => (
                                    <li {...props} className="p-3 bg-white/70 rounded-xl border border-slate-100/80 shadow-xs text-slate-600 font-serif leading-relaxed text-[14px] md:text-[15px]" />
                                  ),
                                  strong: ({ node, ...props }) => (
                                    <strong {...props} className="font-semibold text-slate-800" />
                                  )
                                }}
                              >
                                {entry.feedback}
                              </ReactMarkdown>
                            ) : (
                              <div className="py-8 text-center text-slate-300 italic">尚未尋求生活指引...</div>
                            )}
                          </div>

                          {entry.interpretation && (
                            <div className="p-5 md:p-6 bg-gradient-to-br from-brand-pink/[0.04] to-slate-50/70 rounded-[1.5rem] border border-brand-pink/10 shadow-sm">
                              <div className="flex items-center space-x-2 text-[10px] font-bold text-brand-pink uppercase tracking-[0.2em] mb-2">
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>義理深探 ‧ 智慧融通</span>
                              </div>
                              <p className="text-slate-600 font-serif leading-relaxed text-sm italic">
                                {entry.interpretation}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-slate-50 flex justify-center bg-slate-50/50 shrink-0">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedFavorite(null)}
                  className="px-12 py-3 bg-brand-pink text-white rounded-2xl text-sm tracking-[0.2em] font-serif shadow-lg hover:bg-brand-pink/90 transition-all"
                >
                  關閉視窗 ✨
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
