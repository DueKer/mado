'use client';

// ============================================================
// MADO - DB 初始化 Provider
// 应用启动时自动初始化数据库表结构
// ============================================================

import { useEffect, useState } from 'react';

interface DBInitProviderProps {
  children: React.ReactNode;
}

export function DBInitProvider({ children }: DBInitProviderProps) {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // 跳过 SSR
        const res = await fetch('/api/db/init', { method: 'POST' });
        const data = await res.json();
        if (!cancelled) {
          if (data.ok) {
            setDbReady(true);
          } else {
            setDbError(data.error ?? 'DB init failed');
          }
        }
      } catch (e) {
        if (!cancelled) {
          setDbError(String(e));
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  if (dbError) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F5F7FA]">
        <div className="text-center p-8 max-w-md">
          <div className="w-12 h-12 rounded-full bg-[#F87272]/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-lg font-semibold text-[#1D2129] mb-2">数据库初始化失败</h2>
          <p className="text-sm text-[#64748B] mb-4">{dbError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[#165DFF] text-white rounded-lg text-sm hover:bg-[#1250D6] transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!dbReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F5F7FA]">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[#165DFF] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[#86909C]">初始化数据库...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
