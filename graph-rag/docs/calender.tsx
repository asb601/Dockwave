import React, { useState } from 'react';
import { Calendar, CheckSquare, ChevronLeft, ChevronRight, Plus, X, Clock, Flag, GripVertical } from 'lucide-react';

// Types
interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  color: string;
  description?: string;
}

interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  dueDate?: Date;
  dueTime?: string;
  description?: string;
}

type ViewType = 'calendar' | 'tasks';
type CalendarViewType = 'week' | 'month' | 'year';

// Utility functions
const formatDate = (date: Date) => {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const isSameDay = (d1: Date, d2: Date) => {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
};

const getWeekDays = (date: Date) => {
  const week = [];
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  
  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    week.push(day);
  }
  return week;
};

const getMonthDays = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days = [];
  
  const startPadding = firstDay.getDay();
  for (let i = startPadding - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, isCurrentMonth: false });
  }
  
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), isCurrentMonth: true });
  }
  
  const endPadding = 42 - days.length;
  for (let i = 1; i <= endPadding; i++) {
    days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
  }
  
  return days;
};

interface EventModalProps {
  event: Partial<CalendarEvent> | null;
  onClose: () => void;
  onSave: (event: CalendarEvent) => void;
  onDelete: (id: string) => void;
}

interface TaskModalProps {
  task: Task | null;
  onClose: () => void;
  onSave: (task: Task) => void;
  onDelete: (id: string) => void;
}

interface WeeklyViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onTimeSlotClick: (date: Date) => void;
}

interface MonthlyViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDayClick: (date: Date) => void;
}

interface YearlyViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onMonthClick: (date: Date) => void;
}

interface TasksViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onTaskToggle: (id: string) => void;
  onAddTask: () => void;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

type ModalState =
  | { type: 'event'; data: Partial<CalendarEvent> | null }
  | { type: 'task'; data: Task | null }
  | { type: null; data: null };

// Event Modal Component
const EventModal: React.FC<EventModalProps> = ({ event, onClose, onSave, onDelete }) => {
  const [formData, setFormData] = useState({
    title: event?.title || '',
    start: event?.start ? new Date(event.start).toISOString().slice(0, 16) : '',
    end: event?.end ? new Date(event.end).toISOString().slice(0, 16) : '',
    color: event?.color || '#3b82f6',
    description: event?.description || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedEvent: CalendarEvent = {
      id: event?.id || Date.now().toString(),
      title: formData.title,
      start: new Date(formData.start),
      end: new Date(formData.end),
      color: formData.color,
      description: formData.description,
    };
    onSave(updatedEvent);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">{event ? 'Edit Event' : 'New Event'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start</label>
            <input
              type="datetime-local"
              value={formData.start}
              onChange={(e) => setFormData({ ...formData, start: e.target.value })}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End</label>
            <input
              type="datetime-local"
              value={formData.end}
              onChange={(e) => setFormData({ ...formData, end: e.target.value })}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Color</label>
            <div className="flex gap-2">
              {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'].map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  className={`w-8 h-8 rounded-full ${formData.color === color ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border rounded px-3 py-2"
              rows={3}
            />
          </div>
          <div className="flex gap-2 justify-end">
            {event?.id && (
              <button
                type="button"
                onClick={() => onDelete(event.id as string)}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Task Modal Component
const TaskModal: React.FC<TaskModalProps> = ({ task, onClose, onSave, onDelete }) => {
  const [formData, setFormData] = useState({
    title: task?.title || '',
    priority: (task?.priority as Task['priority']) || 'medium',
    dueDate: task?.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '',
    dueTime: task?.dueTime || '',
    description: task?.description || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedTask: Task = {
      id: task?.id || Date.now().toString(),
      title: formData.title,
      priority: formData.priority,
      completed: task?.completed ?? false,
      dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined,
      dueTime: formData.dueTime || undefined,
      description: formData.description || undefined,
    };
    onSave(updatedTask);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">{task ? 'Edit Task' : 'New Task'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Priority</label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value as Task['priority'] })}
              className="w-full border rounded px-3 py-2"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium mb-1">Due Date</label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Time</label>
              <input
                type="time"
                value={formData.dueTime}
                onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border rounded px-3 py-2"
              rows={3}
            />
          </div>
          <div className="flex gap-2 justify-end">
            {task && (
              <button
                type="button"
                onClick={() => onDelete(task.id)}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Weekly View Component
const WeeklyView: React.FC<WeeklyViewProps> = ({ currentDate, events, onEventClick, onTimeSlotClick }) => {
  const weekDays = getWeekDays(currentDate);
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const getEventsForTimeSlot = (day: Date, hour: number) => {
    return events.filter((event: CalendarEvent) => {
      const eventStart = new Date(event.start);
      return isSameDay(eventStart, day) && eventStart.getHours() === hour;
    });
  };

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="grid grid-cols-8 border-b bg-gray-50">
        <div className="p-2 text-sm font-medium text-gray-500">Time</div>
        {weekDays.map((day, i) => (
          <div key={i} className="p-2 text-center border-l">
            <div className="text-sm font-medium">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
            <div className={`text-lg ${isSameDay(day, new Date()) ? 'text-blue-600 font-bold' : ''}`}>
              {day.getDate()}
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-y-auto max-h-[600px]">
        {hours.map(hour => (
          <div key={hour} className="grid grid-cols-8 border-b hover:bg-gray-50">
            <div className="p-2 text-sm text-gray-500 border-r">
              {hour.toString().padStart(2, '0')}:00
            </div>
            {weekDays.map((day, i) => {
              const slotEvents = getEventsForTimeSlot(day, hour);
              return (
                <div
                  key={i}
                  className="p-1 border-l min-h-[60px] cursor-pointer hover:bg-blue-50"
                  onClick={() => onTimeSlotClick(new Date(day.setHours(hour, 0)))}
                >
                  {slotEvents.map(event => (
                    <div
                      key={event.id}
                      className="text-xs p-1 mb-1 rounded text-white cursor-pointer hover:opacity-80"
                      style={{ backgroundColor: event.color }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event);
                      }}
                    >
                      {event.title}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

// Monthly View Component
const MonthlyView: React.FC<MonthlyViewProps> = ({ currentDate, events, onEventClick, onDayClick }) => {
  const monthDays = getMonthDays(currentDate);
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getEventsForDay = (day: Date) => {
    return events.filter((event: CalendarEvent) => isSameDay(new Date(event.start), day));
  };

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="grid grid-cols-7 border-b bg-gray-50">
        {weekDays.map(day => (
          <div key={day} className="p-3 text-center text-sm font-medium text-gray-700">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {monthDays.map(({ date, isCurrentMonth }, i) => {
          const dayEvents = getEventsForDay(date);
          const isToday = isSameDay(date, new Date());
          
          return (
            <div
              key={i}
              className={`min-h-[100px] p-2 border-b border-r cursor-pointer hover:bg-gray-50 ${
                !isCurrentMonth ? 'bg-gray-50 text-gray-400' : ''
              }`}
              onClick={() => onDayClick(date)}
            >
              <div className={`text-sm mb-1 ${isToday ? 'bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold' : ''}`}>
                {date.getDate()}
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map(event => (
                  <div
                    key={event.id}
                    className="text-xs p-1 rounded text-white truncate cursor-pointer hover:opacity-80"
                    style={{ backgroundColor: event.color }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event);
                    }}
                  >
                    {event.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-xs text-gray-500">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Yearly View Component
const YearlyView: React.FC<YearlyViewProps> = ({ currentDate, events, onMonthClick }) => {
  const months = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(currentDate.getFullYear(), i, 1);
    return {
      name: date.toLocaleDateString('en-US', { month: 'long' }),
      date: date
    };
  });

  const getEventsForMonth = (month: number) => {
    return events.filter((event: CalendarEvent) => {
      const eventDate = new Date(event.start);
      return eventDate.getFullYear() === currentDate.getFullYear() && 
             eventDate.getMonth() === month;
    });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {months.map((month, i) => {
        const monthEvents = getEventsForMonth(i);
        return (
          <div
            key={i}
            className="bg-white rounded-lg border p-4 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => onMonthClick(month.date)}
          >
            <h3 className="font-semibold text-lg mb-3">{month.name}</h3>
            <div className="space-y-2">
              {monthEvents.slice(0, 5).map(event => (
                <div
                  key={event.id}
                  className="text-xs p-2 rounded text-white"
                  style={{ backgroundColor: event.color }}
                >
                  {new Date(event.start).getDate()} - {event.title}
                </div>
              ))}
              {monthEvents.length > 5 && (
                <div className="text-xs text-gray-500 pl-2">
                  +{monthEvents.length - 5} more events
                </div>
              )}
              {monthEvents.length === 0 && (
                <div className="text-xs text-gray-400 pl-2">No events</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Tasks View Component
const TasksView: React.FC<TasksViewProps> = ({ tasks, onTaskClick, onTaskToggle, onAddTask, selectedDate, onDateChange }) => {
  const today = new Date();
  const safeSelectedDate = selectedDate || today;
  
  const todayTasks = tasks.filter((task: Task) => 
    task.dueDate && isSameDay(new Date(task.dueDate), today)
  );
  
  const selectedDateTasks = tasks.filter((task: Task) => 
    task.dueDate && isSameDay(new Date(task.dueDate), safeSelectedDate)
  );
  
  const upcomingTasks = tasks.filter((task: Task) => 
    task.dueDate && new Date(task.dueDate) > today && !isSameDay(new Date(task.dueDate), safeSelectedDate)
  );
  
  const pastTasks = tasks.filter((task: Task) => 
    task.dueDate && new Date(task.dueDate) < today && !isSameDay(new Date(task.dueDate), today)
  );
  
  const noDateTasks = tasks.filter((task: Task) => !task.dueDate);

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  type TaskListProps = {
    title: string;
    tasks: Task[];
    icon: React.ReactNode;
    onTaskClick: (task: Task) => void;
    onTaskToggle: (id: string) => void;
    getPriorityColor: (priority: Task['priority']) => string;
  };

  const TaskListSection: React.FC<TaskListProps> = ({ title, tasks, icon, onTaskClick, onTaskToggle, getPriorityColor }) => (
    <div className="bg-white rounded-lg border p-4 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          {icon}
          {title}
          <span className="text-sm text-gray-500">({tasks.length})</span>
        </h3>
      </div>
      <div className="space-y-2">
        {tasks.map((task: Task) => (
          <div
            key={task.id}
            className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${
              task.completed ? 'bg-gray-50 opacity-60' : 'bg-white'
            }`}
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
                className="mt-1 w-4 h-4 cursor-pointer"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-sm ${task.completed ? 'line-through text-gray-500' : 'font-medium'}`}>
                    {task.title}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded ${getPriorityColor(task.priority)}`}>
                    <Flag size={10} className="inline mr-1" />
                    {task.priority}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
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
                  <p className="text-xs text-gray-600 mt-1">{task.description}</p>
                )}
              </div>
            </div>
          </div>
        ))}
        {tasks.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            No tasks
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Tasks</h2>
          <p className="text-sm text-gray-500">Manage your tasks and to-dos</p>
        </div>
        <button
          onClick={onAddTask}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={20} />
          Add Task
        </button>
      </div>

      {/* Date Selector */}
      <div className="bg-white rounded-lg border p-4 mb-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">View tasks for:</label>
          <input
            type="date"
            value={safeSelectedDate.toISOString().slice(0, 10)}
            onChange={(e) => onDateChange(new Date(e.target.value))}
            className="border rounded px-3 py-2"
          />
          <button
            onClick={() => onDateChange(new Date())}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
          >
            Today
          </button>
          <div className="text-sm text-gray-600">
            {safeSelectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Selected Date Tasks */}
      {!isSameDay(safeSelectedDate, today) && (
        <TaskListSection 
          title={`Tasks for ${safeSelectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`} 
          tasks={selectedDateTasks} 
          icon={<Calendar size={20} />}
          onTaskClick={onTaskClick}
          onTaskToggle={onTaskToggle}
          getPriorityColor={getPriorityColor}
        />
      )}

      <TaskListSection 
        title="Today" 
        tasks={todayTasks} 
        icon={<CheckSquare size={20} />}
        onTaskClick={onTaskClick}
        onTaskToggle={onTaskToggle}
        getPriorityColor={getPriorityColor}
      />
      
      <TaskListSection 
        title="Upcoming" 
        tasks={upcomingTasks} 
        icon={<Calendar size={20} />}
        onTaskClick={onTaskClick}
        onTaskToggle={onTaskToggle}
        getPriorityColor={getPriorityColor}
      />
      
      <TaskListSection 
        title="Past Due" 
        tasks={pastTasks} 
        icon={<Clock size={20} />}
        onTaskClick={onTaskClick}
        onTaskToggle={onTaskToggle}
        getPriorityColor={getPriorityColor}
      />
      
      <TaskListSection 
        title="No Due Date" 
        tasks={noDateTasks} 
        icon={<GripVertical size={20} />}
        onTaskClick={onTaskClick}
        onTaskToggle={onTaskToggle}
        getPriorityColor={getPriorityColor}
      />
    </div>
  );
};

// Main App Component
export default function PersonalCalendarApp() {
  const [view, setView] = useState<ViewType>('calendar');
  const [calendarView, setCalendarView] = useState<CalendarViewType>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTaskDate, setSelectedTaskDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([
    {
      id: '1',
      title: 'Team Meeting',
      start: new Date(2025, 10, 18, 10, 0),
      end: new Date(2025, 10, 18, 11, 0),
      color: '#3b82f6',
      description: 'Weekly team sync'
    },
    {
      id: '2',
      title: 'Lunch with Client',
      start: new Date(2025, 10, 18, 12, 30),
      end: new Date(2025, 10, 18, 13, 30),
      color: '#10b981'
    },
    {
      id: '3',
      title: 'Project Review',
      start: new Date(2025, 10, 19, 14, 0),
      end: new Date(2025, 10, 19, 15, 30),
      color: '#f59e0b'
    }
  ]);
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: '1',
      title: 'Complete project proposal',
      completed: false,
      priority: 'high',
      dueDate: new Date(2025, 10, 18),
      dueTime: '17:00'
    },
    {
      id: '2',
      title: 'Review pull requests',
      completed: false,
      priority: 'medium',
      dueDate: new Date(2025, 10, 19),
      dueTime: '10:00'
    },
    {
      id: '3',
      title: 'Update documentation',
      completed: true,
      priority: 'low',
      dueDate: new Date(2025, 10, 18)
    },
    {
      id: '4',
      title: 'Prepare presentation slides',
      completed: false,
      priority: 'high',
      dueDate: new Date(2025, 10, 20),
      dueTime: '09:00'
    },
    {
      id: '5',
      title: 'Code review meeting prep',
      completed: false,
      priority: 'medium',
      dueDate: new Date(2025, 10, 22),
      dueTime: '14:00'
    },
    {
      id: '6',
      title: 'Research new frameworks',
      completed: false,
      priority: 'low'
    }
  ]);
  const [modalState, setModalState] = useState<ModalState>({ type: null, data: null });

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (calendarView === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else if (calendarView === 'month') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    } else {
      newDate.setFullYear(newDate.getFullYear() + (direction === 'next' ? 1 : -1));
    }
    setCurrentDate(newDate);
  };

  const goToToday = () => setCurrentDate(new Date());

  const handleEventSave = (event: CalendarEvent) => {
    if (events.find(e => e.id === event.id)) {
      setEvents(events.map(e => e.id === event.id ? event : e));
    } else {
      setEvents([...events, event]);
    }
    setModalState({ type: null, data: null });
  };

  const handleEventDelete = (id: string) => {
    setEvents(events.filter(e => e.id !== id));
    setModalState({ type: null, data: null });
  };

  const handleTaskSave = (task: Task) => {
    if (tasks.find(t => t.id === task.id)) {
      setTasks(tasks.map(t => t.id === task.id ? task : t));
    } else {
      setTasks([...tasks, task]);
    }
    setModalState({ type: null, data: null });
  };

  const handleTaskDelete = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
    setModalState({ type: null, data: null });
  };

  const handleTaskToggle = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const getDateRangeText = () => {
    if (calendarView === 'week') {
      const weekDays = getWeekDays(currentDate);
      return `${formatDate(weekDays[0])} - ${formatDate(weekDays[6])}`;
    } else if (calendarView === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else {
      return currentDate.getFullYear().toString();
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-800">Personal Calendar</h1>
            
            {/* View Switcher */}
            <div className="flex gap-2">
              <button
                onClick={() => setView('calendar')}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                  view === 'calendar' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Calendar size={20} />
                Calendar
              </button>
              <button
                onClick={() => setView('tasks')}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                  view === 'tasks' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <CheckSquare size={20} />
                Tasks
              </button>
            </div>
          </div>
        </div>

        {/* Calendar Navigation */}
        {view === 'calendar' && (
          <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigateDate('prev')}
                  className="p-2 hover:bg-gray-100 rounded"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={goToToday}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Today
                </button>
                <button
                  onClick={() => navigateDate('next')}
                  className="p-2 hover:bg-gray-100 rounded"
                >
                  <ChevronRight size={20} />
                </button>
                <h2 className="text-lg font-semibold ml-4">{getDateRangeText()}</h2>
              </div>

              {/* Calendar View Switcher */}
              <div className="flex gap-2">
                <button
                  onClick={() => setCalendarView('week')}
                  className={`px-3 py-1 rounded text-sm ${
                    calendarView === 'week' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => setCalendarView('month')}
                  className={`px-3 py-1 rounded text-sm ${
                    calendarView === 'month' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Month
                </button>
                <button
                  onClick={() => setCalendarView('year')}
                  className={`px-3 py-1 rounded text-sm ${
                    calendarView === 'year' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Year
                </button>
                <button
                  onClick={() => setModalState({ type: 'event', data: null })}
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 flex items-center gap-1"
                >
                  <Plus size={16} />
                  Event
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="mb-4">
          {view === 'calendar' && (
            <>
              {calendarView === 'week' && (
                <WeeklyView
                  currentDate={currentDate}
                  events={events}
                  onEventClick={(event: CalendarEvent) => setModalState({ type: 'event', data: event })}
                  onTimeSlotClick={(date: Date) => setModalState({ 
                    type: 'event', 
                    data: { start: date, end: new Date(date.getTime() + 3600000) } 
                  })}
                />
              )}
              {calendarView === 'month' && (
                <MonthlyView
                  currentDate={currentDate}
                  events={events}
                  onEventClick={(event: CalendarEvent) => setModalState({ type: 'event', data: event })}
                  onDayClick={(date: Date) => setModalState({ 
                    type: 'event', 
                    data: { start: date, end: new Date(date.getTime() + 3600000) } 
                  })}
                />
              )}
              {calendarView === 'year' && (
                <YearlyView
                  currentDate={currentDate}
                  events={events}
                  onMonthClick={(date: Date) => {
                    setCurrentDate(date);
                    setCalendarView('month');
                  }}
                />
              )}
            </>
          )}

          {view === 'tasks' && (
            <TasksView
              tasks={tasks}
              onTaskClick={(task: Task) => setModalState({ type: 'task', data: task })}
              onTaskToggle={handleTaskToggle}
              onAddTask={() => setModalState({ type: 'task', data: null })}
              selectedDate={selectedTaskDate}
              onDateChange={setSelectedTaskDate}
            />
          )}
        </div>

        {/* Modals */}
        {modalState.type === 'event' && (
          <EventModal
            event={modalState.data}
            onClose={() => setModalState({ type: null, data: null })}
            onSave={handleEventSave}
            onDelete={handleEventDelete}
          />
        )}

        {modalState.type === 'task' && (
          <TaskModal
            task={modalState.data}
            onClose={() => setModalState({ type: null, data: null })}
            onSave={handleTaskSave}
            onDelete={handleTaskDelete}
          />
        )}
      </div>
    </div>
  );
}