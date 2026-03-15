"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ListTodo,
  Plus,
} from "lucide-react";
import { formatDate } from "@/lib/dateUtils";
import { WeeklyView, MonthlyView, YearlyView } from "@/components/calendar/CalendarViews";
import { EventModal } from "@/components/calendar/EventModal";
import { TaskModal } from "@/components/tasks/TaskModal";
import { TaskList } from "@/components/tasks/TaskList";
import type {
  CalendarEvent,
  Task,
  ViewType,
  CalendarViewType,
  ModalState,
} from "@/types";

/* ── Helpers ────────────────────────────────────────────────────────────────── */

const VIEW_TABS: { value: ViewType; label: string; icon: React.ReactNode }[] = [
  { value: "calendar", label: "Calendar", icon: <CalendarIcon size={16} /> },
  { value: "tasks", label: "Tasks", icon: <ListTodo size={16} /> },
];

const CAL_VIEWS: CalendarViewType[] = ["week", "month", "year"];

const getDateRange = (
  date: Date,
  view: CalendarViewType
): { start: Date; end: Date } => {
  const y = date.getFullYear();
  const m = date.getMonth();

  switch (view) {
    case "week": {
      const s = new Date(date);
      s.setDate(s.getDate() - s.getDay());
      s.setHours(0, 0, 0, 0);
      const e = new Date(s);
      e.setDate(e.getDate() + 6);
      e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    }
    case "month":
      return {
        start: new Date(y, m, 1),
        end: new Date(y, m + 1, 0, 23, 59, 59, 999),
      };
    case "year":
      return {
        start: new Date(y, 0, 1),
        end: new Date(y, 11, 31, 23, 59, 59, 999),
      };
  }
};

const navigate = (date: Date, view: CalendarViewType, dir: -1 | 1) => {
  const d = new Date(date);
  if (view === "week") d.setDate(d.getDate() + dir * 7);
  else if (view === "month") d.setMonth(d.getMonth() + dir);
  else d.setFullYear(d.getFullYear() + dir);
  return d;
};

const headerLabel = (date: Date, view: CalendarViewType) => {
  if (view === "year") return `${date.getFullYear()}`;
  if (view === "month")
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const week = new Date(date);
  week.setDate(week.getDate() - week.getDay());
  const end = new Date(week);
  end.setDate(end.getDate() + 6);
  return `${formatDate(week)} – ${formatDate(end)}`;
};

/* ── Component ──────────────────────────────────────────────────────────────── */

export default function PersonalCalendarApp() {
  /* state */
  const [view, setView] = useState<ViewType>("calendar");
  const [calendarView, setCalendarView] = useState<CalendarViewType>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [modal, setModal] = useState<ModalState>({ type: null, data: null });
  const [loading, setLoading] = useState(false);
  const [taskDate, setTaskDate] = useState(new Date());

  /* derived */
  const allTasks = useMemo(
    () => events.flatMap((e) => e.tasks ?? []),
    [events]
  );

  /* ── Fetch events ──────────────────────────────────────────────────────── */

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange(currentDate, calendarView);
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
      });
      const res = await fetch(`/api/calendar/events?${params}`);
      if (!res.ok) throw new Error("Failed to fetch events");
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentDate, calendarView]);

  const fetchAllEventsWithTasks = useCallback(async () => {
    setLoading(true);
    try {
      const start = new Date();
      start.setMonth(start.getMonth() - 6);
      const end = new Date();
      end.setMonth(end.getMonth() + 6);

      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
      });
      const res = await fetch(`/api/calendar/events/eventsALL?${params}`);
      if (!res.ok) throw new Error("Failed to fetch events");
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : data.events ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "calendar") fetchEvents();
    else fetchAllEventsWithTasks();
  }, [view, fetchEvents, fetchAllEventsWithTasks]);

  /* ── Event CRUD ────────────────────────────────────────────────────────── */

  const handleSaveEvent = async (event: CalendarEvent) => {
    const isEdit = events.some((e) => e.id === event.id);
    const method = isEdit ? "PATCH" : "POST";
    const body = {
      ...(isEdit ? { id: event.id } : {}),
      title: event.title,
      description: event.description,
      start: new Date(event.start).toISOString(),
      end: new Date(event.end).toISOString(),
      color: event.color,
    };

    try {
      const res = await fetch("/api/calendar/events", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save event");
      setModal({ type: null, data: null });
      if (view === "calendar") { fetchEvents(); } else { fetchAllEventsWithTasks(); }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      const res = await fetch(`/api/calendar/events?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete event");
      setModal({ type: null, data: null });
      if (view === "calendar") { fetchEvents(); } else { fetchAllEventsWithTasks(); }
    } catch (err) {
      console.error(err);
    }
  };

  /* ── Task CRUD ─────────────────────────────────────────────────────────── */

  const handleSaveTask = async (task: Task) => {
    /* find which event the task belongs to, or pick the first event */
    const existingTask = allTasks.find((t) => t.id === task.id);
    const parentEvent = existingTask
      ? events.find((e) => e.tasks?.some((t) => t.id === task.id))
      : events[0];

    if (!parentEvent) {
      alert("Please create a calendar event first before adding tasks.");
      return;
    }

    const isEdit = !!existingTask;
    const method = isEdit ? "PATCH" : "POST";
    const body = {
      ...(isEdit ? { id: task.id } : { eventId: parentEvent.id }),
      title: task.title,
      description: task.description,
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : undefined,
      dueTime: task.dueTime,
      priority: task.priority.toUpperCase(),
      completed: task.completed,
    };

    try {
      const res = await fetch("/api/calendar/tasks", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save task");
      setModal({ type: null, data: null });
      if (view === "calendar") { fetchEvents(); } else { fetchAllEventsWithTasks(); }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      const res = await fetch(`/api/calendar/tasks?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete task");
      setModal({ type: null, data: null });
      if (view === "calendar") { fetchEvents(); } else { fetchAllEventsWithTasks(); }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleTask = async (task: Task) => {
    try {
      await fetch("/api/calendar/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, completed: !task.completed }),
      });
      if (view === "calendar") { fetchEvents(); } else { fetchAllEventsWithTasks(); }
    } catch (err) {
      console.error(err);
    }
  };

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <div className="page-container px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Calendar</h1>

        <div className="flex items-center gap-2">
          {/* view tabs */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {VIEW_TABS.map(({ value, label, icon }) => (
              <button
                key={value}
                onClick={() => setView(value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {icon}
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* new event / task */}
          <button
            onClick={() =>
              setModal({
                type: view === "calendar" ? "event" : "task",
                data: view === "calendar" ? { start: new Date(), end: new Date() } : {},
              })
            }
            className="btn btn-primary gap-1.5"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">
              {view === "calendar" ? "Event" : "Task"}
            </span>
          </button>
        </div>
      </div>

      {/* ── Calendar controls ────────────────────────────────────────── */}
      {view === "calendar" && (
        <div className="flex flex-wrap items-center gap-3 justify-between">
          {/* nav arrows + label */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setCurrentDate((d) => navigate(d, calendarView, -1))}
              className="btn-icon h-8 w-8"
            >
              <ChevronLeft size={18} />
            </button>
            <h2 className="min-w-0 text-center text-xs sm:text-sm font-semibold whitespace-nowrap">
              {headerLabel(currentDate, calendarView)}
            </h2>
            <button
              onClick={() => setCurrentDate((d) => navigate(d, calendarView, 1))}
              className="btn-icon h-8 w-8"
            >
              <ChevronRight size={18} />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="btn btn-outline text-xs ml-1 py-1 min-h-0 h-8"
            >
              Today
            </button>
          </div>

          {/* view switcher */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {CAL_VIEWS.map((v) => (
              <button
                key={v}
                onClick={() => setCalendarView(v)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  calendarView === v
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Loading indicator ────────────────────────────────────────── */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {/* ── Calendar views ───────────────────────────────────────────── */}
      {!loading && view === "calendar" && calendarView === "week" && (
        <WeeklyView
          currentDate={currentDate}
          events={events}
          onEventClick={(e) => setModal({ type: "event", data: e })}
          onSlotClick={(date) =>
            setModal({
              type: "event",
              data: {
                start: date,
                end: new Date(date.getTime() + 3600000),
              },
            })
          }
        />
      )}

      {!loading && view === "calendar" && calendarView === "month" && (
        <MonthlyView
          currentDate={currentDate}
          events={events}
          onEventClick={(e) => setModal({ type: "event", data: e })}
          onDayClick={(date) =>
            setModal({
              type: "event",
              data: {
                start: date,
                end: new Date(date.getTime() + 3600000),
              },
            })
          }
        />
      )}

      {!loading && view === "calendar" && calendarView === "year" && (
        <YearlyView
          currentDate={currentDate}
          events={events}
          onMonthClick={(date) => {
            setCurrentDate(date);
            setCalendarView("month");
          }}
        />
      )}

      {/* ── Tasks view ───────────────────────────────────────────────── */}
      {!loading && view === "tasks" && (
        <div className="card-padded">
          <TaskList
            tasks={allTasks}
            selectedDate={taskDate}
            onDateChange={setTaskDate}
            onToggle={handleToggleTask}
            onTaskClick={(t) => setModal({ type: "task", data: t })}
          />
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────── */}
      {modal.type === "event" && (
        <EventModal
          event={modal.data as Partial<CalendarEvent>}
          onClose={() => setModal({ type: null, data: null })}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
        />
      )}

      {modal.type === "task" && (
        <TaskModal
          task={modal.data as Partial<Task>}
          onClose={() => setModal({ type: null, data: null })}
          onSave={handleSaveTask}
          onDelete={handleDeleteTask}
        />
      )}
    </div>
  );
}
