'use client';

import * as React from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToastMessage } from '@/types';

interface ToastContextValue {
  toasts: ToastMessage[];
  addToast: (type: ToastMessage['type'], message: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const addToast = React.useCallback((type: ToastMessage['type'], message: string) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, type, message }]);
    window.setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 3000);
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const value = React.useMemo(() => ({
    toasts,
    addToast,
    removeToast,
  }), [addToast, removeToast, toasts]);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-[#36D399]" />,
    error: <XCircle className="w-5 h-5 text-[#F87272]" />,
    warning: <AlertCircle className="w-5 h-5 text-[#FBBD23]" />,
    info: <Info className="w-5 h-5 text-[#165DFF]" />,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={cn(
              'flex items-start gap-3 px-4 py-3 rounded-lg bg-white border border-[#E5E6EB] shadow-lg',
              'animate-in slide-in-from-right-5 fade-in-0 duration-300'
            )}
          >
            {icons[toast.type]}
            <p className="flex-1 text-sm text-[#1D2129]">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-[#86909C] hover:text-[#1D2129] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
