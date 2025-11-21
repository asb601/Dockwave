// components/tasks/TaskList.tsx
import React from 'react';
import { Calendar, CheckSquare, Clock, Flag, GripVertical, Plus } from 'lucide-react';
import { Task } from '@/types';
import { isSameDay } from '@/utils/dateUtils';


interface TaskListProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onTaskToggle: (id: string) => void;
  onAddTask: () => void;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'high': return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/30';
    case 'medium': return 'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950/30';
    case 'low': return 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950/30';
    default: return 'text-muted-foreground bg-muted';
  }
};

interface TaskSectionProps {
  title: string;
  tasks: Task[];
  icon: React.ReactNode;
  onTaskClick: (task: Task) => void;
  onTaskToggle: (id: string) => void;
}

const TaskSection: React.FC<TaskSectionProps> = ({ title, tasks, icon, onTaskClick, onTaskToggle }) => (
  <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-lg p-4 mb-4 shadow-sm">
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-semibold text-lg flex items-center gap-2 text-[color:var(--foreground)]">
        {icon}
        {title}
        <span className="text-sm text-[color:var(--muted-foreground)]">({tasks.length})</span>
      </h3>
    </div>
    <div className="space-y-2">
      {tasks.map((task) => (
        <div
          key={task.id}
          className={
            "p-3 rounded-lg border border-[color:var(--border)] cursor-pointer hover:shadow-md hover:border-[color:var(--ring)] transition-all " +
            (task.completed ? "bg-[color:var(--muted)]/50 opacity-60" : "bg-[color:var(--card)]")
          }
          onClick={() => onTaskClick(task)}
        >
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={task.completed}
              onChange={(e) => {
                e.stopPropagation();
                onTaskToggle(task.id);
              }}
              className="mt-1 w-4 h-4 cursor-pointer accent-primary"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={
                  "text-sm " + (task.completed ? "line-through text-muted-foreground" : "font-medium text-foreground")
                }>
                  {task.title}
                </span>
                <span className={"text-xs px-2 py-1 rounded font-medium " + getPriorityColor(task.priority)}>
                  <Flag size={10} className="inline mr-1" />
                  {task.priority}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {task.dueDate && (
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                {task.dueTime && (
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {task.dueTime}
                  </span>
                )}
              </div>
              {task.description && (
                <p className="text-xs text-[color:var(--muted-foreground)] mt-2 line-clamp-2">{task.description}</p>
              )}
            </div>
          </div>
        </div>
      ))}
      {tasks.length === 0 && (
        <div className="text-center py-12 text-[color:var(--muted-foreground)]">
          <div className="text-4xl mb-2">📋</div>
          <p>No tasks</p>
        </div>
      )}
    </div>
  </div>
);

export const TaskList: React.FC<TaskListProps> = ({ 
  tasks, 
  onTaskClick, 
  onTaskToggle, 
  onAddTask, 
  selectedDate, 
  onDateChange 
}) => {
  const today = new Date();
  
  const todayTasks = tasks.filter((task) => 
    task.dueDate && isSameDay(new Date(task.dueDate), today)
  );
  
  const selectedDateTasks = tasks.filter((task) => 
    task.dueDate && isSameDay(new Date(task.dueDate), selectedDate)
  );
  
  const upcomingTasks = tasks.filter((task) => 
    task.dueDate && new Date(task.dueDate) > today && !isSameDay(new Date(task.dueDate), selectedDate)
  );
  
  const pastTasks = tasks.filter((task) => 
    task.dueDate && new Date(task.dueDate) < today && !isSameDay(new Date(task.dueDate), today)
  );
  
  const noDateTasks = tasks.filter((task) => !task.dueDate);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Tasks</h2>
          <p className="text-sm text-muted-foreground">Manage your tasks and to-dos</p>
        </div>
        <button
          onClick={onAddTask}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2 shadow-sm"
        >
          <Plus size={20} />
          Add Task
        </button>
      </div>

      {/* Date Selector */}
      <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-lg p-4 mb-4 shadow-sm">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-sm font-medium text-foreground">View tasks for:</label>
          <input
            type="date"
            value={selectedDate.toISOString().slice(0, 10)}
            onChange={(e) => onDateChange(new Date(e.target.value))}
            className="bg-[color:var(--secondary)] text-[color:var(--foreground)] border border-[color:var(--border)] rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
          />
          <button
            onClick={() => onDateChange(new Date())}
            className="px-3 py-2 bg-[color:var(--secondary)] text-[color:var(--foreground)] border border-[color:var(--border)] rounded-md hover:bg-[color:var(--accent)] transition-colors text-sm"
          >
            Today
          </button>
          <div className="text-sm text-muted-foreground">
            {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Selected Date Tasks */}
      {!isSameDay(selectedDate, today) && (
        <TaskSection 
          title={`Tasks for ${selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`} 
          tasks={selectedDateTasks} 
          icon={<Calendar size={20} className="text-primary" />}
          onTaskClick={onTaskClick}
          onTaskToggle={onTaskToggle}
        />
      )}

      <TaskSection 
        title="Today" 
        tasks={todayTasks} 
        icon={<CheckSquare size={20} className="text-primary" />}
        onTaskClick={onTaskClick}
        onTaskToggle={onTaskToggle}
      />
      
      <TaskSection 
        title="Upcoming" 
        tasks={upcomingTasks} 
        icon={<Calendar size={20} className="text-primary" />}
        onTaskClick={onTaskClick}
        onTaskToggle={onTaskToggle}
      />
      
      <TaskSection 
        title="Past Due" 
        tasks={pastTasks} 
        icon={<Clock size={20} className="text-destructive" />}
        onTaskClick={onTaskClick}
        onTaskToggle={onTaskToggle}
      />
      
      <TaskSection 
        title="No Due Date" 
        tasks={noDateTasks} 
        icon={<GripVertical size={20} className="text-muted-foreground" />}
        onTaskClick={onTaskClick}
        onTaskToggle={onTaskToggle}
      />
    </div>
  );
};