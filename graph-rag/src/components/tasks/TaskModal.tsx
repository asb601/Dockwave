// components/tasks/TaskModal.tsx
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Task } from '@/types';

interface TaskModalProps {
  task: Partial<Task> | null;
  onClose: () => void;
  onSave: (task: Task) => void;
  onDelete: (id: string) => void;
}

export const TaskModal: React.FC<TaskModalProps> = ({ task, onClose, onSave, onDelete }) => {
  type FormData = {
    title: string;
    priority: "low" | "medium" | "high";
    dueDate: string;
    dueTime: string;
    description: string;
  };
  const [formData, setFormData] = useState<FormData>({
    title: task?.title || '',
    priority: (task?.priority as "low" | "medium" | "high") || 'medium',
    dueDate: task?.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '',
    dueTime: task?.dueTime || '',
    description: task?.description || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...task,
      ...formData,
      dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined,
      id: task?.id || crypto.randomUUID(),
      completed: task?.completed || false
    } as Task);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-card border border-border rounded-lg max-w-md w-full p-6 shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-foreground">
            {task?.id ? 'Edit Task' : 'New Task'}
          </h2>
          <button 
            onClick={onClose} 
            className="text-muted-foreground hover:text-foreground transition-colors p-1 hover:bg-accent rounded"
          >
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full bg-secondary text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Task title"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Priority</label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value as "low" | "medium" | "high" })}
              className="w-full bg-secondary text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Due Date</label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="w-full bg-secondary text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Time</label>
              <input
                type="time"
                value={formData.dueTime}
                onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                className="w-full bg-secondary text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-secondary text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              rows={3}
              placeholder="Add task details..."
            />
          </div>
          
          <div className="flex gap-2 justify-end pt-4 border-t border-border">
            {task?.id && (
              <button
                type="button"
                onClick={() => onDelete(task.id!)}
                className="px-4 py-2 text-destructive hover:bg-destructive/10 rounded-md transition-colors"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-secondary text-foreground border border-border rounded-md hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};