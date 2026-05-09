'use client';

import { createContext, createElement, useContext, useReducer, useCallback, useEffect, type ReactNode } from 'react';
import type {
  AgentId,
  AgentExecution,
  AgentStatus,
  Task,
  TaskInput,
  DeliveryResult,
  ModelType,
} from '@/types';
import { generateId } from '@/lib/utils';
import { useHistory } from './useStore';

// -------------------- 调度器状态 --------------------

const MAX_CONCURRENT_TASKS = 3;

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
  | { type: 'SET_AGENT_OUTPUT'; taskId?: string; agentId: AgentId; output: unknown }
  | { type: 'SET_AGENT_ERROR'; taskId?: string; agentId: AgentId; error: string }
  | { type: 'APPEND_STREAM'; taskId?: string; text: string }
  | { type: 'SET_RESULT'; taskId?: string; result: DeliveryResult }
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

// -------------------- Context --------------------

interface SchedulerContextValue {
  state: SchedulerState;
  startTask: (input: TaskInput, modelMode: ModelType) => string | null;
  setActiveTask: (taskId: string) => void;
  pauseTask: (taskId?: string) => void;
  resumeTask: (taskId?: string) => void;
  interruptTask: (taskId?: string) => void;
  addLog: (agentId: AgentId, log: string, taskId?: string) => void;
  appendStream: (text: string, taskId?: string) => void;
  setAgentStatus: (agentId: AgentId, status: AgentStatus, progress?: number, taskId?: string) => void;
  setAgentOutput: (agentId: AgentId, output: unknown, taskId?: string) => void;
  setAgentError: (agentId: AgentId, error: string, taskId?: string) => void;
  setResult: (result: DeliveryResult, taskId?: string) => void;
  completeTask: (status: Task['status'], result?: DeliveryResult, taskId?: string) => void;
}

const SchedulerContext = createContext<SchedulerContextValue | null>(null);

export function SchedulerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(schedulerReducer, initialState);
  const { addTask, updateTask } = useHistory();

  useEffect(() => {
    if (state.historyUpdates.length === 0) return;
    state.historyUpdates.forEach(update => {
      updateTask(update.taskId, update.updates);
    });
    dispatch({ type: 'CLEAR_HISTORY_UPDATES' });
  }, [state.historyUpdates, updateTask]);

  const startTask = useCallback((input: TaskInput) => {
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

    return taskId;
  }, [addTask, state]);

  const setActiveTask = useCallback((taskId: string) => dispatch({ type: 'SET_ACTIVE_TASK', taskId }), []);
  const pauseTask = useCallback((taskId?: string) => dispatch({ type: 'PAUSE', taskId }), []);
  const resumeTask = useCallback((taskId?: string) => dispatch({ type: 'RESUME', taskId }), []);
  const interruptTask = useCallback((taskId?: string) => dispatch({ type: 'INTERRUPT', taskId }), []);
  const addLog = useCallback((agentId: AgentId, log: string, taskId?: string) =>
    dispatch({ type: 'SET_AGENT_LOG', taskId, agentId, log }), []);
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

  return createElement(
    SchedulerContext.Provider,
    {
      value: {
        state, startTask, setActiveTask, pauseTask, resumeTask, interruptTask,
        addLog, appendStream, setAgentStatus, setAgentOutput, setAgentError, setResult, completeTask,
      },
    },
    children
  );
}

export function useScheduler() {
  const ctx = useContext(SchedulerContext);
  if (!ctx) throw new Error('useScheduler must be used within SchedulerProvider');
  return ctx;
}
