// types/index.ts

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  color: string;
  description?: string;
  tasks?: Task[]; // <-- add this for tasks view
}

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  dueDate?: Date;
  dueTime?: string;
  description?: string;
}

export type ViewType = 'calendar' | 'tasks';
export type CalendarViewType = 'week' | 'month' | 'year';

export interface MonthDay {
  date: Date;
  isCurrentMonth: boolean;
}

export interface Month {
  name: string;
  date: Date;
}

export interface ModalState {
  type: 'event' | 'task' | null;
  data: Partial<CalendarEvent> | Partial<Task> | null;
}

// DTOs above are used for API payloads (string ISO dates instead of Date objects).
export interface CalendarEventDTO {
  title: string;
  description?: string;
  start: string; // ISO
  end?: string;  // ISO
  isAllDay?: boolean;
  location?: string;
  color?: string;
  recurrenceRule?: string;
  seriesId?: string | null;
}

export interface TaskDTO {
  title: string;
  description?: string;
  dueDate?: string; // ISO date/time
  dueTime?: string; // HH:MM
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  completed?: boolean;
}