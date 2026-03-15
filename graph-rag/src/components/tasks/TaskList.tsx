"use client";

import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  Calendar as CalendarIcon,
} from "lucide-react";
import { formatDate } from "@/lib/dateUtils";
import type { Task } from "@/types";

interface TaskListProps {
  tasks: Task[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onToggle: (task: Task) => void;
  onTaskClick: (task: Task) => void;
}

/* ── Priority badge ─────────────────────────────────────────────────────────── */

const priorityClass: Record<Task["priority"], string> = {
  high: "badge badge-high",
  medium: "badge badge-medium",
  low: "badge badge-low",
};

/* ── Section component ──────────────────────────────────────────────────────── */

interface TaskSectionProps {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const TaskSection: React.FC<TaskSectionProps> = ({
  title,
  count,
  defaultOpen = true,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  if (count === 0) return null;

  return (
    <section>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        {title}
        <span className="badge ml-auto">{count}</span>
      </button>

      {open && <ul className="space-y-1">{children}</ul>}
    </section>
  );
};

/* ── Task row ───────────────────────────────────────────────────────────────── */

interface TaskRowProps {
  task: Task;
  onToggle: (task: Task) => void;
  onClick: (task: Task) => void;
}

const TaskRow: React.FC<TaskRowProps> = ({ task, onToggle, onClick }) => (
  <li
    className="group flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors cursor-pointer"
    onClick={() => onClick(task)}
  >
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle(task);
      }}
      className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
      aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
    >
      {task.completed ? (
        <CheckCircle2 size={18} className="text-primary" />
      ) : (
        <Circle size={18} />
      )}
    </button>

    <div className="flex-1 min-w-0">
      <p
        className={`text-sm font-medium truncate ${
          task.completed ? "line-through text-muted-foreground" : ""
        }`}
      >
        {task.title}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className={priorityClass[task.priority]}>{task.priority}</span>

        {task.dueDate && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarIcon size={12} />
            {formatDate(new Date(task.dueDate))}
            {task.dueTime && ` at ${task.dueTime}`}
          </span>
        )}
      </div>
    </div>
  </li>
);

/* ── Main component ─────────────────────────────────────────────────────────── */

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  selectedDate,
  onDateChange,
  onToggle,
  onTaskClick,
}) => {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const categorised = useMemo(() => {
    const todayItems: Task[] = [];
    const upcoming: Task[] = [];
    const pastDue: Task[] = [];
    const noDate: Task[] = [];

    for (const t of tasks) {
      if (!t.dueDate) {
        noDate.push(t);
        continue;
      }
      const due = new Date(t.dueDate);
      due.setHours(0, 0, 0, 0);

      if (due.getTime() === today.getTime()) todayItems.push(t);
      else if (due > today) upcoming.push(t);
      else pastDue.push(t);
    }

    return { todayItems, upcoming, pastDue, noDate };
  }, [tasks, today]);

  return (
    <div className="space-y-4">
      {/* date picker */}
      <div className="flex items-center gap-3">
        <label className="label mb-0">Showing tasks for</label>
        <input
          type="date"
          value={selectedDate.toISOString().slice(0, 10)}
          onChange={(e) => onDateChange(new Date(e.target.value + "T00:00:00"))}
          className="input w-auto"
        />
      </div>

      {/* task sections */}
      <div className="space-y-2">
        <TaskSection title="Today" count={categorised.todayItems.length}>
          {categorised.todayItems.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={onToggle} onClick={onTaskClick} />
          ))}
        </TaskSection>

        <TaskSection title="Upcoming" count={categorised.upcoming.length}>
          {categorised.upcoming.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={onToggle} onClick={onTaskClick} />
          ))}
        </TaskSection>

        <TaskSection
          title="Past Due"
          count={categorised.pastDue.length}
          defaultOpen={false}
        >
          {categorised.pastDue.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={onToggle} onClick={onTaskClick} />
          ))}
        </TaskSection>

        <TaskSection title="No Due Date" count={categorised.noDate.length}>
          {categorised.noDate.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={onToggle} onClick={onTaskClick} />
          ))}
        </TaskSection>
      </div>

      {tasks.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No tasks yet — create one to get started.
        </p>
      )}
    </div>
  );
};
