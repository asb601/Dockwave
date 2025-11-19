// src/app/calendar/page.tsx
// Calendar UI integrated with /api/calendar/events and /api/calendar/tasks
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, CheckSquare, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { CalendarEvent, Task, ViewType, CalendarViewType } from '@/types';
import { formatDate } from '@/utils/dateUtils';
import { EventModal } from '@/components/calendar/EventModal';
import { WeeklyView, MonthlyView, YearlyView } from '../../components/calendar/CalendarViews';
import { TaskModal } from '@/components/tasks/TaskModal';
import { TaskList } from '@/components/tasks/TaskList';

export default function PersonalCalendarApp() {
  const [view, setView] = useState<ViewType>('calendar');
  const [calendarView, setCalendarView] = useState<CalendarViewType>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTaskDate, setSelectedTaskDate] = useState(new Date());

  // Remote data state
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [errorEvents, setErrorEvents] = useState<string | null>(null);
  const [errorTasks, setErrorTasks] = useState<string | null>(null);

  const [modalState, setModalState] = useState<{ type: 'event' | 'task' | null; data: any }>({ type: null, data: null });

  // Range helpers
  const getRangeForView = useCallback((): { start: Date; end: Date } => {
    if (calendarView === 'week') {
      const start = new Date(currentDate);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { start, end };
    }
    if (calendarView === 'month') {
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 0, 0, 0);
      const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
      return { start, end };
    }
    // year
    const start = new Date(currentDate.getFullYear(), 0, 1, 0, 0, 0);
    const end = new Date(currentDate.getFullYear(), 11, 31, 23, 59, 59);
    return { start, end };
  }, [currentDate, calendarView]);

  // Fetch events
  const fetchEvents = useCallback(async () => {
    setLoadingEvents(true);
    setErrorEvents(null);
    try {
      const { start, end } = getRangeForView();
      const qs = `start=${start.toISOString()}&end=${end.toISOString()}`;
      const res = await fetch(`/api/calendar/events?${qs}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const mapped: CalendarEvent[] = (data.events || []).map((e: any) => ({
        id: e.id,
        title: e.title,
        start: new Date(e.start),
        end: new Date(e.end),
        color: e.color || '#3b82f6',
        description: e.description || '',
      }));
      setEvents(mapped);
    } catch (e: any) {
      setErrorEvents(e.message || 'Failed to load events');
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, [getRangeForView]);

  // Fetch tasks (by selected day to keep UI light)
  const fetchTasks = useCallback(async () => {
    setLoadingTasks(true);
    setErrorTasks(null);
    try {
      const dateParam = selectedTaskDate.toISOString();
      const res = await fetch(`/api/calendar/tasks?date=${dateParam}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const mapped: Task[] = (data.tasks || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        completed: !!t.completed,
        priority: (t.priority || 'MEDIUM').toLowerCase(),
        dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
        dueTime: t.dueTime || '',
        description: t.description || '',
      }));
      setTasks(mapped);
    } catch (e: any) {
      setErrorTasks(e.message || 'Failed to load tasks');
      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  }, [selectedTaskDate]);

  // Initial + dependency fetches
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (view === 'tasks') fetchTasks();
  }, [fetchTasks, view]);

  // Navigation handlers
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

  // Refetch when currentDate or view range changes for events
  useEffect(() => {
    if (view === 'calendar') fetchEvents();
  }, [currentDate, calendarView, view, fetchEvents]);

  const goToToday = () => setCurrentDate(new Date());

  // Event create/update
  const handleEventSave = async (event: CalendarEvent) => {
    const isEdit = !!events.find(e => e.id === event.id);
    try {
      if (isEdit) {
        await fetch('/api/calendar/events', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: event.id,
            title: event.title,
            description: event.description,
            start: event.start.toISOString(),
            end: event.end.toISOString(),
            color: event.color,
          }),
        });
      } else {
        const res = await fetch('/api/calendar/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: event.title,
            description: event.description,
            start: event.start.toISOString(),
            end: event.end.toISOString(),
            color: event.color,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          // Replace temp id with server id
          event.id = data.event.id;
        }
      }
    } catch (e) {
      // silent fail UI could show toast
    }
    setModalState({ type: null, data: null });
    fetchEvents();
  };

  const handleEventDelete = async (id: string) => {
    try {
      await fetch(`/api/calendar/events?id=${id}`, { method: 'DELETE' });
    } catch {}
    setModalState({ type: null, data: null });
    fetchEvents();
  };

  // Task create/update
  const handleTaskSave = async (task: Task) => {
    const isEdit = !!tasks.find(t => t.id === task.id);
    try {
      const dueDate = task.dueDate ? new Date(task.dueDate) : selectedTaskDate;
      if (isEdit) {
        await fetch('/api/calendar/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: task.id,
            title: task.title,
            description: task.description,
            dueDate: dueDate ? dueDate.toISOString() : null,
            dueTime: task.dueTime,
            priority: task.priority,
            completed: task.completed,
          }),
        });
      } else {
        const res = await fetch('/api/calendar/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: task.title,
            description: task.description,
            dueDate: dueDate ? dueDate.toISOString() : null,
            dueTime: task.dueTime,
            priority: task.priority,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          task.id = data.task.id;
        }
      }
    } catch {}
    setModalState({ type: null, data: null });
    fetchTasks();
  };

  const handleTaskDelete = async (id: string) => {
    try { await fetch(`/api/calendar/tasks?id=${id}`, { method: 'DELETE' }); } catch {}
    setModalState({ type: null, data: null });
    fetchTasks();
  };

  const handleTaskToggle = async (id: string) => {
    try { await fetch(`/api/calendar/tasks?id=${id}&toggle=1`, { method: 'PUT' }); } catch {}
    fetchTasks();
  };

  // Date range text
  const getDateRangeText = () => {
    if (calendarView === 'week') {
      const start = new Date(currentDate);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${formatDate(start)} - ${formatDate(end)}`;
    } else if (calendarView === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else {
      return currentDate.getFullYear().toString();
    }
  };

  return (
    <div className="min-h-dvh p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-lg shadow-sm p-4 mb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h1 className="text-2xl font-bold text-[color:var(--foreground)]">Personal Calendar</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setView('calendar')}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                  view === 'calendar'
                    ? 'bg-[color:var(--primary)] text-[color:var(--primary-foreground)]'
                    : 'bg-[color:var(--secondary)] text-[color:var(--foreground)] hover:bg-[color:var(--accent)]'
                }`}
              >
                <Calendar size={20} />
                Calendar
              </button>
              <button
                onClick={() => setView('tasks')}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                  view === 'tasks'
                    ? 'bg-[color:var(--primary)] text-[color:var(--primary-foreground)]'
                    : 'bg-[color:var(--secondary)] text-[color:var(--foreground)] hover:bg-[color:var(--accent)]'
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
          <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-lg shadow-sm p-4 mb-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-2">
                <button onClick={() => navigateDate('prev')} className="p-2 hover:bg-[color:var(--accent)] rounded">
                  <ChevronLeft size={20} />
                </button>
                <button onClick={goToToday} className="px-4 py-2 bg-[color:var(--primary)] text-[color:var(--primary-foreground)] rounded hover:opacity-90">
                  Today
                </button>
                <button onClick={() => navigateDate('next')} className="p-2 hover:bg-[color:var(--accent)] rounded">
                  <ChevronRight size={20} />
                </button>
                <h2 className="text-lg font-semibold ml-4">{getDateRangeText()}</h2>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCalendarView('week')}
                  className={`px-3 py-1 rounded text-sm ${
                    calendarView === 'week'
                      ? 'bg-[color:var(--primary)] text-[color:var(--primary-foreground)]'
                      : 'bg-[color:var(--secondary)] text-[color:var(--foreground)] hover:bg-[color:var(--accent)]'
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => setCalendarView('month')}
                  className={`px-3 py-1 rounded text-sm ${
                    calendarView === 'month'
                      ? 'bg-[color:var(--primary)] text-[color:var(--primary-foreground)]'
                      : 'bg-[color:var(--secondary)] text-[color:var(--foreground)] hover:bg-[color:var(--accent)]'
                  }`}
                >
                  Month
                </button>
                <button
                  onClick={() => setCalendarView('year')}
                  className={`px-3 py-1 rounded text-sm ${
                    calendarView === 'year'
                      ? 'bg-[color:var(--primary)] text-[color:var,--primary-foreground)]'
                      : 'bg-[color:var(--secondary)] text-[color:var(--foreground)] hover:bg-[color:var(--accent)]'
                  }`}
                >
                  Year
                </button>
                <button
                  onClick={() => setModalState({ type: 'event', data: null })}
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:opacity-90 flex items-center gap-1"
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
                  onTimeSlotClick={(date: Date) => setModalState({ type: 'task', data: { dueDate: date, dueTime: date.toTimeString().slice(0,5) } })}
                />
              )}
              {calendarView === 'month' && (
                <MonthlyView
                  currentDate={currentDate}
                  events={events}
                  onEventClick={(event: CalendarEvent) => setModalState({ type: 'event', data: event })}
                  onDayClick={(date: Date) => setModalState({ type: 'task', data: { dueDate: date } })}
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
              {loadingEvents && <div className="text-sm text-[color:var(--muted-foreground)] mt-2">Loading events…</div>}
              {errorEvents && <div className="text-sm text-[color:var(--destructive)] mt-2">{errorEvents}</div>}
            </>
          )}

          {view === 'tasks' && (
            <>
              <TaskList
                tasks={tasks}
                onTaskClick={(task) => setModalState({ type: 'task', data: task })}
                onTaskToggle={handleTaskToggle}
                onAddTask={() => setModalState({ type: 'task', data: null })}
                selectedDate={selectedTaskDate}
                onDateChange={(d) => { setSelectedTaskDate(d); fetchTasks(); }}
              />
              {loadingTasks && <div className="text-sm text-[color:var(--muted-foreground)] mt-2">Loading tasks…</div>}
              {errorTasks && <div className="text-sm text-[color:var(--destructive)] mt-2">{errorTasks}</div>}
            </>
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