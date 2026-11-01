import { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { motion } from 'framer-motion';
import { Sparkles, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

export function LoginPage() {
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      // Use popup but handle common errors
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        // These are expected if the user clicks twice or closes the window
        console.warn('Popup closed or request cancelled');
      } else {
        console.error('Login error:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-brand-cream relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-brand-pink/10 rounded-full blur-3xl text-brand-pink/10" />
      <div className="absolute bottom-[-10%] left-[-10%] w-80 h-80 bg-brand-blue/10 rounded-full blur-3xl text-brand-blue/10" />
      
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center space-y-8 z-10"
      >
        <div className="space-y-4">
          <div className="inline-block p-4 bg-white rounded-full shadow-sm">
            <Sparkles className="w-10 h-10 text-brand-pink/40" />
          </div>
          
          <h1 className="text-3xl md:text-4xl font-serif font-light tracking-widest text-slate-700">
            水德清心
          </h1>
          <p className="text-slate-400 font-light italic text-sm tracking-[0.1em]">
            自我觀照與成長陪伴
          </p>
        </div>

        <div className="pt-10">
          <button
            onClick={login}
            disabled={loading}
            className={cn(
              "w-full py-4 px-6 bg-white border border-brand-pink/30 text-slate-600 rounded-full shadow-sm hover:shadow-md transition-all flex items-center justify-center space-x-3 hover:translate-y-[-2px] disabled:opacity-50 disabled:translate-y-0",
              loading ? "cursor-wait" : ""
            )}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-brand-pink" />
            ) : (
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
            )}
            <span className="font-light tracking-widest">
              {loading ? '連結心靈中...' : '與心靈連結'}
            </span>
          </button>
        </div>
        
        <p className="text-xs text-slate-400/80 pt-8 tracking-wider font-serif">
          用生命點滴，來塑造一個更好的自己
        </p>
      </motion.div>
    </div>
  );
}
