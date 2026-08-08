// ============================================================
// MADO - 前后端拆分后的 API 基础地址配置
// 后端（FastAPI）现在跑在独立的进程/端口上，前端所有请求都要带上这个前缀。
// ============================================================

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:8000';

export const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_BASE_URL?.replace(/\/$/, '') ?? 'ws://localhost:8000';

/** 拼接后端 REST 接口地址，例如 apiUrl('/api/db/tasks') -> http://localhost:8000/api/db/tasks */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/** 拼接后端 WebSocket 地址，例如 wsUrl('/ws/orchestrator') -> ws://localhost:8000/ws/orchestrator */
export function wsUrl(path: string): string {
  return `${WS_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
