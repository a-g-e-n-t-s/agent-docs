/**
 * agents-docs-task-status — Poll background task progress.
 */

import { z } from '@kadi.build/core';
import { getTask, getAllTasks } from '../utils/tasks.js';

export function registerTaskStatusTool(client: any): void {
  client.registerTool(
    {
      name: 'agents-docs-task-status',
      description: 'Poll the status of a background task (e.g., pipeline). Returns status, result, or error.',
      input: z.object({
        taskId: z.string().optional().describe('Task ID to check. Omit to list all tasks.'),
      }),
    },
    async (input: { taskId?: string }) => {
      if (input.taskId) {
        const task = getTask(input.taskId);
        if (!task) return { success: false, error: `Task "${input.taskId}" not found` };
        return { success: true, task };
      }

      return { success: true, tasks: getAllTasks() };
    },
  );
}
