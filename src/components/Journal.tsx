import { useState, useEffect } from 'react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, Timestamp, updateDoc, doc, deleteDoc, setDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Plus, Search, Quote, MessageCircleHeart, Sparkles, Trash2, Info, X, Heart } from 'lucide-react';
import { getMentorFeedback } from '../services/geminiService';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';

interface Entry {
  id: string;
  content: string;
  type: 'material' | 'reflection' | 'note';
  createdAt: any;
  feedback?: string;
  interpretation?: string;
  annotations?: Record<string, string>;
  mood?: string;
  userMood?: string; // 加入用戶手選的心情
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

interface JournalProps {
  focusedId?: string | null;
  onClearFocus?: () => void;
}

export function Journal({ focusedId, onClearFocus }: JournalProps = {}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [type, setType] = useState<'material' | 'reflection' | 'note'>('reflection');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [generatingFeedbackId, setGeneratingFeedbackId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeInterpretationId, setActiveInterpretationId] = useState<string | null>(null);
  const [favoritingId, setFavoritingId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    
    const path = `users/${auth.currentUser.uid}/entries`;
    const q = query(
      collection(db, path),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Entry));
      setEntries(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    // Listen to favorites
    const favPath = `users/${auth.currentUser.uid}/favorites`;
    const favQ = query(collection(db, favPath), where('type', '==', 'journal'));
    const unsubscribeFavs = onSnapshot(favQ, (snapshot) => {
      setFavoriteIds(snapshot.docs.map(d => d.data().entryId));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, favPath);
    });

    return () => {
      unsubscribe();
      unsubscribeFavs();
    };
  }, []);

  useEffect(() => {
    if (focusedId && entries.length > 0) {
      const timer = setTimeout(() => {
        const entryEl = document.getElementById(`entry-${focusedId}`);
        if (entryEl) {
          entryEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const cardEl = entryEl.querySelector('.glass-card');
          if (cardEl) {
            cardEl.classList.add('ring-4', 'ring-brand-pink/40', 'shadow-2xl');
            setTimeout(() => {
              cardEl.classList.remove('ring-4', 'ring-brand-pink/40', 'shadow-2xl');
            }, 3000);
          }
          if (onClearFocus) onClearFocus();
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [focusedId, entries, onClearFocus]);

  const toggleFavorite = async (entry: Entry) => {
    if (!auth.currentUser || favoritingId) return;
    
    setFavoritingId(entry.id);
    const isFav = favoriteIds.includes(entry.id);
    const favPath = `users/${auth.currentUser.uid}/favorites`;
    const docId = `journal_${entry.id}`;
    
    try {
      const favRef = doc(db, favPath, docId);
      if (isFav) {
        await deleteDoc(favRef);
      } else {
        await setDoc(favRef, {
          type: 'journal',
          entryId: entry.id,
          savedAt: Timestamp.now(),
          title: entry.content.substring(0, 30) + (entry.content.length > 30 ? '...' : ''),
          userId: auth.currentUser.uid
        });
      }
    } catch (err) {
       handleFirestoreError(err, isFav ? OperationType.DELETE : OperationType.WRITE, `${favPath}/${docId}`);
    } finally {
      setFavoritingId(null);
    }
  };

  const deleteEntry = async (entryId: string) => {
    if (!auth.currentUser) return;
    
    if (deletingId !== entryId) {
      setDeletingId(entryId);
      // 3秒後自動重置確認狀態
      setTimeout(() => setDeletingId(prev => prev === entryId ? null : prev), 3000);
      return;
    }

    const path = `users/${auth.currentUser.uid}/entries/${entryId}`;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'entries', entryId));
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    } finally {
      setLoading(false);
    }
  };

  const generateFeedbackForEntry = async (entry: Entry) => {
    if (!auth.currentUser || generatingFeedbackId) return;
    
    setGeneratingFeedbackId(entry.id);
    const path = `users/${auth.currentUser.uid}/entries/${entry.id}`;
    
    try {
      const result = await getMentorFeedback(entry.content);
      const mood = `${result.moodScore}:${result.moodLabel}`;
      
      const docRef = doc(db, 'users', auth.currentUser.uid, 'entries', entry.id);
      await updateDoc(docRef, {
        feedback: result.feedback,
        interpretation: result.interpretation || '',
        annotations: result.annotations || {},
        mood: mood
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    } finally {
      setGeneratingFeedbackId(null);
    }
  };

  const filteredEntries = entries.filter(entry => 
    entry.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (entry.feedback && entry.feedback.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (entry.interpretation && entry.interpretation.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !auth.currentUser) return;

    setLoading(true);
    const path = `users/${auth.currentUser.uid}/entries`;
    try {
      const result = await getMentorFeedback(content);
      const feedback = result.feedback;
      const interpretation = result.interpretation || '';
      const annotations = result.annotations || {};
      const AI_mood = `${result.moodScore}:${result.moodLabel}`;

      await addDoc(collection(db, path), {
        content,
        type,
        createdAt: Timestamp.now(),
        authorId: auth.currentUser.uid,
        feedback,
        interpretation,
        annotations,
        mood: AI_mood,
        userMood: ''
      });

      setContent('');
      setShowForm(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-serif font-light text-slate-700">心靈讀白</h1>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setShowForm(!showForm);
          }}
          className="p-3 bg-white rounded-full shadow-soft text-brand-pink hover:bg-brand-pink hover:text-white transition-all border border-brand-pink/20"
        >
          <Plus className={cn("w-6 h-6 transition-transform", showForm && "rotate-45")} />
        </motion.button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onSubmit={handleSubmit}
            className="glass-card p-5 md:p-8 space-y-6 md:space-y-8 overflow-hidden shadow-xl border-brand-pink/5"
          >
            <div className="space-y-4">
              <label className="text-[10px] uppercase tracking-[0.3em] font-medium text-slate-400 block ml-1">選擇紀錄類型</label>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setType('reflection')}
                  className={cn(
                    "flex-1 py-2 md:py-3 text-[10px] md:text-xs rounded-xl md:rounded-2xl transition-all border",
                    type === 'reflection' ? "bg-brand-pink border-brand-pink text-white shadow-lg shadow-brand-pink/20" : "border-slate-100 text-slate-400 bg-white/50 hover:border-brand-pink/20"
                  )}
                >
                  傾訴心路
                </button>
                <button
                  type="button"
                  onClick={() => setType('material')}
                  className={cn(
                    "flex-1 py-2 md:py-3 text-[10px] md:text-xs rounded-xl md:rounded-2xl transition-all border",
                    type === 'material' ? "bg-brand-blue border-brand-blue text-white shadow-lg shadow-brand-blue/20" : "border-slate-100 text-slate-400 bg-white/50 hover:border-brand-blue/20"
                  )}
                >
                  收藏靈感
                </button>
                <button
                  type="button"
                  onClick={() => setType('note')}
                  className={cn(
                    "flex-1 py-2 md:py-3 text-[10px] md:text-xs rounded-xl md:rounded-2xl transition-all border",
                    type === 'note' ? "bg-[#00897B] border-[#00897B] text-white shadow-lg shadow-teal-500/20" : "border-slate-100 text-slate-400 bg-white/50 hover:border-teal-500/20"
                  )}
                >
                  體悟筆記
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] uppercase tracking-[0.3em] font-medium text-slate-400 block ml-1">留下您的痕跡</label>
                <span className={cn(
                  "text-[9px] font-mono tracking-wider transition-colors",
                  content.length > 1000 ? "text-red-400" : "text-slate-300"
                )}>
                  {content.length} / 1000
                </span>
              </div>
              <div className="relative group">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={
                    type === 'reflection' ? "溫柔地與自己對話，記錄此刻的心流..." : 
                    type === 'material' ? "將觸動心靈的吉光片羽留在這裡..." :
                    "記錄在修行路上的體悟與覺察..."
                  }
                  className="w-full h-40 md:h-52 p-6 bg-white/40 border border-slate-100 rounded-[2rem] focus:ring-0 focus:border-brand-pink/20 outline-none resize-none font-light tracking-wide text-slate-600 transition-all text-sm md:text-base shadow-inner-sm hover:bg-white/60 focus:bg-white/80"
                />
                <div className="absolute bottom-6 right-6 pointer-events-none opacity-10 group-focus-within:opacity-30 transition-opacity">
                  <Quote className="w-8 h-8 text-brand-pink" />
                </div>
              </div>
            </div>
            
            <motion.button
              whileHover={{ scale: loading ? 1 : 1.01 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
              disabled={loading || !content.trim() || content.length > 1000}
              className={cn(
                "w-full py-4 bg-slate-800 text-white rounded-[2rem] flex items-center justify-center space-x-3 disabled:opacity-30 transition-all shadow-xl font-light tracking-[0.5em] text-xs uppercase",
                loading ? "cursor-not-allowed" : "hover:bg-slate-900 shadow-slate-200"
              )}
            >
              {loading ? (
                <div className="flex items-center space-x-3">
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span className="animate-pulse">正在轉化心語...</span>
                </div>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 opacity-60" />
                  <span>深呼吸，發送</span>
                </>
              )}
            </motion.button>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="relative">
        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
          <Search className="w-4 h-4 text-slate-300" />
        </div>
        <input
          type="text"
          placeholder="關鍵字搜尋札記..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-6 py-4 bg-white/50 border border-slate-100 rounded-full focus:ring-2 focus:ring-brand-pink/10 focus:border-brand-pink/20 outline-none transition-all text-sm text-slate-600 placeholder:text-slate-300 shadow-sm"
        />
      </div>

      <div className="grid gap-8 md:gap-12">
        {filteredEntries.map((entry) => (
          <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            key={entry.id}
            id={`entry-${entry.id}`}
            className="group"
          >
            <div className="glass-card p-6 md:p-8 space-y-6 md:space-y-8 relative overflow-hidden group-hover:bg-white/80 transition-colors shadow-soft hover:shadow-xl">
              {/* Favorite Button - Top Right */}
              <div className="absolute top-2 right-2 md:top-4 md:right-4 z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(entry);
                  }}
                  className={cn(
                    "p-3 rounded-full transition-all shadow-sm",
                    favoriteIds.includes(entry.id)
                      ? "text-brand-pink bg-brand-pink/5"
                      : "text-slate-200 hover:text-brand-pink hover:bg-brand-pink/5 bg-white/40"
                  )}
                  title="收藏至智慧典藏"
                >
                  <Heart className={cn("w-4 h-4 md:w-5 h-5", favoriteIds.includes(entry.id) && "fill-current")} />
                </button>
              </div>

              {entry.type === 'material' && (
                <div className="absolute top-0 right-0 p-4 md:p-8 opacity-[0.03] pointer-events-none">
                  <Quote className="w-24 h-24 md:w-40 md:h-40" />
                </div>
              )}
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                  <span className={cn(
                    "text-[9px] uppercase tracking-[0.3em] font-bold px-4 py-1.5 rounded-full border shadow-sm",
                    entry.type === 'reflection' 
                      ? "bg-brand-pink/10 text-brand-pink border-brand-pink/10" 
                      : entry.type === 'material'
                        ? "bg-brand-blue/10 text-brand-blue border-brand-blue/10"
                        : "bg-teal-50 text-teal-600 border-teal-100"
                  )}>
                    {entry.type === 'reflection' ? '心靈讀白' : entry.type === 'material' ? '靈感收藏' : '體悟筆記'}
                  </span>
                  
                  {entry.userMood && (
                    <span className={cn(
                      "text-[10px] font-medium px-4 py-1.5 rounded-full border shadow-sm flex items-center gap-2",
                      PREDEFINED_MOODS.find(m => m.label === entry.userMood)?.color || "bg-slate-50 text-slate-500 border-slate-100"
                    )}>
                      <span>{PREDEFINED_MOODS.find(m => m.label === entry.userMood)?.emoji}</span>
                      <span>{entry.userMood}</span>
                    </span>
                  )}

                  {entry.mood && (
                    <div className="flex items-center space-x-1 border-l border-slate-100 pl-3">
                      <span className="text-[10px] text-slate-300 font-light">
                        能源 {entry.mood.split(':')[0]}/100
                      </span>
                      <div 
                        className="cursor-help text-slate-200 hover:text-brand-pink transition-colors"
                        title="能源指數：由 AI 感知的能量性質 (1-100)。高分代表正向、清靜、高頻能量；低分代表負向、不安或低頻狀態。"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                      </div>
                    </div>
                  )}

                </div>

                  <div className="flex items-center justify-between sm:justify-end space-x-4 flex-1">
                    <span className="text-[10px] md:text-[11px] text-slate-300 font-light tracking-widest font-serif italic text-right flex-1">
                      {(() => {
                        try {
                          const date = entry.createdAt?.toDate ? entry.createdAt.toDate() : (entry.createdAt instanceof Date ? entry.createdAt : new Date());
                          return date.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' });
                        } catch {
                          return '---';
                        }
                      })()}
                    </span>
                    
                    <div className="flex items-center space-x-1 border-l border-slate-50 pl-3">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteEntry(entry.id);
                        }}
                        className={cn(
                          "p-2.5 rounded-full transition-all ml-1 flex items-center space-x-1",
                          deletingId === entry.id 
                            ? "bg-red-500 text-white shadow-lg shadow-red-200" 
                            : "text-slate-200 hover:text-red-400 hover:bg-red-50"
                        )}
                        title="刪除紀錄"
                      >
                        <Trash2 className={cn("w-4 h-4", deletingId === entry.id && "animate-pulse")} />
                        <AnimatePresence>
                          {deletingId === entry.id && (
                            <motion.span 
                              initial={{ width: 0, opacity: 0 }}
                              animate={{ width: 'auto', opacity: 1 }}
                              exit={{ width: 0, opacity: 0 }}
                              className="text-[9px] font-bold tracking-widest whitespace-nowrap overflow-hidden"
                            >
                              確定刪除？
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </button>
                    </div>
                  </div>
                </div>

              <div className="relative group/content max-w-prose">
                <p className={cn(
                  "leading-[1.8] transition-all duration-500",
                  entry.type === 'material' 
                    ? "serif-text text-sm md:text-base text-slate-700 italic font-light tracking-wide" 
                    : "handwritten text-sm md:text-lg text-slate-500 tracking-wide"
                )}>
                  {entry.content}
                </p>
              </div>

              {!entry.feedback && (
                <div className="pt-4 md:pt-6 flex justify-end">
                  <button
                    onClick={() => generateFeedbackForEntry(entry)}
                    disabled={!!generatingFeedbackId}
                    className="flex items-center space-x-2 text-[10px] uppercase tracking-[0.2em] text-brand-pink hover:text-white hover:bg-brand-pink px-5 md:px-6 py-2 md:py-2.5 rounded-full border border-brand-pink/20 transition-all disabled:opacity-50 shadow-sm"
                  >
                    {generatingFeedbackId === entry.id ? (
                      <div className="w-3 h-3 border-2 border-brand-pink/30 border-t-brand-pink rounded-full animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    <span>{generatingFeedbackId === entry.id ? '正在轉化心語...' : '尋求導師指引'}</span>
                  </button>
                </div>
              )}

              {entry.feedback && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="pt-6 md:pt-10 border-t border-brand-pink/5"
                >
                  <div className="flex items-center space-x-3 mb-4 md:mb-6">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-brand-pink/10 flex items-center justify-center shadow-inner">
                      <MessageCircleHeart className="w-4 h-4 md:w-5 md:h-5 text-brand-pink" />
                    </div>
                    <div className="flex items-center justify-between flex-1">
                      <span className="text-xs md:text-sm font-serif italic text-slate-400 tracking-widest">生活導師：溫柔映照</span>
                    </div>
                  </div>
                  <div className="p-5 md:p-8 bg-brand-pink/[0.02] rounded-[1.2rem] md:rounded-[2.2rem] text-slate-600 text-[14px] md:text-[16px] leading-relaxed serif-text border border-brand-pink/5 shadow-inner">
                    <ReactMarkdown
                      components={{
                        h1: ({ node, ...props }) => (
                          <h2 {...props} className="text-xl md:text-2xl font-serif font-light text-slate-800 mb-6 border-b border-brand-pink/10 pb-2" />
                        ),
                        h3: ({ node, ...props }) => {
                          const getChildrenText = (children: any): string => {
                            if (typeof children === 'string') return children;
                            if (Array.isArray(children)) return children.map(getChildrenText).join('');
                            if (children && typeof children === 'object' && children.props && children.props.children) {
                              return getChildrenText(children.props.children);
                            }
                            return String(children || '');
                          };
                          
                          const childrenText = getChildrenText(props.children);
                          const isWaterSection = childrenText.includes('水映照') || childrenText.includes('水之映照');
                          
                          return (
                            <div className="flex items-center justify-between mb-3 mt-7 first:mt-0 group/section pb-1.5 border-b border-slate-100/70">
                               <h3 {...props} className="text-base md:text-lg font-serif font-semibold text-slate-800 m-0 tracking-wide flex items-center gap-2" />
                               {isWaterSection && (entry.interpretation || (entry.annotations && Object.keys(entry.annotations).length > 0)) && (
                                 <button
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     setActiveInterpretationId(entry.id);
                                   }}
                                    className="flex items-center space-x-1.5 px-3 py-1 md:py-1.5 rounded-full bg-brand-pink/10 text-brand-pink border border-brand-pink/20 hover:bg-brand-pink hover:text-white transition-all text-[10px] md:text-[11px] font-bold tracking-widest shadow-sm ring-2 ring-white"
                                  >
                                    <Info className="w-3 h-3 md:w-3.5 h-3.5" />
                                    <span>字句探義</span>
                                  </button>
                                )}
                            </div>
                          );
                        },
                        blockquote: ({ node, ...props }) => (
                          <blockquote {...props} className="my-4 p-4 md:p-5 bg-gradient-to-r from-amber-50/90 via-amber-50/40 to-transparent border-l-4 border-amber-300 rounded-r-2xl font-serif text-slate-700 italic shadow-xs leading-relaxed" />
                        ),
                        p: ({ node, ...props }) => (
                          <p {...props} className="text-slate-600 font-serif leading-loose my-3 text-[14.5px] md:text-[16px]" />
                        ),
                        ul: ({ node, ...props }) => (
                          <ul {...props} className="space-y-2.5 my-3 pl-0 list-none" />
                        ),
                        li: ({ node, ...props }) => (
                          <li {...props} className="p-3 bg-white/70 rounded-xl border border-slate-100/80 shadow-xs text-slate-600 font-serif leading-relaxed text-[14px] md:text-[15.5px]" />
                        ),
                        strong: ({ node, ...props }) => (
                          <strong {...props} className="font-semibold text-slate-800" />
                        )
                      }}
                    >
                      {entry.feedback}
                    </ReactMarkdown>
                  </div>
                  {entry.interpretation && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 p-6 md:p-8 bg-gradient-to-br from-brand-pink/[0.04] to-slate-50/70 rounded-[1.5rem] md:rounded-[2rem] border border-brand-pink/10 shadow-sm"
                    >
                      <div className="flex items-center space-x-2 text-[10px] font-bold text-brand-pink uppercase tracking-[0.2em] mb-3">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>義理深探 ‧ 智慧融通</span>
                      </div>
                      <p className="text-slate-600 font-serif leading-relaxed text-sm md:text-base italic">
                        {entry.interpretation}
                      </p>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* 詳解彈窗 Overlay */}
              <AnimatePresence>
                {activeInterpretationId === entry.id && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setActiveInterpretationId(null)}
                      className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 20 }}
                      className="relative w-full max-w-lg bg-white/95 rounded-[2rem] shadow-2xl overflow-hidden border border-white/50"
                    >
                      <div className="p-6 md:p-8 space-y-6">
                        <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-brand-pink/10 flex items-center justify-center">
                              <Sparkles className="w-4 h-4 text-brand-pink" />
                            </div>
                            <span className="font-serif text-slate-700 tracking-widest font-medium text-lg">字句探義</span>
                          </div>
                          <button 
                            onClick={() => setActiveInterpretationId(null)}
                            className="p-2 hover:bg-slate-50 rounded-full text-slate-400 transition-colors"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>

                        <div className="max-h-[60vh] overflow-y-auto space-y-6 pr-2 scrollbar-thin">
                          {entry.interpretation && (
                            <div className="space-y-6">
                              {/* Original Verse - Extracted from feedback */}
                              {(() => {
                                const sections = entry.feedback.split('###');
                                const waterSection = sections.find(s => s.includes('水之映照') || s.includes('水映照'));
                                if (waterSection) {
                                  // Remove the title line and trim
                                  const content = waterSection.split(/\r?\n/).slice(1).join('\n').trim();
                                  return (
                                    <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100 shadow-sm">
                                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">水之映照 ‧ 心靈觀照原文</div>
                                      <p className="text-slate-700 font-serif italic leading-relaxed text-sm md:text-base">
                                        {content}
                                      </p>
                                    </div>
                                  );
                                }
                                return null;
                              })()}

                              {/* Word Decomposition (Annotations) */}
                              {entry.annotations && Object.keys(entry.annotations).length > 0 && (
                                <div className="space-y-3">
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">心靈詞彙義理探析</div>
                                  <div className="grid gap-3">
                                    {Object.entries(entry.annotations).map(([key, value]) => (
                                      <div key={key} className="flex items-start space-x-3 p-4 rounded-2xl bg-slate-50/80 border border-slate-100 flex-col sm:flex-row">
                                        <div className="text-xs font-bold text-brand-pink bg-white px-3 py-1 rounded-lg border border-brand-pink/10 shadow-xs mb-2 sm:mb-0 shrink-0">
                                          {key}
                                        </div>
                                        <p className="text-sm text-slate-600 leading-relaxed font-serif">
                                          {value}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}


                            </div>
                          )}
                        </div>
                        
                        <div className="pt-2 text-center">
                          <p className="text-[10px] text-slate-300 font-serif italic tracking-widest">點擊空白處或關閉離開</p>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ))}
        {filteredEntries.length === 0 && !showForm && (
          <div className="text-center py-20 px-6 space-y-4 glass-card border-dashed border-slate-100 bg-slate-50/30">
            <div className="flex justify-center">
              <div className="relative">
                <Sparkles className="w-10 h-10 text-brand-pink/20 animate-pulse" />
                <Search className="w-4 h-4 text-slate-300 absolute -bottom-1 -right-1" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-slate-400 font-serif italic text-base tracking-widest">
                {searchTerm ? `未能在塵世中尋得「${searchTerm}」相關的點滴...` : '尚未留下您的心靈足跡...'}
              </p>
              <p className="text-[10px] text-slate-300 uppercase tracking-[0.2em]">
                {searchTerm ? '請嘗試換個關鍵字映照' : '點擊上方按鈕，開啟與內心的對話'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
