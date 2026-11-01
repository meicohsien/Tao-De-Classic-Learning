import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Journal } from './Journal';
import { LaoziFortune } from './LaoziFortune';
import { HomeDashboard } from './HomeDashboard';
import { LogOut, BookOpen, PenLine, Sparkles, LayoutDashboard, Heart } from 'lucide-react';
import { auth } from '../lib/firebase';
import { cn } from '../lib/utils';
import { FavoritesView } from './FavoritesView';

type Tab = 'home' | 'journal' | 'laozi' | 'favorites';

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [focusedJournalId, setFocusedJournalId] = useState<string | null>(null);
  const [focusedChapterNumber, setFocusedChapterNumber] = useState<number | null>(null);

  const tabs = [
    { id: 'home', label: '成長映照', icon: LayoutDashboard },
    { id: 'journal', label: '心靈讀白', icon: PenLine },
    { id: 'laozi', label: '智慧活水', icon: BookOpen },
    { id: 'favorites', label: '智慧典藏', icon: Heart },
  ];

  return (
    <div className="min-h-screen bg-brand-cream flex flex-col">
      {/* Header */}
      <header className="px-6 md:px-8 py-6 md:py-10 flex items-center justify-between">
        <div className="flex items-center space-x-3 md:space-x-4">
          <motion.div 
            whileHover={{ rotate: 15 }}
            className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white shadow-soft flex items-center justify-center border border-brand-pink/10"
          >
            <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-brand-pink" />
          </motion.div>
          <div>
            <h1 className="text-xl md:text-2xl font-serif font-light tracking-[0.2em] text-slate-800">水德清心</h1>
            <p className="text-[9px] md:text-[10px] uppercase tracking-[0.2em] text-brand-pink font-medium mt-0.5 md:mt-1">Gently Growing Together</p>
          </div>
        </div>
        
        <button 
          onClick={() => auth.signOut()}
          className="p-3 text-slate-300 hover:text-brand-pink transition-all bg-white rounded-full shadow-soft"
          title="暫別"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 pb-24">
        <AnimatePresence mode="wait">
          {activeTab === 'home' ? (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <HomeDashboard 
                onNavigate={(type, idOrNum) => {
                  if (type === 'journal') {
                    setFocusedJournalId(idOrNum as string);
                    setActiveTab('journal');
                  } else {
                    setFocusedChapterNumber(idOrNum as number);
                    setActiveTab('laozi');
                  }
                }}
              />
            </motion.div>
          ) : activeTab === 'journal' ? (
            <motion.div
              key="journal"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <Journal 
                focusedId={focusedJournalId}
                onClearFocus={() => setFocusedJournalId(null)}
              />
            </motion.div>
          ) : activeTab === 'laozi' ? (
            <motion.div
              key="laozi"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <LaoziFortune 
                focusedChapterNumber={focusedChapterNumber}
                onClearFocus={() => setFocusedChapterNumber(null)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="favorites"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <FavoritesView />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Persistent Bottom Nav */}
      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white/70 backdrop-blur-lg border border-white/40 shadow-xl rounded-full px-2 py-2 flex items-center space-x-1 z-50">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={cn(
                "flex items-center space-x-2 px-3 sm:px-6 py-3 rounded-full transition-all duration-300",
                isActive 
                  ? "bg-brand-pink text-white shadow-sm" 
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-light tracking-wide hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
