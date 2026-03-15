"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import type { Task } from "@/types";

interface TaskModalProps {
  task: Partial<Task> | null;
  onClose: () => void;
  onSave: (task: Task) => void;
  onDelete: (id: string) => void;
}

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

export const TaskModal: React.FC<TaskModalProps> = ({
  task,
  onClose,
  onSave,
  onDelete,
}) => {
  const [formData, setFormData] = useState({
    title: task?.title || "",
    priority: task?.priority || "medium",
    dueDate: task?.dueDate
      ? new Date(task.dueDate).toISOString().slice(0, 10)
      : "",
    dueTime: task?.dueTime || "",
    description: task?.description || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...task,
      ...formData,
      dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined,
      id: task?.id || crypto.randomUUID(),
      completed: task?.completed ?? false,
    } as Task);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-panel max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">
            {task?.id ? "Edit Task" : "New Task"}
          </h2>
          <button onClick={onClose} className="btn-icon h-8 w-8">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              className="input"
              placeholder="Task title"
              required
            />
          </div>

          <div>
            <label className="label">Priority</label>
            <select
              value={formData.priority}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  priority: e.target.value as Task["priority"],
                })
              }
              className="select"
            >
              {PRIORITIES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Due Date</label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) =>
                  setFormData({ ...formData, dueDate: e.target.value })
                }
                className="input"
              />
            </div>
            <div>
              <label className="label">Time</label>
              <input
                type="time"
                value={formData.dueTime}
                onChange={(e) =>
                  setFormData({ ...formData, dueTime: e.target.value })
                }
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="input resize-none"
              rows={3}
              placeholder="Task details..."
            />
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t border-border">
            {task?.id && (
              <button
                type="button"
                onClick={() => onDelete(task.id!)}
                className="btn btn-danger"
              >
                Delete
              </button>
            )}
            <button type="button" onClick={onClose} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
