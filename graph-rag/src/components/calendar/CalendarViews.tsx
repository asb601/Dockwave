"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { getWeekDays, getMonthDays, isSameDay } from "@/lib/dateUtils";
import type { CalendarEvent, Month } from "@/types";

/* ═══════════════════════════════════════════════════════════════════════════════
   Weekly View
   ═══════════════════════════════════════════════════════════════════════════════ */

interface WeeklyViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onSlotClick: (date: Date) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const WeeklyView: React.FC<WeeklyViewProps> = ({
  currentDate,
  events,
  onEventClick,
  onSlotClick,
}) => {
  const days = getWeekDays(currentDate);
  const today = new Date();

  const getEventsForSlot = (day: Date, hour: number) =>
    events.filter((e) => {
      const start = new Date(e.start);
      return isSameDay(start, day) && start.getHours() === hour;
    });

  return (
    <div className="overflow-auto no-scrollbar rounded-xl border border-border">
      <div className="min-w-[720px]">
        {/* header */}
        <div className="grid grid-cols-8 border-b border-border bg-muted/30">
          <div className="p-2 text-xs font-medium text-muted-foreground" />
          {days.map((day, i) => (
            <div
              key={i}
              className={cn(
                "p-2 text-center text-xs font-medium",
                isSameDay(day, today)
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground"
              )}
            >
              <span className="block">{DAY_LABELS[day.getDay()]}</span>
              <span className="text-lg leading-tight">{day.getDate()}</span>
            </div>
          ))}
        </div>

        {/* body */}
        {HOURS.map((hour) => (
          <div key={hour} className="grid grid-cols-8 border-b border-border last:border-b-0">
            <div className="flex items-start justify-end p-2 pr-3 text-[11px] text-muted-foreground">
              {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
            </div>

            {days.map((day, di) => {
              const slotEvents = getEventsForSlot(day, hour);
              return (
                <div
                  key={di}
                  className="relative min-h-[3rem] border-l border-border p-0.5 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => {
                    const d = new Date(day);
                    d.setHours(hour, 0, 0, 0);
                    onSlotClick(d);
                  }}
                >
                  {slotEvents.map((ev) => (
                    <button
                      key={ev.id}
                      className="w-full rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white truncate mb-0.5"
                      style={{ backgroundColor: ev.color || "#3b82f6" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(ev);
                      }}
                    >
                      {ev.title}
                    </button>
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

/* ═══════════════════════════════════════════════════════════════════════════════
   Monthly View
   ═══════════════════════════════════════════════════════════════════════════════ */

interface MonthlyViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDayClick: (date: Date) => void;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const MonthlyView: React.FC<MonthlyViewProps> = ({
  currentDate,
  events,
  onEventClick,
  onDayClick,
}) => {
  const days = getMonthDays(currentDate);
  const today = new Date();

  const getEventsForDay = (date: Date) =>
    events.filter((e) => isSameDay(new Date(e.start), date));

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* header */}
      <div className="grid grid-cols-7 bg-muted/30">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="p-1.5 sm:p-2 text-center text-[10px] sm:text-xs font-medium text-muted-foreground">
            <span className="sm:hidden">{d[0]}</span>
            <span className="hidden sm:inline">{d}</span>
          </div>
        ))}
      </div>

      {/* days grid */}
      <div className="grid grid-cols-7">
        {days.map(({ date, isCurrentMonth }, i) => {
          const dayEvents = getEventsForDay(date);
          const isToday = isSameDay(date, today);

          return (
            <div
              key={i}
              className={cn(
                "min-h-[3.5rem] sm:min-h-[5.5rem] border-t border-l border-border p-1 sm:p-1.5 transition-colors cursor-pointer hover:bg-muted/30",
                !isCurrentMonth && "bg-muted/10 text-muted-foreground"
              )}
              onClick={() => onDayClick(date)}
            >
              <span
                className={cn(
                  "inline-flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full text-[10px] sm:text-xs font-medium",
                  isToday && "bg-primary text-primary-foreground font-bold"
                )}
              >
                {date.getDate()}
              </span>

              <div className="mt-0.5 sm:mt-1 space-y-0.5">
                {dayEvents.slice(0, 2).map((ev) => (
                  <button
                    key={ev.id}
                    className="w-full truncate rounded px-1 sm:px-1.5 py-0.5 text-left text-[9px] sm:text-[11px] font-medium text-white"
                    style={{ backgroundColor: ev.color || "#3b82f6" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(ev);
                    }}
                  >
                    {ev.title}
                  </button>
                ))}
                {dayEvents.length > 2 && (
                  <p className="px-1 text-[9px] sm:text-[10px] text-muted-foreground">
                    +{dayEvents.length - 2} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   Yearly View
   ═══════════════════════════════════════════════════════════════════════════════ */

interface YearlyViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onMonthClick: (date: Date) => void;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const YearlyView: React.FC<YearlyViewProps> = ({
  currentDate,
  events,
  onMonthClick,
}) => {
  const year = currentDate.getFullYear();
  const today = new Date();

  const months: Month[] = MONTH_NAMES.map((name, i) => ({
    name,
    date: new Date(year, i, 1),
  }));

  const getEventCountForMonth = (month: number) =>
    events.filter((e) => {
      const d = new Date(e.start);
      return d.getMonth() === month && d.getFullYear() === year;
    }).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {months.map((m, i) => {
        const count = getEventCountForMonth(i);
        const isCurrentMonth =
          today.getMonth() === i && today.getFullYear() === year;

        return (
          <button
            key={m.name}
            onClick={() => onMonthClick(m.date)}
            className={cn(
              "card-padded text-left transition-all hover:ring-2 hover:ring-primary/30",
              isCurrentMonth && "ring-2 ring-primary"
            )}
          >
            <h3
              className={cn(
                "text-sm font-semibold",
                isCurrentMonth ? "text-primary" : "text-foreground"
              )}
            >
              {m.name}
            </h3>
            {count > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {count} event{count !== 1 ? "s" : ""}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground/50">No events</p>
            )}
          </button>
        );
      })}
    </div>
  );
};
