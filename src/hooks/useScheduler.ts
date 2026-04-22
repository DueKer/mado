'use client';

import { createContext, createElement, useContext, useReducer, useCallback, type ReactNode } from 'react';
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
import { AGENTS } from '@/lib/constants';

// -------------------- 调度器状态 --------------------

interface SchedulerState {
  isRunning: boolean;
  isPaused: boolean;
  currentTaskId: string | null;
  currentAgentId: AgentId | null;
  executions: Record<AgentId, AgentExecution>;
  streamBuffer: string;
  error: string | null;
  result: DeliveryResult | null;
}

type SchedulerAction =
  | { type: 'START_TASK'; taskId: string; input: TaskInput }
  | { type: 'SET_AGENT_STATUS'; agentId: AgentId; status: AgentStatus; progress?: number }
  | { type: 'SET_AGENT_LOG'; agentId: AgentId; log: string }
  | { type: 'SET_AGENT_OUTPUT'; agentId: AgentId; output: unknown }
  | { type: 'SET_AGENT_ERROR'; agentId: AgentId; error: string }
  | { type: 'APPEND_STREAM'; text: string }
  | { type: 'SET_RESULT'; result: DeliveryResult }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'INTERRUPT' }
  | { type: 'RESET' };

const initialExecutions: Record<AgentId, AgentExecution> = {
  planner: { agentId: 'planner', status: 'idle', progress: 0, input: undefined, output: undefined, logs: [] },
  document: { agentId: 'document', status: 'idle', progress: 0, input: undefined, output: undefined, logs: [] },
  generator: { agentId: 'generator', status: 'idle', progress: 0, input: undefined, output: undefined, logs: [] },
  quality: { agentId: 'quality', status: 'idle', progress: 0, input: undefined, output: undefined, logs: [] },
  delivery: { agentId: 'delivery', status: 'idle', progress: 0, input: undefined, output: undefined, logs: [] },
};

const initialState: SchedulerState = {
  isRunning: false,
  isPaused: false,
  currentTaskId: null,
  currentAgentId: null,
  executions: initialExecutions,
  streamBuffer: '',
  error: null,
  result: null,
};

function schedulerReducer(state: SchedulerState, action: SchedulerAction): SchedulerState {
  switch (action.type) {
    case 'START_TASK':
      return {
        ...state,
        isRunning: true,
        isPaused: false,
        currentTaskId: action.taskId,
        currentAgentId: 'planner',
        executions: initialExecutions,
        streamBuffer: '',
        error: null,
        result: null,
      };

    case 'SET_AGENT_STATUS':
      return {
        ...state,
        currentAgentId: action.status === 'completed' || action.status === 'failed'
          ? getNextAgent(state.currentAgentId)
          : state.currentAgentId,
        executions: {
          ...state.executions,
          [action.agentId]: {
            ...state.executions[action.agentId],
            status: action.status,
            progress: action.progress ?? state.executions[action.agentId].progress,
            startTime: action.status === 'running' && !state.executions[action.agentId].startTime
              ? Date.now()
              : state.executions[action.agentId].startTime,
            endTime: action.status === 'completed' || action.status === 'failed'
              ? Date.now()
              : state.executions[action.agentId].endTime,
          },
        },
      };

    case 'SET_AGENT_LOG':
      return {
        ...state,
        executions: {
          ...state.executions,
          [action.agentId]: {
            ...state.executions[action.agentId],
            logs: [...state.executions[action.agentId].logs, action.log],
          },
        },
      };

    case 'SET_AGENT_OUTPUT':
      return {
        ...state,
        executions: {
          ...state.executions,
          [action.agentId]: {
            ...state.executions[action.agentId],
            output: action.output,
          },
        },
      };

    case 'SET_AGENT_ERROR':
      return {
        ...state,
        executions: {
          ...state.executions,
          [action.agentId]: {
            ...state.executions[action.agentId],
            error: action.error,
          },
        },
      };

    case 'APPEND_STREAM':
      return { ...state, streamBuffer: state.streamBuffer + action.text };

    case 'SET_RESULT':
      return { ...state, result: action.result };

    case 'PAUSE':
      return { ...state, isPaused: true };

    case 'RESUME':
      return { ...state, isPaused: false };

    case 'INTERRUPT':
    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}

function getNextAgent(current: AgentId | null): AgentId | null {
  if (!current) return null;
  const order: AgentId[] = ['planner', 'document', 'generator', 'quality', 'delivery'];
  const idx = order.indexOf(current);
  if (idx === -1 || idx === order.length - 1) return null;
  return order[idx + 1];
}

// -------------------- Context --------------------

interface SchedulerContextValue {
  state: SchedulerState;
  startTask: (input: TaskInput, modelMode: ModelType) => void;
  pauseTask: () => void;
  resumeTask: () => void;
  interruptTask: () => void;
  addLog: (agentId: AgentId, log: string) => void;
  appendStream: (text: string) => void;
  setAgentStatus: (agentId: AgentId, status: AgentStatus, progress?: number) => void;
  setAgentOutput: (agentId: AgentId, output: unknown) => void;
  setAgentError: (agentId: AgentId, error: string) => void;
  setResult: (result: DeliveryResult) => void;
  completeTask: (status: Task['status'], result?: DeliveryResult) => void;
}

const SchedulerContext = createContext<SchedulerContextValue | null>(null);

export function SchedulerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(schedulerReducer, initialState);
  const { addTask, updateTask } = useHistory();

  const startTask = useCallback((input: TaskInput, modelMode: ModelType) => {
    const taskId = generateId();
    dispatch({ type: 'START_TASK', taskId, input });

    // 保存到历史记录
    const task: Task = {
      id: taskId,
      name: input.requirement.substring(0, 30) + (input.requirement.length > 30 ? '...' : ''),
      input,
      executions: initialExecutions,
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    addTask(task);
  }, [addTask]);

  const pauseTask = useCallback(() => dispatch({ type: 'PAUSE' }), []);
  const resumeTask = useCallback(() => dispatch({ type: 'RESUME' }), []);
  const interruptTask = useCallback(() => dispatch({ type: 'INTERRUPT' }), []);
  const addLog = useCallback((agentId: AgentId, log: string) => dispatch({ type: 'SET_AGENT_LOG', agentId, log }), []);
  const appendStream = useCallback((text: string) => dispatch({ type: 'APPEND_STREAM', text }), []);
  const setAgentStatus = useCallback((agentId: AgentId, status: AgentStatus, progress?: number) =>
    dispatch({ type: 'SET_AGENT_STATUS', agentId, status, progress }), []);
  const setAgentOutput = useCallback((agentId: AgentId, output: unknown) =>
    dispatch({ type: 'SET_AGENT_OUTPUT', agentId, output }), []);
  const setAgentError = useCallback((agentId: AgentId, error: string) =>
    dispatch({ type: 'SET_AGENT_ERROR', agentId, error }), []);
  const setResult = useCallback((result: DeliveryResult) => dispatch({ type: 'SET_RESULT', result }), []);

  const completeTask = useCallback((status: Task['status'], result?: DeliveryResult) => {
    if (!state.currentTaskId) return;
    updateTask(state.currentTaskId, {
      status,
      executions: state.executions,
      result: result ?? state.result ?? undefined,
      updatedAt: Date.now(),
    });
    dispatch({ type: 'RESET' });
  }, [state.currentTaskId, state.executions, state.result, updateTask]);

  return createElement(
    SchedulerContext.Provider,
    {
      value: {
        state, startTask, pauseTask, resumeTask, interruptTask,
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
