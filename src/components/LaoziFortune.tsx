import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, History, BookOpen, ArrowRight, Save, MessageSquareText, Download, X, Info, Heart, RefreshCw, Waves, Compass } from 'lucide-react';
import { getLaoziChapterDetail } from '../services/geminiService';
import { getLaoziChapter, formatChapterMarkdown, WordAnalysis } from '../data/laoziChapters';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, query, orderBy, limit, onSnapshot, Timestamp, deleteDoc, setDoc } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';
import { domToPng } from 'modern-screenshot';
import { jsPDF } from 'jspdf';

interface DrawRecord {
  id: string;
  chapterNumber: number;
  drawnAt: any;
  reflection?: string;
  detail?: string;
  chapterText?: string;
  wordAnalysis?: WordAnalysis[];
  sign?: string;
  title?: string;
}

interface ChapterData {
  number: number;
  detail: string;
  wordAnalysis?: WordAnalysis[];
  title?: string;
  sign?: string;
  quote?: string;
}

interface LaoziFortuneProps {
  focusedChapterNumber?: number | null;
  onClearFocus?: () => void;
}

export function LaoziFortune({ focusedChapterNumber, onClearFocus }: LaoziFortuneProps = {}) {
  const [drawing, setDrawing] = useState(false);
  const [drawingProgress, setDrawingProgress] = useState(0);
  const [drawnLotNotice, setDrawnLotNotice] = useState<string | null>(null);
  const [currentDrawId, setCurrentDrawId] = useState<string | null>(null);
  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [activeWord, setActiveWord] = useState<WordAnalysis | null>(null);
  const [showAllAnalysis, setShowAllAnalysis] = useState(false);
  const [reflection, setReflection] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [history, setHistory] = useState<DrawRecord[]>([]);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [favoriting, setFavoriting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [viewTab, setViewTab] = useState<'fortune' | 'history'>('fortune');
  const detailRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const exportAsImage = async () => {
    if (!exportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const dataUrl = await domToPng(exportRef.current, {
        backgroundColor: '#ffffff',
        scale: 4,
        quality: 1,
      });
      
      const link = document.createElement('a');
      link.download = `老子智慧-第${chapter?.number}章-${new Date().getTime()}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsExporting(false);
    } catch (e) {
      console.error("Export failed:", e);
      setIsExporting(false);
    }
  };

  const exportAsPDF = async () => {
    if (!exportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const dataUrl = await domToPng(exportRef.current, {
        backgroundColor: '#ffffff',
        scale: 4,
        quality: 1,
      });
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      if (pdfHeight > 297) {
        const longPdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: [210, pdfHeight]
        });
        longPdf.addImage(dataUrl, 'PNG', 0, 0, 210, pdfHeight, undefined, 'FAST');
        longPdf.save(`老子智慧-第${chapter?.number}章-${new Date().getTime()}.pdf`);
      } else {
        pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
        pdf.save(`老子智慧-第${chapter?.number}章-${new Date().getTime()}.pdf`);
      }
      setIsExporting(false);
    } catch (e) {
      console.error("PDF Export failed:", e);
      setIsExporting(false);
    }
  };

  useEffect(() => {
    if (!auth.currentUser) return;
    const historyPath = `users/${auth.currentUser.uid}/laozi_draws`;
    const q = query(
      collection(db, historyPath),
      orderBy('drawnAt', 'desc'),
      limit(15)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHistory(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DrawRecord)));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, historyPath);
    });

    const favPath = `users/${auth.currentUser.uid}/favorites`;
    const favQ = query(collection(db, favPath), orderBy('savedAt', 'desc'));
    const unsubscribeFavs = onSnapshot(favQ, (snapshot) => {
      setFavorites(snapshot.docs.map(d => d.data().chapterNumber));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, favPath);
    });

    return () => {
      unsubscribe();
      unsubscribeFavs();
    };
  }, []);

  useEffect(() => {
    if (focusedChapterNumber) {
      setViewTab('fortune');
      const match = history.find(h => h.chapterNumber === focusedChapterNumber);
      if (match) {
        viewHistory(match);
        if (onClearFocus) onClearFocus();
        setTimeout(() => {
          if (detailRef.current) {
            detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 300);
      } else {
        const loadSpecificDraw = async () => {
          const local = getLaoziChapter(focusedChapterNumber);
          setChapter({
            number: focusedChapterNumber,
            detail: formatChapterMarkdown(local),
            wordAnalysis: local.wordAnalysis,
            title: local.title,
            sign: local.sign,
            quote: local.quote
          });
          setTimeout(() => {
            if (detailRef.current) {
              detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 300);
          if (onClearFocus) onClearFocus();
        };
        loadSpecificDraw();
      }
    }
  }, [focusedChapterNumber, history]);

  // Mindful Chapter Reading
  const draw = async () => {
    setDrawing(true);
    setDrawingProgress(0);
    setDrawnLotNotice(null);
    setReflection('');
    setShowPrompt(false);
    setViewTab('fortune');

    // 1. 隨機選定 1 至 81 章
    const chapterNumber = Math.floor(Math.random() * 81) + 1;
    const local = getLaoziChapter(chapterNumber);

    // 2. 靜心翻閱節奏
    const progressInterval = setInterval(() => {
      setDrawingProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 15;
      });
    }, 120);

    try {
      // 3. 獲取篇章內容（本地典籍資料庫即時保底 + 後端 AI 增強）
      const result = await getLaoziChapterDetail(chapterNumber);
      
      const detail = (result.detail && !result.detail.includes("正在翻閱典籍中") && result.detail.length > 50)
        ? result.detail
        : formatChapterMarkdown(local);

      const wordAnalysis = (result.wordAnalysis && result.wordAnalysis.length > 0)
        ? result.wordAnalysis
        : local.wordAnalysis;

      const title = result.title || local.title;
      const sign = result.sign || local.sign;
      const quote = result.quote || local.quote;

      // 提取原文句子
      const chapterTextMatch = detail.match(/open-quote ([\s\S]*?) close-quote/);
      const chapterText = chapterTextMatch ? chapterTextMatch[1].trim() : local.original;

      clearInterval(progressInterval);
      setDrawingProgress(100);
      setDrawnLotNotice(`老子《道德經》· 第 ${chapterNumber} 章 · ${title}`);

      // 稍作停頓展現翻開篇章的雅緻感
      await new Promise(r => setTimeout(r, 600));

      setChapter({
        number: chapterNumber,
        detail,
        wordAnalysis,
        title,
        sign,
        quote
      });
      setDrawing(false);

      // 4. 存入 Firestore 歷史紀錄
      if (auth.currentUser) {
        try {
          const path = `users/${auth.currentUser.uid}/laozi_draws`;
          const docRef = await addDoc(collection(db, path), {
            chapterNumber,
            drawnAt: Timestamp.now(),
            userId: auth.currentUser.uid,
            reflection: '',
            detail: detail,
            chapterText: chapterText,
            wordAnalysis: wordAnalysis || [],
            sign,
            title
          });
          setCurrentDrawId(docRef.id);
        } catch (dbErr) {
          console.warn("Firestore save read record error:", dbErr);
        }
      }

      setTimeout(() => setShowPrompt(true), 1200);
    } catch (err) {
      console.warn("Draw error caught, using authentic local chapter:", err);
      clearInterval(progressInterval);
      setDrawing(false);
      setChapter({
        number: chapterNumber,
        detail: formatChapterMarkdown(local),
        wordAnalysis: local.wordAnalysis,
        title: local.title,
        sign: local.sign,
        quote: local.quote
      });
    }
  };

  const viewHistory = (record: DrawRecord) => {
    setViewTab('fortune');
    const local = getLaoziChapter(record.chapterNumber);
    
    // 自動修復過往不完整或包含「正在翻閱典籍中」的紀錄
    const validDetail = (record.detail && !record.detail.includes("正在翻閱典籍中") && record.detail.length > 50)
      ? record.detail
      : formatChapterMarkdown(local);

    const validWords = (record.wordAnalysis && record.wordAnalysis.length > 0)
      ? record.wordAnalysis
      : local.wordAnalysis;

    setChapter({ 
      number: record.chapterNumber, 
      detail: validDetail,
      wordAnalysis: validWords,
      title: record.title || local.title,
      sign: record.sign || local.sign,
      quote: local.quote
    });
    setCurrentDrawId(record.id);
    setReflection(record.reflection || '');
    setShowPrompt(false);

    // 在背景自動修正 Firestore 中損壞的舊資料
    if (auth.currentUser && (!record.detail || record.detail.includes("正在翻閱典籍中") || !record.chapterText)) {
      const chapterTextMatch = validDetail.match(/open-quote ([\s\S]*?) close-quote/);
      const chapterText = chapterTextMatch ? chapterTextMatch[1].trim() : local.original;
      updateDoc(doc(db, 'users', auth.currentUser.uid, 'laozi_draws', record.id), {
        detail: validDetail,
        wordAnalysis: validWords,
        chapterText: chapterText,
        sign: local.sign,
        title: local.title
      }).catch(e => console.warn("Auto-heal doc failed:", e));
    }
  };

  const saveReflection = async () => {
    if (!currentDrawId || !auth.currentUser) return;
    setSaving(true);
    setShowSavedFeedback(false);
    const path = `users/${auth.currentUser.uid}/laozi_draws/${currentDrawId}`;
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid, 'laozi_draws', currentDrawId), {
        reflection: reflection
      });
      setShowSavedFeedback(true);
      setTimeout(() => setShowSavedFeedback(false), 3000);
    } catch (e) {
      console.error(e);
      handleFirestoreError(e, OperationType.UPDATE, path);
    } finally {
      setSaving(false);
    }
  };

  const toggleFavorite = async () => {
    if (!chapter || !auth.currentUser) return;
    setFavoriting(true);
    const chapterNum = chapter.number;
    const isFav = favorites.includes(chapterNum);
    const path = `users/${auth.currentUser.uid}/favorites/chapter_${chapterNum}`;
    
    try {
      const favRef = doc(db, 'users', auth.currentUser.uid, 'favorites', `chapter_${chapterNum}`);
      if (isFav) {
        await deleteDoc(favRef);
      } else {
        await setDoc(favRef, {
          chapterNumber: chapterNum,
          type: 'fortune',
          savedAt: Timestamp.now(),
          title: chapter.title ? `第 ${chapterNum} 章 ‧ ${chapter.title}` : `第 ${chapterNum} 章`,
          userId: auth.currentUser.uid
        });
      }
    } catch (e) {
      console.error("Toggle favorite failed:", e);
      handleFirestoreError(e, isFav ? OperationType.DELETE : OperationType.WRITE, path);
    } finally {
      setFavoriting(false);
    }
  };

  return (
    <>
      {/* Top Navigation Tabs */}
      <div className="flex justify-center mt-6 md:mt-10 mb-8">
        <div className="bg-white/80 backdrop-blur-xl border border-white/60 rounded-3xl p-1.5 shadow-soft flex items-center space-x-1.5">
          <button 
            onClick={() => {
              if (drawing) return;
              draw();
            }}
            disabled={drawing}
            className={cn(
              "flex items-center space-x-2 px-5 md:px-6 py-2.5 md:py-3 rounded-2xl transition-all font-medium text-xs md:text-sm tracking-wider",
              viewTab === 'fortune'
                ? "bg-brand-pink text-white shadow-md shadow-brand-pink/20"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            )}
          >
            <BookOpen className="w-4 h-4" />
            <span>{chapter ? "翻開新篇" : "隨心翻閱"}</span>
          </button>
          
          <button 
            onClick={() => {
              setViewTab('history');
              setChapter(null);
            }}
            className={cn(
              "flex items-center space-x-2 px-4 md:px-5 py-2.5 md:py-3 rounded-2xl transition-all text-xs md:text-sm tracking-wider font-light",
              viewTab === 'history' && !chapter
                ? "bg-slate-800 text-white shadow-md" 
                : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
            )}
          >
            <History className="w-4 h-4" />
            <span>閱讀足跡</span>
            {history.length > 0 && (
              <span className={cn(
                "ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-mono",
                viewTab === 'history' && !chapter ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              )}>
                {history.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Hidden A4 Export Template */}
      <div className="fixed -left-[9999px] top-0 pointer-events-none">
        <div 
          ref={exportRef}
          className="bg-[#FCFAF7] w-[794px] p-[50px] flex flex-col font-serif relative text-slate-800"
          style={{ minHeight: '1123px', height: 'auto' }}
        >
          {/* Main Decorative Frame */}
          <div className="absolute inset-[25px] border-[1px] border-slate-900/10 pointer-events-none" />
          <div className="absolute inset-[30px] border-[0.5px] border-slate-900/5 pointer-events-none" />
          
          {/* Header Branding */}
          <div className="flex flex-col items-center mb-6 relative z-10">
            <span className="text-[10px] tracking-[0.4em] text-slate-400 font-medium uppercase text-center block mb-1">LAOZI WISDOM</span>
            <div className="text-[100px] font-serif font-light text-brand-pink/20 tracking-tighter -mt-4 -mb-4">
               {chapter?.number && (chapter.number < 10 ? `0${chapter.number}` : chapter.number)}
            </div>
            <div className="text-xl tracking-[0.2em] font-serif font-medium text-slate-800 mt-2">
              第 {chapter?.number} 章 ‧ {chapter?.title}
            </div>
            {chapter?.sign && (
              <div className="text-xs tracking-[0.25em] font-serif text-brand-pink mt-1.5">
                篇章主題 ‧ {chapter.sign}
              </div>
            )}
          </div>

          {/* Body Content */}
          <div className="flex-1 px-10 flex flex-col">
            <div 
              className="text-slate-600 leading-relaxed text-[15px] text-justify font-serif"
              style={{ wordBreak: 'break-all' }}
            >
              <ReactMarkdown 
                components={{ 
                  h1: () => null,
                  h3: ({ children }) => (
                    <div className="flex items-center space-x-2 mt-8 mb-4 border-b border-slate-100 pb-1.5">
                      <span className="text-brand-pink font-light">·</span>
                      <span className="text-xs tracking-[0.2em] text-brand-pink font-medium uppercase">{children}</span>
                    </div>
                  ),
                  p: ({ children }) => {
                    const text = Array.isArray(children) ? children.join('') : children?.toString() || '';
                    if (text.includes('open-quote')) {
                      const quoteContent = text.replace(/open-quote/g, '').replace(/close-quote/g, '').trim();
                      return (
                        <div className="my-8 py-6 px-10 bg-white/70 border-y border-slate-100 text-slate-800 font-serif text-[17px] leading-loose text-center whitespace-pre-wrap">
                          {quoteContent}
                        </div>
                      );
                    }
                    return <p className="mb-4 leading-relaxed">{children}</p>;
                  },
                  ul: ({ children }) => <ul className="list-disc pl-5 mb-6 space-y-3 text-slate-500">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-5 mb-6 space-y-4 text-slate-500">{children}</ol>,
                  li: ({ children }) => (
                    <li className="pl-1">
                      <span className="text-slate-600">{children}</span>
                    </li>
                  )
                }}
              >
                {chapter?.detail || ''}
              </ReactMarkdown>
            </div>
          </div>

          {/* Bottom Branding & Date */}
          <div className="mt-16 pt-8 border-t border-slate-100 flex justify-between items-end">
            <div className="flex flex-col space-y-1">
              <span className="text-[10px] tracking-[0.3em] text-slate-500 font-medium">水德清心 ‧ 老子道德經智慧篇章</span>
              <span className="text-[9px] text-slate-400 font-light">{new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
            <div className="text-[10px] tracking-[0.2em] text-slate-400 font-serif italic">
              上善若水 ‧ 潤澤自性
            </div>
          </div>
        </div>
      </div>

      {/* Title Header */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center space-y-3 text-center mb-6 md:mb-10"
      >
        <span className="text-[10px] tracking-[0.4em] text-brand-pink font-semibold uppercase">Wisdom Water</span>
        <h2 className="text-3xl md:text-4xl font-serif font-light tracking-[0.25em] text-slate-800 px-4">智慧活水</h2>
        <div className="flex items-center space-x-4 md:space-x-6">
          <div className="h-[0.5px] w-8 md:w-12 bg-slate-200" />
          <p className="text-slate-400 font-light italic text-xs md:text-sm tracking-wider px-2">
            「大道至簡，順水自安；靜心翻閱，與智慧相遇」
          </p>
          <div className="h-[0.5px] w-8 md:w-12 bg-slate-200" />
        </div>
      </motion.div>

      {/* Main Reading & Flipping Area */}
      <div className="flex justify-center flex-col items-center">
        {/* Serene Water Ripple & Book Page Flipping Animation */}
        <AnimatePresence>
          {drawing && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="py-12 flex flex-col items-center text-center space-y-8"
            >
              {/* Soothing Floating Card with Water Waves */}
              <div className="relative flex items-center justify-center">
                {/* Expanding Concentric Water Waves */}
                <motion.div 
                  className="absolute w-44 h-44 rounded-full border border-brand-pink/25"
                  animate={{ scale: [1, 1.45, 1.8], opacity: [0.6, 0.3, 0] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
                />
                <motion.div 
                  className="absolute w-36 h-36 rounded-full border border-brand-blue/20"
                  animate={{ scale: [1, 1.35, 1.6], opacity: [0.5, 0.2, 0] }}
                  transition={{ duration: 2.2, repeat: Infinity, delay: 0.7, ease: "easeOut" }}
                />

                {/* Floating Aesthetic Book Card */}
                <motion.div
                  animate={{ 
                    y: [0, -8, 0],
                    rotateZ: [-1, 1, -1]
                  }}
                  transition={{ 
                    duration: 2.4,
                    repeat: Infinity,
                    ease: "easeInOut" 
                  }}
                  className="relative w-32 h-44 bg-white/95 rounded-2xl shadow-xl border border-white/80 p-5 flex flex-col items-center justify-between overflow-hidden"
                >
                  <div className="w-full flex justify-between items-center text-slate-300">
                    <span className="text-[9px] font-mono tracking-widest">CHAPTER</span>
                    <Waves className="w-3.5 h-3.5 text-brand-blue/40" />
                  </div>

                  <div className="w-12 h-12 rounded-full bg-brand-pink/10 flex items-center justify-center text-brand-pink my-auto">
                    <BookOpen className="w-6 h-6 animate-pulse" />
                  </div>

                  <div className="w-full text-center">
                    <div className="h-1 bg-brand-pink/20 rounded-full w-12 mx-auto mb-1.5" />
                    <span className="text-[10px] font-serif text-slate-400 tracking-widest block">
                      道德經
                    </span>
                  </div>
                </motion.div>
              </div>

              {/* Serene Progress & Text */}
              <div className="space-y-2 max-w-sm px-4">
                <div className="text-sm font-serif font-medium text-slate-700 tracking-wider">
                  {drawnLotNotice || "心隨水靜，正在翻閱一章道德經智慧..."}
                </div>
                <p className="text-xs text-slate-400 font-light italic">
                  不求吉凶，但觀本心 ‧ 順應自然之流
                </p>
                <div className="w-52 h-1.5 bg-slate-100 rounded-full overflow-hidden mx-auto mt-3">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-brand-pink via-rose-300 to-brand-blue rounded-full transition-all duration-300"
                    style={{ width: `${drawingProgress}%` }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Initial Empty State / Mindful Flip Button */}
        {!chapter && !drawing && viewTab === 'fortune' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center text-center my-6"
          >
            <motion.button
              disabled={drawing}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={draw}
              className="relative group mt-4 mb-6 cursor-pointer"
            >
              <div className="absolute inset-0 bg-brand-pink/20 blur-2xl group-hover:bg-brand-pink/30 transition-all rounded-full" />
              <div className="relative w-44 h-44 md:w-52 md:h-52 bg-white/90 backdrop-blur-sm border border-brand-pink/25 rounded-full shadow-soft flex flex-col items-center justify-center space-y-3 group-hover:border-brand-pink/50 transition-all">
                <div className="w-14 h-14 rounded-full bg-brand-pink/10 flex items-center justify-center group-hover:bg-brand-pink/20 transition-colors">
                  <BookOpen className="w-7 h-7 text-brand-pink" />
                </div>
                <div className="space-y-0.5">
                  <span className="text-base font-serif font-medium tracking-widest text-slate-800 block">
                    隨心翻閱
                  </span>
                  <span className="text-[10px] font-light tracking-[0.2em] text-slate-400 uppercase block">
                    Explore a Chapter
                  </span>
                </div>
              </div>
            </motion.button>

            <p className="text-xs text-slate-400 font-serif italic tracking-wider max-w-sm mt-2 leading-relaxed">
              心有所感，便向經典尋答案；每一篇《道德經》，都是映照當下心靈的一汪清泉。
            </p>
          </motion.div>
        )}

        {/* Detailed Chapter Result View */}
        <AnimatePresence mode="wait">
          {chapter && !drawing && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-4xl space-y-8"
            >
              <div className="glass-card p-6 md:p-14 space-y-8 relative overflow-hidden bg-[#FDFCFB] border-slate-100 shadow-xl" ref={detailRef}>
                {/* Favorite & Re-flip Quick Action - Top Right */}
                <div className="absolute top-4 right-4 md:top-8 md:right-8 z-20 flex items-center space-x-2">
                  <button
                    onClick={draw}
                    disabled={drawing}
                    className="p-3 rounded-full transition-all shadow-soft text-slate-400 hover:text-brand-pink bg-white border border-slate-100 hover:border-brand-pink/20 cursor-pointer"
                    title="翻開新篇"
                  >
                    <RefreshCw className={cn("w-4 h-4", drawing && "animate-spin")} />
                  </button>

                  <button
                    onClick={toggleFavorite}
                    disabled={favoriting}
                    className={cn(
                      "p-3 rounded-full transition-all shadow-soft cursor-pointer",
                      favoriting
                        ? "bg-slate-100 text-slate-300 cursor-not-allowed"
                        : favorites.includes(chapter?.number || 0)
                          ? "bg-brand-pink text-white shadow-lg"
                          : "text-brand-pink bg-white border border-brand-pink/10 hover:bg-brand-pink/5"
                    )}
                    title={favorites.includes(chapter?.number || 0) ? '已典藏篇章' : '典藏篇章'}
                  >
                    <Heart className={cn("w-4 h-4", favorites.includes(chapter?.number || 0) && "fill-current")} />
                  </button>
                </div>

                {/* Chapter Banner & Number */}
                <div className="flex flex-col items-center mb-6 relative z-10 text-center">
                  <div className="flex items-center space-x-2 text-slate-400 text-xs mb-1">
                    <span>老子《道德經》</span>
                    <span>·</span>
                    <span className="font-mono">第 {chapter.number} 章</span>
                  </div>

                  <h3 className="text-2xl md:text-3xl font-serif font-light text-slate-800 tracking-wider mt-1">
                    {chapter.title}
                  </h3>
                  
                  {/* Contemplative Theme Badge */}
                  {chapter.sign && (
                    <motion.div 
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="mt-3 inline-flex items-center space-x-2 px-4 py-1 rounded-full bg-brand-pink/10 border border-brand-pink/20 text-brand-pink shadow-sm"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span className="text-xs md:text-sm font-serif font-medium tracking-widest">{chapter.sign}</span>
                    </motion.div>
                  )}

                  <div className="text-8xl md:text-[110px] font-serif font-light text-brand-pink/15 tracking-tighter -mt-3 md:-mt-5 -mb-4 md:-mb-8 select-none pointer-events-none">
                     {chapter.number < 10 ? `0${chapter.number}` : chapter.number}
                  </div>
                </div>

                {/* Body Content */}
                <div className="prose prose-slate max-w-none serif-text min-h-[300px] relative z-10 overflow-x-hidden">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-slate-600 leading-relaxed text-[15px] md:text-[16px] text-justify font-serif"
                    style={{ wordBreak: 'break-all' }}
                  >
                    <ReactMarkdown 
                      components={{ 
                        h1: () => null,
                        h3: ({ children }) => (
                          <div className="flex items-center space-x-2 mt-10 mb-6 border-b border-slate-50 pb-2">
                            <span className="text-brand-pink font-light">·</span>
                            <span className="text-xs md:text-sm tracking-widest text-brand-pink font-medium uppercase">{children}</span>
                          </div>
                        ),
                        p: ({ children }) => {
                          const text = Array.isArray(children) ? children.join('') : children?.toString() || '';
                          if (text.includes('open-quote')) {
                            const quoteContent = text.replace(/open-quote/g, '').replace(/close-quote/g, '').trim();
                            const words = chapter?.wordAnalysis || [];
                            
                            const renderInteractiveText = (fullText: string) => {
                              let elements: (string | React.ReactNode)[] = [fullText];
                              const sortedWords = [...words].sort((a, b) => b.word.length - a.word.length);
                              
                              sortedWords.forEach((analysis, wordIdx) => {
                                const newElements: (string | React.ReactNode)[] = [];
                                let occurrenceCount = 0;
                                elements.forEach((el) => {
                                  if (typeof el === 'string') {
                                    const parts = el.split(analysis.word);
                                    parts.forEach((part, i) => {
                                      newElements.push(part);
                                      if (i < parts.length - 1) {
                                        newElements.push(
                                          <span
                                            key={`${analysis.word}-${wordIdx}-${occurrenceCount++}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setActiveWord(analysis);
                                            }}
                                            className="cursor-pointer border-b border-brand-pink/40 text-slate-900 font-medium px-0.5 mx-0.5 hover:bg-brand-pink/10 transition-colors"
                                            title="點擊探析字義"
                                          >
                                            {analysis.word}
                                          </span>
                                        );
                                      }
                                    });
                                  } else {
                                    newElements.push(el);
                                  }
                                });
                                elements = newElements;
                              });
                              return elements;
                            };

                            return (
                              <div 
                                onClick={() => setShowAllAnalysis(true)}
                                className="my-10 md:my-14 py-10 md:py-12 px-6 md:px-12 bg-slate-50/60 border-y border-slate-100/80 text-slate-800 font-serif text-lg md:text-xl leading-relaxed text-center relative group cursor-pointer hover:bg-slate-50 transition-colors whitespace-pre-wrap"
                              >
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                                  <div className="bg-white px-4 py-1 border border-slate-100 rounded-full flex items-center space-x-1.5 shadow-sm">
                                    <BookOpen className="w-3 h-3 text-brand-pink" />
                                    <span className="text-[10px] tracking-widest text-slate-500 font-medium">篇章原文</span>
                                  </div>
                                </div>

                                <div className="relative">
                                  {renderInteractiveText(quoteContent)}
                                </div>

                                <div className="flex justify-center mt-6">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowAllAnalysis(true);
                                    }}
                                    className="flex items-center space-x-1.5 px-4 py-1.5 rounded-full bg-brand-pink/10 text-brand-pink border border-brand-pink/20 hover:bg-brand-pink hover:text-white transition-all text-[11px] font-medium tracking-wider shadow-sm cursor-pointer"
                                  >
                                    <Info className="w-3.5 h-3.5" />
                                    <span>字句探義 ({words.length})</span>
                                  </button>
                                </div>
                              </div>
                            );
                          }
                          return <p className="mb-6 leading-relaxed opacity-90">{children}</p>;
                        },
                        ul: ({ children }) => <ul className="list-disc pl-5 mb-8 space-y-4 text-slate-500">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-5 mb-8 space-y-6 text-slate-500">{children}</ol>,
                        li: ({ children }) => (
                          <li className="pl-1">
                            <span className="text-slate-600 leading-relaxed">{children}</span>
                          </li>
                        )
                      }}
                    >
                      {chapter.detail}
                    </ReactMarkdown>
                  </motion.div>
                </div>

                {/* Gentle prompt */}
                <AnimatePresence>
                  {showPrompt && !reflection && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="bg-brand-blue/10 border border-brand-blue/20 p-4 rounded-2xl flex items-start space-x-3"
                    >
                      <Sparkles className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-600 leading-relaxed italic">
                        「 親愛的朋友，靜下心來觀照：這份古聖先賢的篇章智慧，此刻帶給您什麼樣的微光與體悟呢？ 」
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Reflection input section */}
                <div className="pt-8 border-t border-slate-100 space-y-4">
                  <div className="flex items-center space-x-2">
                    <MessageSquareText className="w-4 h-4 text-brand-pink" />
                    <h4 className="text-xs font-medium tracking-wider text-slate-500 uppercase">當下體悟 ‧ 讀後觀照</h4>
                  </div>
                  <textarea
                    value={reflection}
                    onChange={(e) => setReflection(e.target.value)}
                    placeholder="讀完這篇，在您的生活或心境中激起了什麼樣的漣漪與體悟呢？在此記下與經典的對話..."
                    className="w-full h-32 p-4 bg-brand-pink/5 border border-transparent rounded-2xl focus:border-brand-pink focus:bg-white outline-none transition-all font-light text-slate-600 italic text-sm"
                  />
                  <div className="flex justify-end items-center space-x-3">
                    <AnimatePresence>
                      {showSavedFeedback && (
                        <motion.div
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className="text-xs font-serif italic text-brand-pink flex items-center space-x-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>體悟已收錄於閱讀足跡 ✨</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <button
                      disabled={saving || !reflection.trim()}
                      onClick={saveReflection}
                      className="px-6 py-2.5 bg-slate-800 text-white rounded-full text-xs tracking-wider uppercase hover:bg-slate-700 transition-colors flex items-center space-x-2 disabled:opacity-30 cursor-pointer"
                    >
                      {saving ? (
                        <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>儲存體悟</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Bottom Navigation & Export */}
                <div className="pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-slate-100">
                  <div className="flex items-center space-x-3">
                    <button 
                      onClick={() => {
                        setChapter(null);
                        setViewTab('history');
                      }}
                      className="flex items-center space-x-2 text-slate-400 hover:text-brand-pink transition-colors text-xs tracking-wider cursor-pointer"
                    >
                      <ArrowRight className="w-3 h-3 rotate-180" />
                      <span>查看足跡</span>
                    </button>

                    <button 
                      onClick={draw}
                      className="flex items-center space-x-1.5 px-4 py-2 rounded-full bg-brand-pink/10 hover:bg-brand-pink text-brand-pink hover:text-white transition-all text-xs font-serif tracking-wider cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>翻開新篇</span>
                    </button>
                  </div>

                  <div className="flex items-center space-x-3">
                    <button
                      onClick={exportAsImage}
                      disabled={isExporting}
                      className={cn(
                        "flex items-center space-x-2 transition-all text-xs tracking-wider px-4 py-2 rounded-full shadow-soft cursor-pointer",
                        isExporting 
                          ? "bg-slate-100 text-slate-300 cursor-not-allowed" 
                          : "text-slate-600 hover:text-brand-blue bg-white border border-slate-100 hover:border-brand-blue/30"
                      )}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{isExporting ? '匯出中...' : '匯出圖片'}</span>
                    </button>

                    <button
                      onClick={exportAsPDF}
                      disabled={isExporting}
                      className={cn(
                        "flex items-center space-x-2 transition-all text-xs tracking-wider px-4 py-2 rounded-full shadow-soft cursor-pointer",
                        isExporting 
                          ? "bg-slate-100 text-slate-300 cursor-not-allowed" 
                          : "text-slate-600 hover:text-brand-pink bg-white border border-slate-100 hover:border-brand-pink/30"
                      )}
                    >
                      <div className="w-3.5 h-3.5 flex items-center justify-center font-bold text-[8px] border border-current rounded-sm">PDF</div>
                      <span>{isExporting ? '匯出中...' : '匯出PDF'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* History View */}
      {(viewTab === 'history' || (!chapter && !drawing)) && (
        <div className="pt-12 w-full max-w-4xl px-4 mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-3">
              <History className="w-4 h-4 text-slate-400" />
              <h3 className="text-xs md:text-sm tracking-widest text-slate-500 font-medium uppercase">閱讀足跡與體悟</h3>
            </div>
            <div className="text-[11px] text-slate-400 italic">點擊任意紀錄檢視完整篇章</div>
          </div>
          
          <div className="grid gap-4 md:gap-5">
            {history.map((record) => {
              const local = getLaoziChapter(record.chapterNumber);
              const displayTitle = record.title || local.title;
              const displaySign = record.sign || local.sign;
              const displayText = record.chapterText || local.original;

              return (
                <motion.div 
                  key={record.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ y: -2, backgroundColor: 'rgba(255, 255, 255, 0.75)' }}
                  onClick={() => viewHistory(record)}
                  className="glass-card p-5 md:p-6 flex items-center space-x-4 md:space-x-8 cursor-pointer border-white/80 bg-white/50 group relative overflow-hidden transition-all duration-300"
                >
                  <div className="absolute top-0 left-0 w-1 md:w-1.5 h-full bg-slate-100 group-hover:bg-brand-pink/50 transition-colors" />
                  
                  <div className="flex flex-col items-center shrink-0 w-12 md:w-14">
                    <div className="text-[8px] md:text-[9px] text-slate-400 font-mono tracking-wider uppercase">CH.</div>
                    <div className="text-2xl md:text-3xl font-serif font-light text-slate-800 transition-colors group-hover:text-brand-pink">
                      {record.chapterNumber < 10 ? `0${record.chapterNumber}` : record.chapterNumber}
                    </div>
                  </div>

                  <div className="flex-1 space-y-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] md:text-xs font-serif font-medium text-brand-pink">
                          {displaySign}
                        </span>
                        <span className="text-slate-300 text-[10px]">·</span>
                        <span className="text-[11px] md:text-xs text-slate-600 font-serif">
                          {displayTitle}
                        </span>
                        {favorites.includes(record.chapterNumber) && (
                          <Heart className="w-2.5 h-2.5 text-brand-pink fill-current ml-1" />
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-serif">
                        {(() => {
                          try {
                            const date = record.drawnAt?.toDate ? record.drawnAt.toDate() : (record.drawnAt instanceof Date ? record.drawnAt : new Date());
                            return date.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric' });
                          } catch {
                            return '---';
                          }
                        })()}
                      </div>
                    </div>
                    
                    <p className="text-[12px] md:text-sm text-slate-500 font-serif italic line-clamp-1 tracking-wider leading-relaxed transition-colors group-hover:text-slate-800">
                      「 {displayText} 」
                    </p>
                  </div>

                  <div className="hidden sm:flex w-8 h-8 rounded-full border border-slate-100 flex items-center justify-center group-hover:bg-brand-pink group-hover:border-transparent transition-all shrink-0 shadow-sm">
                    <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-white transition-colors" />
                  </div>
                </motion.div>
              );
            })}
            
            {history.length === 0 && (
              <div className="glass-card p-14 text-center space-y-4 bg-white/20 border-dashed border-slate-200">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <BookOpen className="w-5 h-5 text-brand-pink/50" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-slate-600 font-serif italic text-sm tracking-wider">
                    每一次翻開經典，都是與自性智慧的溫柔相遇。
                  </p>
                  <p className="text-slate-400 text-xs tracking-wider">點擊上方「隨心翻閱」即可翻開一篇道德經篇章</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active Word Modal */}
      <AnimatePresence>
        {activeWord && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveWord(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white/95 rounded-[2rem] shadow-2xl overflow-hidden border border-white/50 flex flex-col"
            >
              <div className="p-6 md:p-8 flex flex-col">
                <div className="flex items-center justify-between border-b border-slate-50 pb-4 mb-6 shrink-0">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-brand-pink/10 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-brand-pink" />
                    </div>
                    <div className="font-serif text-slate-700 tracking-wider font-medium text-lg">字句探義</div>
                  </div>
                  <button 
                    onClick={() => setActiveWord(null)}
                    className="p-2 hover:bg-slate-50 rounded-full text-slate-400 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="flex flex-col items-center text-center">
                    <div className="text-3xl md:text-4xl font-serif text-brand-pink tracking-widest font-medium mb-1">
                      {activeWord.word}
                    </div>
                    {activeWord.pronunciation && (
                      <span className="text-xs text-slate-400 font-serif tracking-[0.25em] font-light italic">
                        {activeWord.pronunciation}
                      </span>
                    )}
                  </div>

                  <div className="w-full text-center py-2">
                    <p className="text-slate-600 leading-relaxed text-base italic px-4 font-serif">
                      {activeWord.meaning}
                    </p>
                    {activeWord.extraMeaning && (
                      <div className="mt-3 text-xs text-slate-400 font-serif italic border-t border-slate-100 pt-3 px-4">
                        延伸啟發：{activeWord.extraMeaning}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-center pt-2">
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setActiveWord(null)}
                      className="px-10 py-2.5 bg-brand-pink text-white rounded-2xl text-xs tracking-wider font-serif shadow-lg hover:bg-brand-pink/90 transition-all cursor-pointer"
                    >
                      返回原文
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Show All Analysis Modal */}
      <AnimatePresence>
        {showAllAnalysis && chapter && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAllAnalysis(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white/95 rounded-[2rem] shadow-2xl overflow-hidden border border-white/50 flex flex-col max-h-[85vh]"
            >
              <div className="p-6 md:p-8 flex flex-col h-full overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-50 pb-4 mb-6 shrink-0">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-brand-pink/10 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-brand-pink" />
                    </div>
                    <span className="font-serif text-slate-700 tracking-wider font-medium text-base md:text-lg">
                      第 {chapter.number} 章 ‧ 字句探義
                    </span>
                  </div>
                  <button 
                    onClick={() => setShowAllAnalysis(false)}
                    className="p-2 hover:bg-slate-50 rounded-full text-slate-400 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                  {(chapter.wordAnalysis || []).map((analysis, idx) => (
                    <div 
                      key={idx}
                      className="p-4 rounded-2xl bg-slate-50/60 border border-slate-100 hover:bg-brand-pink/5 hover:border-brand-pink/20 transition-all cursor-pointer"
                      onClick={() => {
                        setShowAllAnalysis(false);
                        setActiveWord(analysis);
                      }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-serif text-slate-800 font-medium text-base tracking-wider">
                          {analysis.word}
                        </span>
                        {analysis.pronunciation && (
                          <span className="text-[11px] text-slate-400 font-serif italic">
                            {analysis.pronunciation}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 font-serif leading-relaxed">
                        {analysis.meaning}
                      </p>
                      {analysis.extraMeaning && (
                        <p className="text-[11px] text-slate-400 font-serif italic mt-1.5 border-t border-slate-100 pt-1.5">
                          {analysis.extraMeaning}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-slate-50 flex justify-center shrink-0">
                  <button
                    onClick={() => setShowAllAnalysis(false)}
                    className="px-8 py-2 bg-slate-800 text-white rounded-full text-xs tracking-wider uppercase hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    關閉
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
