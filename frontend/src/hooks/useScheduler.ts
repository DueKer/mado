'use client';

// ============================================================
// MADO - 调度器 Hook
// 前后端拆分后：不再直接调用 runOrchestrator，而是通过 WebSocket
// 连接后端 FastAPI 的 /ws/orchestrator，接收流式事件驱动本地状态机。
// ============================================================

import { createContext, createElement, useContext, useReducer, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type {
  AgentId,
  AgentExecution,
  AgentStatus,
  PerAgentConfig,
  Task,
  TaskInput,
  DeliveryResult,
  ModelType,
} from '@/types';
import { generateId } from '@/lib/utils';
import { wsUrl } from '@/lib/api-config';
import { getRiskLevel } from '@/components/tools/ToolApprovalDialog';
import type { PipelineStep } from '@/components/pipeline/PipelineEditor';
import { useHistory } from './useStore';

// -------------------- 调度器状态 --------------------

const MAX_CONCURRENT_TASKS = 3;

interface PendingApproval {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  description?: string;
}

interface RuntimeTaskState {
  id: string;
  name: string;
  input: TaskInput;
  status: Task['status'];
  isRunning: boolean;
  isPaused: boolean;
  currentAgentId: AgentId | null;
  executions: Record<AgentId, AgentExecution>;
  streamBuffer: string;
  error: string | null;
  result: DeliveryResult | null;
  pendingApproval: PendingApproval | null;
  createdAt: number;
  updatedAt: number;
}

interface SchedulerState {
  isRunning: boolean;
  isPaused: boolean;
  currentTaskId: string | null;
  currentAgentId: AgentId | null;
  executions: Record<AgentId, AgentExecution>;
  streamBuffer: string;
  error: string | null;
  result: DeliveryResult | null;
  pendingApproval: PendingApproval | null;
  tasksById: Record<string, RuntimeTaskState>;
  taskOrder: string[];
  activeTaskId: string | null;
  maxTasks: number;
  historyUpdates: Array<{ taskId: string; updates: Partial<Task> }>;
}

type SchedulerAction =
  | { type: 'START_TASK'; taskId: string; input: TaskInput; name: string }
  | { type: 'SET_ACTIVE_TASK'; taskId: string }
  | { type: 'SET_AGENT_STATUS'; taskId?: string; agentId: AgentId; status: AgentStatus; progress?: number }
  | { type: 'SET_AGENT_LOG'; taskId?: string; agentId: AgentId; log: string }
  | { type: 'LOG_CURRENT_AGENT'; taskId?: string; log: string }
  | { type: 'SET_AGENT_OUTPUT'; taskId?: string; agentId: AgentId; output: unknown }
  | { type: 'SET_AGENT_ERROR'; taskId?: string; agentId: AgentId; error: string }
  | { type: 'APPEND_STREAM'; taskId?: string; text: string }
  | { type: 'SET_RESULT'; taskId?: string; result: DeliveryResult }
  | { type: 'SET_PENDING_APPROVAL'; taskId?: string; approval: PendingApproval | null }
  | { type: 'PAUSE'; taskId?: string }
  | { type: 'RESUME'; taskId?: string }
  | { type: 'INTERRUPT'; taskId?: string }
  | { type: 'COMPLETE_TASK'; taskId?: string; status: Task['status']; result?: DeliveryResult }
  | { type: 'CLEAR_HISTORY_UPDATES' }
  | { type: 'RESET' };

function createInitialExecutions(): Record<AgentId, AgentExecution> {
  return {
    planner: { agentId: 'planner', status: 'idle', progress: 0, input: undefined, output: undefined, logs: [] },
    document: { agentId: 'document', status: 'idle', progress: 0, input: undefined, output: undefined, logs: [] },
    generator: { agentId: 'generator', status: 'idle', progress: 0, input: undefined, output: undefined, logs: [] },
    quality: { agentId: 'quality', status: 'idle', progress: 0, input: undefined, output: undefined, logs: [] },
    delivery: { agentId: 'delivery', status: 'idle', progress: 0, input: undefined, output: undefined, logs: [] },
  };
}

function createEmptyView() {
  return {
    isRunning: false,
    isPaused: false,
    currentTaskId: null,
    currentAgentId: null,
    executions: createInitialExecutions(),
    streamBuffer: '',
    error: null,
    result: null,
    pendingApproval: null,
  };
}

const initialState: SchedulerState = {
  ...createEmptyView(),
  tasksById: {},
  taskOrder: [],
  activeTaskId: null,
  maxTasks: MAX_CONCURRENT_TASKS,
  historyUpdates: [],
};

function schedulerReducer(state: SchedulerState, action: SchedulerAction): SchedulerState {
  switch (action.type) {
    case 'START_TASK': {
      const now = Date.now();
      const task: RuntimeTaskState = {
        id: action.taskId,
        name: action.name,
        input: action.input,
        status: 'running',
        isRunning: true,
        isPaused: false,
        currentAgentId: 'planner',
        executions: createInitialExecutions(),
        streamBuffer: '',
        error: null,
        result: null,
        pendingApproval: null,
        createdAt: now,
        updatedAt: now,
      };

      return hydrateActiveView({
        ...state,
        tasksById: {
          ...state.tasksById,
          [action.taskId]: task,
        },
        taskOrder: [action.taskId, ...state.taskOrder.filter(id => id !== action.taskId)],
        activeTaskId: action.taskId,
      });
    }

    case 'SET_ACTIVE_TASK':
      if (!state.tasksById[action.taskId]) return state;
      return hydrateActiveView({ ...state, activeTaskId: action.taskId });

    case 'SET_AGENT_STATUS':
      return updateRuntimeTask(state, action.taskId, task => ({
        ...task,
        currentAgentId: action.status === 'running'
          ? action.agentId
          : action.status === 'completed' || action.status === 'failed'
          ? getNextAgent(action.agentId)
          : task.currentAgentId,
        executions: {
          ...task.executions,
          [action.agentId]: {
            ...task.executions[action.agentId],
            status: action.status,
            progress: action.progress ?? task.executions[action.agentId].progress,
            startTime: action.status === 'running' && !task.executions[action.agentId].startTime
              ? Date.now()
              : task.executions[action.agentId].startTime,
            endTime: action.status === 'completed' || action.status === 'failed'
              ? Date.now()
              : task.executions[action.agentId].endTime,
          },
        },
        updatedAt: Date.now(),
      }));

    case 'SET_AGENT_LOG':
      return updateRuntimeTask(state, action.taskId, task => ({
        ...task,
        executions: {
          ...task.executions,
          [action.agentId]: {
            ...task.executions[action.agentId],
            logs: [...task.executions[action.agentId].logs, action.log],
          },
        },
        updatedAt: Date.now(),
      }));

    case 'LOG_CURRENT_AGENT':
      return updateRuntimeTask(state, action.taskId, task => {
        const agentId = task.currentAgentId ?? 'planner';
        return {
          ...task,
          executions: {
            ...task.executions,
            [agentId]: {
              ...task.executions[agentId],
              logs: [...task.executions[agentId].logs, action.log],
            },
          },
          updatedAt: Date.now(),
        };
      });

    case 'SET_AGENT_OUTPUT':
      return updateRuntimeTask(state, action.taskId, task => ({
        ...task,
        executions: {
          ...task.executions,
          [action.agentId]: {
            ...task.executions[action.agentId],
            output: action.output,
          },
        },
        updatedAt: Date.now(),
      }));

    case 'SET_AGENT_ERROR':
      return updateRuntimeTask(state, action.taskId, task => ({
        ...task,
        error: action.error,
        executions: {
          ...task.executions,
          [action.agentId]: {
            ...task.executions[action.agentId],
            error: action.error,
          },
        },
        updatedAt: Date.now(),
      }));

    case 'APPEND_STREAM':
      return updateRuntimeTask(state, action.taskId, task => ({
        ...task,
        streamBuffer: task.streamBuffer + action.text,
        updatedAt: Date.now(),
      }));

    case 'SET_RESULT':
      return updateRuntimeTask(state, action.taskId, task => ({
        ...task,
        result: action.result,
        updatedAt: Date.now(),
      }));

    case 'SET_PENDING_APPROVAL':
      return updateRuntimeTask(state, action.taskId, task => ({
        ...task,
        pendingApproval: action.approval,
        updatedAt: Date.now(),
      }));

    case 'PAUSE':
      return updateRuntimeTask(state, action.taskId, task => ({
        ...task,
        isPaused: true,
        updatedAt: Date.now(),
      }));

    case 'RESUME':
      return updateRuntimeTask(state, action.taskId, task => ({
        ...task,
        isPaused: false,
        updatedAt: Date.now(),
      }));

    case 'COMPLETE_TASK': {
      const taskId = resolveTaskId(state, action.taskId);
      if (!taskId) return state;
      const task = state.tasksById[taskId];
      if (!task || !task.isRunning) return state;

      const result = action.result ?? task.result ?? undefined;
      const updatedTask: RuntimeTaskState = {
        ...task,
        status: action.status,
        isRunning: false,
        isPaused: false,
        currentAgentId: null,
        pendingApproval: null,
        result: result ?? task.result,
        updatedAt: Date.now(),
      };

      return hydrateActiveView({
        ...state,
        tasksById: {
          ...state.tasksById,
          [taskId]: updatedTask,
        },
        historyUpdates: [
          ...state.historyUpdates,
          {
            taskId,
            updates: {
              status: action.status,
              executions: updatedTask.executions,
              result,
              updatedAt: updatedTask.updatedAt,
            },
          },
        ],
      });
    }

    case 'INTERRUPT': {
      const taskId = resolveTaskId(state, action.taskId);
      if (!taskId) return state;
      const task = state.tasksById[taskId];
      if (!task) return state;

      const updatedTask: RuntimeTaskState = {
        ...task,
        status: 'interrupted',
        isRunning: false,
        isPaused: false,
        currentAgentId: null,
        pendingApproval: null,
        updatedAt: Date.now(),
      };

      return hydrateActiveView({
        ...state,
        tasksById: {
          ...state.tasksById,
          [taskId]: updatedTask,
        },
        historyUpdates: [
          ...state.historyUpdates,
          {
            taskId,
            updates: {
              status: 'interrupted',
              executions: updatedTask.executions,
              updatedAt: updatedTask.updatedAt,
            },
          },
        ],
      });
    }

    case 'CLEAR_HISTORY_UPDATES':
      return { ...state, historyUpdates: [] };

    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}

function hydrateActiveView(state: SchedulerState): SchedulerState {
  const activeTask = state.activeTaskId ? state.tasksById[state.activeTaskId] : null;
  if (!activeTask) {
    return { ...state, ...createEmptyView(), activeTaskId: null };
  }

  return {
    ...state,
    isRunning: activeTask.isRunning,
    isPaused: activeTask.isPaused,
    currentTaskId: activeTask.id,
    currentAgentId: activeTask.currentAgentId,
    executions: activeTask.executions,
    streamBuffer: activeTask.streamBuffer,
    error: activeTask.error,
    result: activeTask.result,
    pendingApproval: activeTask.pendingApproval,
  };
}

function resolveTaskId(state: SchedulerState, taskId?: string): string | null {
  return taskId ?? state.activeTaskId ?? state.currentTaskId;
}

function updateRuntimeTask(
  state: SchedulerState,
  taskId: string | undefined,
  updater: (task: RuntimeTaskState) => RuntimeTaskState
): SchedulerState {
  const resolvedTaskId = resolveTaskId(state, taskId);
  if (!resolvedTaskId) return state;
  const task = state.tasksById[resolvedTaskId];
  if (!task || !task.isRunning) return state;

  return hydrateActiveView({
    ...state,
    tasksById: {
      ...state.tasksById,
      [resolvedTaskId]: updater(task),
    },
  });
}

function getNextAgent(current: AgentId | null): AgentId | null {
  if (!current) return null;
  const order: AgentId[] = ['planner', 'document', 'generator', 'quality', 'delivery'];
  const idx = order.indexOf(current);
  if (idx === -1 || idx === order.length - 1) return null;
  return order[idx + 1];
}

function getRunningTaskCount(state: SchedulerState): number {
  return state.taskOrder.reduce((count, taskId) => (
    count + (state.tasksById[taskId]?.isRunning ? 1 : 0)
  ), 0);
}

// -------------------- 启动任务所需的运行时配置 --------------------

export interface StartTaskOptions {
  modelMode: ModelType;
  temperature: number;
  maxTokens: number;
  agentConfigs: Record<AgentId, PerAgentConfig>;
  enabledAgents: Set<AgentId>;
  pipeline: PipelineStep[];
  enableContextCompression?: boolean;
  maxContextTokens?: number;
}

// -------------------- Context --------------------

interface SchedulerContextValue {
  state: SchedulerState;
  startTask: (input: TaskInput, options: StartTaskOptions) => string | null;
  setActiveTask: (taskId: string) => void;
  pauseTask: (taskId?: string) => void;
  resumeTask: (taskId?: string) => void;
  interruptTask: (taskId?: string) => void;
  approveToolCall: (approved: boolean, taskId?: string) => void;
  approveAllToolCalls: (taskId?: string) => void;
}

const SchedulerContext = createContext<SchedulerContextValue | null>(null);

export function SchedulerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(schedulerReducer, initialState);
  const { addTask, updateTask } = useHistory();

  // 每个任务一条独立的 WebSocket 连接
  const wsRefs = useRef<Map<string, WebSocket>>(new Map());
  // 记录哪些任务已经点击过"全部允许"，同一 taskId 的后续工具调用不再弹窗确认
  const autoApprovedAllRef = useRef<Set<string>>(new Set());
  // 标记是主动关闭（任务完成/中断），区分意外断连
  const intentionallyClosedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (state.historyUpdates.length === 0) return;
    state.historyUpdates.forEach(update => {
      updateTask(update.taskId, update.updates);
    });
    dispatch({ type: 'CLEAR_HISTORY_UPDATES' });
  }, [state.historyUpdates, updateTask]);

  // 组件卸载时关闭所有连接
  useEffect(() => {
    return () => {
      wsRefs.current.forEach(ws => {
        try { ws.close(); } catch { /* ignore */ }
      });
      wsRefs.current.clear();
    };
  }, []);

  const sendMessage = useCallback((taskId: string, payload: Record<string, unknown>) => {
    const ws = wsRefs.current.get(taskId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const cleanupConnection = useCallback((taskId: string) => {
    intentionallyClosedRef.current.add(taskId);
    const ws = wsRefs.current.get(taskId);
    if (ws) {
      try { ws.close(); } catch { /* ignore */ }
      wsRefs.current.delete(taskId);
    }
    autoApprovedAllRef.current.delete(taskId);
  }, []);

  const addLog = useCallback((agentId: AgentId, log: string, taskId?: string) =>
    dispatch({ type: 'SET_AGENT_LOG', taskId, agentId, log }), []);
  const logCurrentAgent = useCallback((log: string, taskId?: string) =>
    dispatch({ type: 'LOG_CURRENT_AGENT', taskId, log }), []);
  const appendStream = useCallback((text: string, taskId?: string) =>
    dispatch({ type: 'APPEND_STREAM', taskId, text }), []);
  const setAgentStatus = useCallback((agentId: AgentId, status: AgentStatus, progress?: number, taskId?: string) =>
    dispatch({ type: 'SET_AGENT_STATUS', taskId, agentId, status, progress }), []);
  const setAgentOutput = useCallback((agentId: AgentId, output: unknown, taskId?: string) =>
    dispatch({ type: 'SET_AGENT_OUTPUT', taskId, agentId, output }), []);
  const setAgentError = useCallback((agentId: AgentId, error: string, taskId?: string) =>
    dispatch({ type: 'SET_AGENT_ERROR', taskId, agentId, error }), []);
  const setResult = useCallback((result: DeliveryResult, taskId?: string) =>
    dispatch({ type: 'SET_RESULT', taskId, result }), []);
  const completeTask = useCallback((status: Task['status'], result?: DeliveryResult, taskId?: string) => {
    dispatch({ type: 'COMPLETE_TASK', taskId, status, result });
  }, []);

  /** 处理后端 WebSocket 推送的一条编排事件，驱动本地状态机 */
  const handleServerEvent = useCallback((taskId: string, msg: Record<string, unknown>) => {
    const type = msg.type as string;
    const agentId = msg.agentId as AgentId | undefined;

    switch (type) {
      case 'task_started':
        break;

      case 'agent_start':
        if (agentId) {
          setAgentStatus(agentId, 'running', 0, taskId);
          addLog(agentId, `[${agentId}] 开始执行`, taskId);
        }
        break;

      case 'agent_progress':
        if (agentId) setAgentStatus(agentId, 'running', msg.progress as number, taskId);
        break;

      case 'agent_log':
        if (agentId) addLog(agentId, msg.log as string, taskId);
        break;

      case 'stream':
        appendStream((msg.text as string) ?? '', taskId);
        break;

      case 'agent_output':
        if (agentId) setAgentOutput(agentId, msg.output, taskId);
        break;

      case 'agent_complete':
        if (agentId) {
          setAgentOutput(agentId, msg.output, taskId);
          setAgentStatus(agentId, 'completed', 100, taskId);
        }
        break;

      case 'agent_error':
        if (agentId) {
          setAgentError(agentId, msg.error as string, taskId);
          setAgentStatus(agentId, 'failed', 0, taskId);
        }
        break;

      case 'tool_start':
        logCurrentAgent(`  → 调用工具: ${msg.name as string}`, taskId);
        break;

      case 'tool_result':
        logCurrentAgent(
          `  ← 工具 ${msg.toolName as string} 执行${msg.success ? '成功' : '失败'}`,
          taskId
        );
        break;

      case 'tool_approval': {
        const toolName = msg.name as string;
        const risk = getRiskLevel(toolName);
        if (risk === 'safe' || autoApprovedAllRef.current.has(taskId)) {
          sendMessage(taskId, { type: 'tool_approval', approved: true });
        } else {
          dispatch({
            type: 'SET_PENDING_APPROVAL',
            taskId,
            approval: {
              callId: msg.callId as string,
              name: toolName,
              arguments: (msg.arguments as Record<string, unknown>) ?? {},
              description: msg.description as string | undefined,
            },
          });
        }
        break;
      }

      case 'task_complete':
        setResult(msg.result as DeliveryResult, taskId);
        completeTask('completed', msg.result as DeliveryResult, taskId);
        cleanupConnection(taskId);
        break;

      case 'task_error':
        logCurrentAgent(`错误: ${msg.error as string}`, taskId);
        completeTask('failed', undefined, taskId);
        cleanupConnection(taskId);
        break;

      case 'error':
        logCurrentAgent(`错误: ${msg.error as string}`, taskId);
        break;

      default:
        break;
    }
  }, [addLog, appendStream, cleanupConnection, completeTask, logCurrentAgent, sendMessage, setAgentError, setAgentOutput, setAgentStatus, setResult]);

  /** 建立与后端 /ws/orchestrator 的连接并发送 start 消息 */
  const connectAndRun = useCallback((taskId: string, input: TaskInput, options: StartTaskOptions) => {
    intentionallyClosedRef.current.delete(taskId);
    const ws = new WebSocket(wsUrl('/ws/orchestrator'));
    wsRefs.current.set(taskId, ws);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'start',
        input: {
          requirement: input.requirement,
          techStack: input.techStack,
          files: input.files ?? [],
        },
        modelMode: options.modelMode,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        agentConfigs: options.agentConfigs,
        enabledAgents: Array.from(options.enabledAgents),
        pipeline: options.pipeline,
        enableContextCompression: options.enableContextCompression ?? false,
        maxContextTokens: options.maxContextTokens ?? 60000,
      }));
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        handleServerEvent(taskId, msg);
      } catch {
        // 忽略无法解析的消息
      }
    };

    ws.onerror = () => {
      logCurrentAgent('WebSocket 连接出错', taskId);
    };

    ws.onclose = () => {
      wsRefs.current.delete(taskId);
      if (!intentionallyClosedRef.current.has(taskId)) {
        // 非主动关闭（网络中断等）→ 标记任务失败
        logCurrentAgent('与后端的连接意外断开', taskId);
        completeTask('failed', undefined, taskId);
      }
      intentionallyClosedRef.current.delete(taskId);
    };
  }, [completeTask, handleServerEvent, logCurrentAgent]);

  const startTask = useCallback((input: TaskInput, options: StartTaskOptions): string | null => {
    if (getRunningTaskCount(state) >= state.maxTasks) {
      return null;
    }

    const taskId = generateId();
    const taskName = input.requirement.substring(0, 30) + (input.requirement.length > 30 ? '...' : '');
    const executions = createInitialExecutions();

    dispatch({ type: 'START_TASK', taskId, input, name: taskName });

    // 保存到历史记录
    const task: Task = {
      id: taskId,
      name: taskName,
      input,
      executions,
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    addTask(task);

    connectAndRun(taskId, input, options);

    return taskId;
  }, [addTask, connectAndRun, state]);

  const setActiveTask = useCallback((taskId: string) => dispatch({ type: 'SET_ACTIVE_TASK', taskId }), []);
  // 后端目前未实现暂停语义，这里仅做本地 UI 状态切换（和拆分前行为一致）
  const pauseTask = useCallback((taskId?: string) => dispatch({ type: 'PAUSE', taskId }), []);
  const resumeTask = useCallback((taskId?: string) => dispatch({ type: 'RESUME', taskId }), []);

  const interruptTask = useCallback((taskId?: string) => {
    const resolvedId = taskId ?? state.activeTaskId ?? state.currentTaskId;
    if (resolvedId) {
      sendMessage(resolvedId, { type: 'interrupt' });
      cleanupConnection(resolvedId);
    }
    dispatch({ type: 'INTERRUPT', taskId });
  }, [cleanupConnection, sendMessage, state]);

  const approveToolCall = useCallback((approved: boolean, taskId?: string) => {
    const resolvedId = taskId ?? state.activeTaskId ?? state.currentTaskId;
    if (!resolvedId) return;
    const task = state.tasksById[resolvedId];
    if (!task?.pendingApproval) return;
    sendMessage(resolvedId, { type: 'tool_approval', approved });
    dispatch({ type: 'SET_PENDING_APPROVAL', taskId: resolvedId, approval: null });
  }, [sendMessage, state]);

  const approveAllToolCalls = useCallback((taskId?: string) => {
    const resolvedId = taskId ?? state.activeTaskId ?? state.currentTaskId;
    if (!resolvedId) return;
    const task = state.tasksById[resolvedId];
    if (!task?.pendingApproval) return;
    autoApprovedAllRef.current.add(resolvedId);
    sendMessage(resolvedId, { type: 'tool_approval', approved: true });
    dispatch({ type: 'SET_PENDING_APPROVAL', taskId: resolvedId, approval: null });
  }, [sendMessage, state]);

  const contextValue = useMemo<SchedulerContextValue>(() => ({
    state, startTask, setActiveTask, pauseTask, resumeTask, interruptTask,
    approveToolCall, approveAllToolCalls,
  }), [state, startTask, setActiveTask, pauseTask, resumeTask, interruptTask, approveToolCall, approveAllToolCalls]);

  /* eslint-disable react-hooks/refs -- callbacks close over refs but are only called in event handlers/effects, never during render */
  return createElement(
    SchedulerContext.Provider,
    { value: contextValue },
    children
  );
  /* eslint-enable react-hooks/refs */
}

export function useScheduler() {
  const ctx = useContext(SchedulerContext);
  if (!ctx) throw new Error('useScheduler must be used within SchedulerProvider');
  return ctx;
}
