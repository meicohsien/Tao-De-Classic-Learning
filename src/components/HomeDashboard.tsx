import { useState, useEffect, useMemo } from 'react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Sparkles, BarChart3, History, Calendar, Award, TrendingUp, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { getLaoziChapter } from '../data/laoziChapters';

interface Entry {
  id: string;
  content: string;
  type: 'material' | 'reflection' | 'note';
  createdAt: any;
  mood?: string;
  feedback?: string;
}

interface FortuneDraw {
  id: string;
  chapterNumber: number;
  drawnAt: any;
  reflection: string;
  chapterText?: string;
  detail?: string;
}

interface CombinedInsight {
  id: string;
  type: 'fortune' | 'journal';
  date: Date;
  title: string;
  original: string;
  insight: string;
  meta: string;
  chapterNumber?: number;
}

interface HomeDashboardProps {
  onNavigate?: (type: 'fortune' | 'journal', idOrNum: string | number) => void;
}

export function HomeDashboard({ onNavigate }: HomeDashboardProps = {}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [fortunes, setFortunes] = useState<FortuneDraw[]>([]);

  useEffect(() => {
    if (!auth.currentUser) return;
    
    // Fetch Journal Entries
    const entriesPath = `users/${auth.currentUser.uid}/entries`;
    const qEntries = query(
      collection(db, entriesPath),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsubscribeEntries = onSnapshot(qEntries, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Entry));
      setEntries(data);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, entriesPath);
    });

    // Fetch Fortune History
    const fortunesPath = `users/${auth.currentUser.uid}/laozi_draws`;
    const qFortunes = query(
      collection(db, fortunesPath),
      orderBy('drawnAt', 'desc'),
      limit(20)
    );

    const unsubscribeFortunes = onSnapshot(qFortunes, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FortuneDraw));
      setFortunes(data.filter(f => f.reflection && f.reflection.trim() !== ''));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, fortunesPath);
    });

    return () => {
      unsubscribeEntries();
      unsubscribeFortunes();
    };
  }, []);

  const chartData = useMemo(() => {
    return [...entries]
      .filter(e => e.mood)
      .reverse()
      .map(e => {
        const moodStr = String(e.mood || '50:');
        const parts = moodStr.split(':');
        const score = parseInt(parts[0]) || 50;
        
        // Safe date parsing
        let dateStr = '';
        try {
          const date = e.createdAt?.toDate ? e.createdAt.toDate() : (e.createdAt instanceof Date ? e.createdAt : new Date());
          dateStr = date.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
        } catch (err) {
          dateStr = '---';
        }

        return {
          date: dateStr,
          score: score,
          label: parts[1] || '',
        };
      });
  }, [entries]);

  const todayChartData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return [...entries]
      .filter(e => {
        if (!e.mood || !e.createdAt) return false;
        try {
          const date = e.createdAt?.toDate ? e.createdAt.toDate() : (e.createdAt instanceof Date ? e.createdAt : null);
          return date && date >= today;
        } catch {
          return false;
        }
      })
      .reverse()
      .map(e => {
        const moodStr = String(e.mood || '50:');
        const parts = moodStr.split(':');
        const score = parseInt(parts[0]) || 50;
        
        let timeStr = '';
        let fullTimeStr = '';
        try {
          const date = e.createdAt?.toDate ? e.createdAt.toDate() : (e.createdAt instanceof Date ? e.createdAt : new Date());
          timeStr = date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
          fullTimeStr = date.toLocaleTimeString('zh-TW');
        } catch {
          timeStr = '--:--';
          fullTimeStr = '--:--:--';
        }

        return {
          time: timeStr,
          score: score,
          fullTime: fullTimeStr,
          label: parts[1] || '',
        };
      });
  }, [entries]);

  // Combine both into a single growth timeline
  const growthTimeline = useMemo(() => {
    const items: CombinedInsight[] = [];

    // Add Journals with feedback (Mindset shifts)
    entries.forEach(e => {
      if (e.feedback) {
        let entryDate = new Date();
        try {
          entryDate = e.createdAt?.toDate ? e.createdAt.toDate() : (e.createdAt instanceof Date ? e.createdAt : new Date());
        } catch {}

        items.push({
          id: e.id,
          type: 'journal',
          date: entryDate,
          title: '心靈覺察 ‧ 轉念',
          original: (e.content || '').length > 50 ? (e.content || '').slice(0, 50) + "..." : (e.content || ''),
          insight: String(e.feedback || '').split(/### 💡 (?:輕輕)?轉念/)[1]?.split('###')[0]?.trim() || "紀錄一份成長體悟...",
          meta: String(e.mood || '').split(':')[1] || '平靜'
        });
      }
    });

    // Add Fortunes with reflection
    fortunes.forEach(f => {
      let drawDate = new Date();
      try {
        drawDate = f.drawnAt?.toDate ? f.drawnAt.toDate() : (f.drawnAt instanceof Date ? f.drawnAt : new Date());
      } catch {}

      const local = getLaoziChapter(f.chapterNumber);
      const originalText = f.chapterText || (f.detail?.match(/open-quote ([\s\S]*?) close-quote/)?.[1]?.trim()) || local.original;
      const originalSnippet = originalText.length > 40 ? originalText.slice(0, 40) + "..." : originalText;

      items.push({
        id: f.id,
        type: 'fortune',
        date: drawDate,
        title: `智慧啟發 ‧ 第${f.chapterNumber}章`,
        original: originalSnippet,
        insight: f.reflection || "靜候啟迪流動...",
        meta: `道德經 第${f.chapterNumber}章`,
        chapterNumber: f.chapterNumber
      });
    });

    return items.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 15);
  }, [entries, fortunes]);

  const stats = useMemo(() => ({
    totalInsights: growthTimeline.length,
    activeDays: new Set([...entries, ...fortunes].map(f => {
      try {
        const timestamp = (f as any).createdAt || (f as any).drawnAt;
        const date = timestamp?.toDate ? timestamp.toDate() : (timestamp instanceof Date ? timestamp : null);
        return date?.toDateString();
      } catch {
        return null;
      }
    }).filter(Boolean)).size,
    avgMood: entries.length > 0 ? (entries.reduce((acc, curr) => {
      let score = 50;
      try {
        score = parseInt(String(curr.mood || '').split(':')[0] || '50') || 50;
      } catch {}
      return acc + score;
    }, 0) / entries.length).toFixed(1) : '50.0'
  }), [entries, fortunes, growthTimeline]);

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-20">
      {/* Dynamic Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 md:gap-10">
        <div className="space-y-4 max-w-xl">
          <div className="flex items-center space-x-2 text-brand-pink">
            <TrendingUp className="w-4 h-4" />
            <span className="text-[10px] tracking-[0.4em] uppercase font-bold">Growth Momentum</span>
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif font-light text-slate-800 tracking-[0.05em] md:tracking-[0.1em]">成長之徑</h2>
          <p className="text-slate-400 font-light italic text-sm md:text-base tracking-widest leading-relaxed">
            每一步修持，都是與更智慧的自己相遇。
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 md:gap-10 border-t md:border-t-0 pt-6 md:pt-0 border-slate-100">
          <div className="flex flex-col items-center md:items-start group">
            <span className="text-[8px] md:text-[10px] text-slate-300 tracking-[0.1em] md:tracking-[0.2em] uppercase mb-1 md:mb-2 group-hover:text-brand-pink transition-colors">修持天數</span>
            <div className="flex items-baseline space-x-0.5 md:space-x-1">
              <span className="text-xl md:text-4xl font-light text-slate-700 font-serif">{stats.activeDays}</span>
              <span className="text-[8px] md:text-[10px] text-slate-300 serif-text italic">日</span>
            </div>
          </div>
          <div className="flex flex-col items-center md:items-start group">
            <span className="text-[8px] md:text-[10px] text-slate-300 tracking-[0.1em] md:tracking-[0.2em] uppercase mb-1 md:mb-2 group-hover:text-brand-pink transition-colors">智慧體悟</span>
            <div className="flex items-baseline space-x-0.5 md:space-x-1">
              <span className="text-xl md:text-4xl font-light text-brand-pink font-serif">{stats.totalInsights}</span>
              <span className="text-[8px] md:text-[10px] text-brand-pink/40 serif-text italic">則</span>
            </div>
          </div>
          <div className="flex flex-col items-center md:items-start group">
            <span className="text-[8px] md:text-[10px] text-slate-300 tracking-[0.1em] md:tracking-[0.2em] uppercase mb-1 md:mb-2 group-hover:text-brand-pink transition-colors">平均能量</span>
            <div className="flex items-baseline space-x-0.5 md:space-x-1">
              <span className="text-xl md:text-4xl font-light text-slate-400 font-serif">{stats.avgMood}</span>
              <span className="text-[8px] md:text-[10px] text-slate-300 serif-text italic">%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-10">
        {/* Left Column: Timeline */}
        <div className="lg:col-span-2 space-y-8">
          <div className="flex items-center space-x-3 mb-2">
            <History className="w-4 h-4 text-slate-400" />
            <h3 className="text-xs tracking-[0.2em] font-medium text-slate-500 uppercase">修持時間軸</h3>
          </div>

          <div className="relative pl-8 space-y-12 before:content-[''] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[0.5px] before:bg-slate-100">
            {growthTimeline.length > 0 ? growthTimeline.map((item, idx) => (
              <motion.div 
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="relative"
              >
                {/* Timeline Dot */}
                <div className={cn(
                  "absolute -left-[35px] top-1.5 w-4 font-serif h-4 rounded-full border-2 border-white ring-4 ring-slate-50 bg-white flex items-center justify-center transition-all group-hover:scale-125",
                  item.type === 'fortune' ? "bg-brand-pink ring-brand-pink/5" : "bg-brand-blue ring-brand-blue/5"
                )} />
                
                <div 
                  onClick={() => {
                    if (onNavigate) {
                      if (item.type === 'journal') {
                        onNavigate('journal', item.id);
                      } else if (item.type === 'fortune' && item.chapterNumber) {
                        onNavigate('fortune', item.chapterNumber);
                      }
                    }
                  }}
                  className="group flex flex-col md:flex-row gap-4 md:gap-8 hover:translate-x-1 transition-transform cursor-pointer"
                >
                  <div className="min-w-[100px] pt-1">
                    <div className="text-[10px] text-slate-300 font-serif mb-1 capitalize italic">{item.date.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric' })}</div>
                    <div className="text-[9px] tracking-widest text-slate-400 uppercase font-medium">{item.meta}</div>
                  </div>

                  <div className="flex-1 glass-card p-6 bg-white/40 group-hover:bg-white/80 transition-all border-l-2 border-l-transparent hover:border-l-brand-pink/30 shadow-sm hover:shadow-md">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-2">
                      <h4 className="text-[11px] tracking-[0.2em] text-slate-800 font-bold uppercase flex items-center gap-2">
                        {item.type === 'fortune' ? <Award className="w-3 h-3 text-brand-pink" /> : <Sparkles className="w-3 h-3 text-brand-blue" />}
                        {item.title}
                      </h4>
                      <div className="px-2 py-0.5 rounded-full bg-slate-50 text-[8px] text-slate-400 font-medium flex items-center gap-1 w-fit">
                        {item.type === 'fortune' ? '智慧體悟' : '轉念瞬間'}
                      </div>
                    </div>
                    
                    <p className="handwritten text-lg md:text-xl text-slate-700 leading-relaxed mb-6 line-clamp-3 md:line-clamp-4">
                      {item.insight}
                    </p>

                    <div className="pt-4 border-t border-slate-100/50 flex flex-col space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="w-1 h-1 rounded-full bg-slate-200" />
                          <div className="text-[10px] text-slate-400 italic serif-text line-clamp-1 opacity-70">
                            {item.type === 'journal' ? '原初情境：' : '篇章啟發：'} 「{item.original}」
                          </div>
                        </div>
                        <span className="text-[9px] text-brand-pink opacity-0 group-hover:opacity-100 transition-opacity font-serif font-light tracking-wider flex items-center gap-1 shrink-0">
                          前往原文 <ChevronRight className="w-2.5 h-2.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )) : (
              <div className="glass-card p-20 text-center">
                <div className="text-slate-300 italic text-sm font-light mb-4">這是一條等待您踏出的成長之路...</div>
                <div className="text-[9px] tracking-widest text-slate-200 uppercase">Begin your journey today</div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Visual Insights & Stats */}
        <div className="space-y-10">
          {/* Today's Energy Pulse (New) */}
          <div className="glass-card p-8 bg-white/80 border-brand-pink/10 shadow-soft">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-brand-pink" />
                <h3 className="text-[11px] tracking-[0.2em] uppercase text-slate-600 font-bold">今日起伏</h3>
              </div>
              <span className="text-[9px] text-slate-300 font-serif italic">Today's Pulse</span>
            </div>

            <div className="h-44 w-full mb-4">
              {todayChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={todayChartData}>
                    <defs>
                      <linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FFD1DC" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#FFD1DC" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" hide />
                    <YAxis hide domain={[0, 100]} />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white/90 backdrop-blur-md border border-brand-pink/10 shadow-xl p-3 rounded-2xl">
                              <p className="text-[10px] text-slate-400 font-serif mb-1">{payload[0].payload.fullTime}</p>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-brand-pink" />
                                <span className="text-sm font-bold text-slate-700">{payload[0].value}</span>
                                <span className="text-[11px] text-slate-400 font-light">{payload[0].payload.label}</span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area 
                      type="monotone"
                      dataKey="score" 
                      stroke="#FFD1DC" 
                      strokeWidth={2}
                      fill="url(#energyGradient)"
                      activeDot={{ r: 6, fill: '#fff', stroke: '#FFD1DC', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center space-y-2 opacity-30">
                  <Sparkles className="w-6 h-6 text-slate-300" />
                  <span className="text-[10px] tracking-widest text-slate-400">今日尚無能量數據</span>
                </div>
              )}
            </div>

            {todayChartData.length > 0 && (
              <div className="flex items-center justify-between pt-5 border-t border-slate-50/50">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <div className={cn(
                      "w-3 h-3 rounded-full blur-[2px] animate-pulse absolute inset-0",
                      todayChartData[todayChartData.length - 1].score > 60 ? "bg-emerald-400/50" : "bg-brand-pink/50"
                    )} />
                    <div className={cn(
                      "w-3 h-3 rounded-full relative z-10",
                      todayChartData[todayChartData.length - 1].score > 60 ? "bg-emerald-400" : "bg-brand-pink"
                    )} />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-600 font-serif font-medium leading-none mb-1">
                      此刻能量：{todayChartData[todayChartData.length - 1].score}%
                    </div>
                    <div className="text-[9px] text-slate-400 tracking-wider">
                      {todayChartData[todayChartData.length - 1].score > 60 ? '盈潤流動中' : '靜候潮起時'}
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 px-3 py-1 rounded-full">
                  <span className="text-[10px] text-slate-400 italic serif-text tracking-wide">
                    {todayChartData[todayChartData.length - 1].label || '平和'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Energy Trend */}
          <div className="glass-card p-8 bg-white/70 overflow-hidden relative">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-brand-pink/5 rounded-full blur-2xl" />
            
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center space-x-2">
                <BarChart3 className="w-4 h-4 text-slate-400" />
                <h3 className="text-[10px] tracking-widest uppercase text-slate-500 font-bold">歷史趨勢</h3>
              </div>
              <span className="text-[9px] text-slate-200 tracking-widest font-mono">PAST 30 ENTRIES</span>
            </div>

            <div className="h-40 w-full">
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis 
                      dataKey="date" 
                      hide
                    />
                    <YAxis hide domain={[0, 100]} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontSize: '10px' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="score" 
                      stroke="#cbd5e1" 
                      strokeWidth={1.5} 
                      dot={false}
                      activeDot={{ r: 4, fill: '#cbd5e1' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-200 italic text-xs">
                  智慧軌跡匯聚中...
                </div>
              )}
            </div>
          </div>

          {/* Quick Reflection prompt or material shortcut? */}
          <div className="glass-card p-8 bg-brand-pink/5 border-dashed border-brand-pink/20">
            <div className="flex items-center space-x-2 mb-4">
              <Calendar className="w-4 h-4 text-brand-pink" />
              <h3 className="text-[10px] tracking-widest uppercase text-brand-pink font-bold">修持小語</h3>
            </div>
            <p className="serif-text text-sm italic text-slate-600 leading-loose">
              「合抱之木，生於毫末；九層之台，起於累土；千里之行，始於足下。」
            </p>
            <div className="mt-6 text-right">
              <span className="text-[9px] text-slate-300 uppercase tracking-widest italic">— 老子 ‧ 道德經</span>
            </div>
          </div>

          {/* Activity distribution? or just branding */}
          <div className="p-8 text-center space-y-4">
            <div className="w-8 h-[1px] bg-slate-100 mx-auto" />
            <p className="text-[9px] tracking-[0.3em] text-slate-300 uppercase font-light leading-relaxed">
              道在平常 ‧ 心在當下<br/>
              願智慧常伴您的隨行之路
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
