/**
 * Background task manager for long-running operations.
 */

export interface TaskInfo {
  id: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
}

const tasks = new Map<string, TaskInfo>();
let taskCounter = 0;

export function startTask(fn: () => Promise<unknown>): string {
  const id = `task-${++taskCounter}-${Date.now()}`;
  const task: TaskInfo = {
    id,
    status: 'running',
    startedAt: new Date().toISOString(),
  };
  tasks.set(id, task);

  fn()
    .then((result) => {
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      task.result = result;
    })
    .catch((err) => {
      task.status = 'failed';
      task.completedAt = new Date().toISOString();
      task.error = err instanceof Error ? err.message : String(err);
    });

  return id;
}

export function getTask(id: string): TaskInfo | undefined {
  return tasks.get(id);
}

export function getAllTasks(): TaskInfo[] {
  return Array.from(tasks.values());
}
