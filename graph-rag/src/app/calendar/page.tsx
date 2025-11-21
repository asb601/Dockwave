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

type ApiTask = {
  id: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: string | null;
  completed?: boolean | null;
  eventId?: string | null;
};

type ApiEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  color?: string | null;
  description?: string | null;
  tasks?: ApiTask[] | null;
};

type TaskWithEvent = Task & { eventId?: string };

type ModalState =
  | { type: 'event'; data: CalendarEvent | null }
  | { type: 'task'; data: (Partial<TaskWithEvent> & { dueDate?: Date }) | null }
  | { type: null; data: null };

const normalizeTask = (task: ApiTask): TaskWithEvent => ({
  id: task.id,
  title: task.title,
  description: task.description ?? undefined,
  dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
  dueTime: task.dueTime ?? undefined,
  priority: (task.priority?.toLowerCase() as Task['priority']) ?? 'medium',
  completed: Boolean(task.completed),
  eventId: task.eventId ?? undefined,
});

const normalizeEvent = (event: ApiEvent): CalendarEvent => ({
  id: event.id,
  title: event.title,
  start: new Date(event.start),
  end: new Date(event.end),
  color: event.color || '#3b82f6',
  description: event.description ?? '',
  tasks: event.tasks?.map(normalizeTask),
});

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export default function PersonalCalendarApp() {
  const [view, setView] = useState<ViewType>('calendar');
  const [calendarView, setCalendarView] = useState<CalendarViewType>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTaskDate, setSelectedTaskDate] = useState(new Date());

  // Remote data state
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [errorEvents, setErrorEvents] = useState<string | null>(null);
  const [errorTasks, setErrorTasks] = useState<string | null>(null);

  const [modalState, setModalState] = useState<ModalState>({ type: null, data: null });
  const [showHistory, setShowHistory] = useState(false);

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
      const data = (await res.json()) as { events?: ApiEvent[] };
      const mapped = (data.events ?? []).map(normalizeEvent);
      setEvents(mapped);
    } catch (error) {
      setErrorEvents(getErrorMessage(error, 'Failed to load events'));
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, [getRangeForView]);

  // Fetch all events with their tasks for the tasks view
  const fetchAllEventsWithTasks = useCallback(async () => {
    setLoadingTasks(true);
    setErrorTasks(null);
    try {
      const { start, end } = getRangeForView();
      const qs = `start=${start.toISOString()}&end=${end.toISOString()}`;
      const res = await fetch(`/api/calendar/events?${qs}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { events?: ApiEvent[] };
      setEvents((data.events ?? []).map(normalizeEvent));
    } catch (error) {
      setErrorTasks(getErrorMessage(error, 'Failed to load events and tasks'));
      setEvents([]);
    } finally {
      setLoadingTasks(false);
    }
  }, [getRangeForView]);

  // Initial + dependency fetches
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (view === 'tasks') fetchAllEventsWithTasks();
  }, [fetchAllEventsWithTasks, view]);

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
    } catch {
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
  const handleTaskSave = async (task: TaskWithEvent) => {
    const isEdit = events.some(ev => (ev.tasks || []).find(t => t.id === task.id));
    try {
      let eventId = task.eventId;
      // If no eventId, create a CalendarEvent first
      if (!eventId) {
        const eventRes = await fetch('/api/calendar/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: task.title,
            description: task.description,
            start: (task.dueDate || selectedTaskDate).toISOString(),
            end: (task.dueDate || selectedTaskDate).toISOString(),
            color: '#3b82f6',
          }),
        });
        if (!eventRes.ok) throw new Error(await eventRes.text());
        const eventData = (await eventRes.json()) as { event: { id: string } };
        eventId = eventData.event.id;
      }
      if (isEdit) {
        await fetch('/api/calendar/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: task.id,
            eventId,
            title: task.title,
            description: task.description,
            dueDate: (task.dueDate || selectedTaskDate).toISOString(),
            dueTime: task.dueTime,
            priority: task.priority?.toUpperCase(),
            completed: task.completed,
          }),
        });
      } else {
        await fetch('/api/calendar/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId,
            title: task.title,
            description: task.description,
            dueDate: (task.dueDate || selectedTaskDate).toISOString(),
            dueTime: task.dueTime,
            priority: task.priority?.toUpperCase(),
            completed: task.completed,
          }),
        });
      }
      // After save, refresh all events with tasks
      fetchAllEventsWithTasks();
    } catch {}
    setModalState({ type: null, data: null });
  };

  // Task delete
  const handleTaskDelete = async (taskId: string) => {
    try { await fetch(`/api/calendar/tasks?id=${taskId}`, { method: 'DELETE' }); } catch {}
    setModalState({ type: null, data: null });
    fetchAllEventsWithTasks();
  };

  const handleTaskToggle = async (id: string) => {
    try { await fetch(`/api/calendar/tasks?id=${id}&toggle=1`, { method: 'PUT' }); } catch {}
    fetchAllEventsWithTasks();
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

  // Helper to check if a date is today
  const isToday = (date: Date) => {
    const now = new Date();
    return date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
  };
  // Helper to check if a date is in the past
  const isPast = (date: Date) => {
    const now = new Date();
    return date < new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
                     ? 'bg-[color:var(--primary)] text-[color:var(--primary-foreground)]'
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
                  events={events.map(ev => ({ ...ev, isPast: isPast(new Date(ev.start)) }))}
                  onEventClick={(event: CalendarEvent) => setModalState({ type: 'event', data: event })}
                  onTimeSlotClick={(date: Date) => setModalState({ type: 'task', data: { dueDate: date, dueTime: date.toTimeString().slice(0,5) } })}
                />
              )}
              {calendarView === 'month' && (
                <MonthlyView
                  currentDate={currentDate}
                  events={events.map(ev => ({ ...ev, isPast: isPast(new Date(ev.start)) }))}
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
              {/* Today Card */}
              <div className="mb-6 p-4 rounded-lg border bg-[color:var(--card)]">
                <div className="font-bold text-xl mb-2 flex items-center gap-2">Today <span className="text-xs text-[color:var(--muted-foreground)]">({events.filter(ev => isToday(new Date(ev.start))).length})</span></div>
                {events.filter(ev => isToday(new Date(ev.start))).length > 0 ? (
                  events.filter(ev => isToday(new Date(ev.start))).map(event => (
                    <div key={event.id} className="mb-4">
                      <div className="font-semibold text-lg mb-2">{event.title} <span className="text-xs text-[color:var(--muted-foreground)]">{formatDate(new Date(event.start))}</span></div>
                      <TaskList
                        tasks={event.tasks || []}
                        onTaskClick={(task) => setModalState({ type: 'task', data: { ...task, eventId: event.id } })}
                        onTaskToggle={handleTaskToggle}
                        onAddTask={() => setModalState({ type: 'task', data: { eventId: event.id, dueDate: new Date(event.start) } })}
                        selectedDate={selectedTaskDate}
                        onDateChange={(d) => setSelectedTaskDate(d)}
                      />
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-8">
                    <div className="text-[color:var(--muted-foreground)] mb-2">No tasks</div>
                    <button
                      className="flex items-center gap-2 px-4 py-2 rounded bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:opacity-90 font-semibold"
                      onClick={() => setModalState({ type: 'task', data: { dueDate: new Date(), eventId: undefined } })}
                    >
                      <Plus size={18} /> Add Task
                    </button>
                  </div>
                )}
              </div>

              {/* Upcoming Card */}
              <div className="mb-6 p-4 rounded-lg border bg-[color:var(--card)]">
                <div className="font-bold text-xl mb-2 flex items-center gap-2">Upcoming <span className="text-xs text-[color:var(--muted-foreground)]">({events.filter(ev => {
                  const d = new Date(ev.start);
                  return d > new Date(new Date().setHours(23,59,59,999));
                }).length})</span></div>
                {events.filter(ev => {
                  const d = new Date(ev.start);
                  return d > new Date(new Date().setHours(23,59,59,999));
                }).length > 0 ? (
                  events.filter(ev => {
                    const d = new Date(ev.start);
                    return d > new Date(new Date().setHours(23,59,59,999));
                  }).map(event => (
                    <div key={event.id} className="mb-4">
                      <div className="font-semibold text-lg mb-2">{event.title} <span className="text-xs text-[color:var(--muted-foreground)]">{formatDate(new Date(event.start))}</span></div>
                      <TaskList
                        tasks={event.tasks || []}
                        onTaskClick={(task) => setModalState({ type: 'task', data: { ...task, eventId: event.id } })}
                        onTaskToggle={handleTaskToggle}
                        onAddTask={() => setModalState({ type: 'task', data: { eventId: event.id, dueDate: new Date(event.start) } })}
                        selectedDate={selectedTaskDate}
                        onDateChange={(d) => setSelectedTaskDate(d)}
                      />
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-8">
                    <div className="text-[color:var(--muted-foreground)] mb-2">No tasks</div>
                    <button
                      className="flex items-center gap-2 px-4 py-2 rounded bg-[color:var(--primary)] text-[color:var,--primary-foreground)] hover:opacity-90 font-semibold"
                      onClick={() => setModalState({ type: 'task', data: { dueDate: new Date(new Date().setDate(new Date().getDate() + 1)), eventId: undefined } })}
                    >
                      <Plus size={18} /> Add Task
                    </button>
                  </div>
                )}
              </div>

              {/* Past Due Card as Dropdown */}
              <div className="mb-6 p-4 rounded-lg border bg-[color:var(--card)]">
                <button
                  className="w-full flex items-center justify-between font-bold text-xl mb-2 focus:outline-none bg-transparent px-0 text-white"
                  style={{ background: 'none', border: 'none' }}
                  onClick={() => setShowHistory(v => !v)}
                  aria-expanded={showHistory}
                >
                  <span className="flex items-center gap-2 text-white">Past Due <span className="text-xs text-white">({events.filter(ev => isPast(new Date(ev.start))).length})</span></span>
                  <span className={`transition-transform ${showHistory ? 'rotate-90' : ''} text-white`}><ChevronRight size={20} color="white" /></span>
                </button>
                {showHistory && (
                  <div>
                    {events.filter(ev => isPast(new Date(ev.start))).length > 0 ? (
                      events.filter(ev => isPast(new Date(ev.start))).map(event => (
                        <div key={event.id} className="mb-4 p-4 rounded-lg border bg-[color:var(--muted)]">
                          <div className="font-semibold text-lg mb-2 line-through">{event.title} <span className="text-xs text-[color:var(--muted-foreground)]">{formatDate(new Date(event.start))}</span></div>
                          <TaskList
                            tasks={event.tasks || []}
                            onTaskClick={(task) => setModalState({ type: 'task', data: { ...task, eventId: event.id } })}
                            onTaskToggle={handleTaskToggle}
                            onAddTask={() => setModalState({ type: 'task', data: { eventId: event.id, dueDate: new Date(event.start) } })}
                            selectedDate={selectedTaskDate}
                            onDateChange={(d) => setSelectedTaskDate(d)}
                          />
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8">
                        <div className="text-[color:var(--muted-foreground)] mb-2">No past due events</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {loadingTasks && <div className="text-sm text-[color:var(--muted-foreground)] mt-2">Loading events and tasks…</div>}
              {errorTasks && <div className="text-sm text-[color:var,--destructive)] mt-2">{errorTasks}</div>}
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