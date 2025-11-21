// components/calendar/CalendarViews.tsx
import React from 'react';
import { CalendarEvent } from '@/types';
import { getWeekDays, getMonthDays, isSameDay } from '@/utils/dateUtils';
import { cn } from '@/utils/cn';

interface WeeklyViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onTimeSlotClick: (date: Date) => void;
}

export const WeeklyView: React.FC<WeeklyViewProps> = ({ currentDate, events, onEventClick, onTimeSlotClick }) => {
  const weekDays = getWeekDays(currentDate);
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const getEventsForTimeSlot = (day: Date, hour: number) => {
    return events.filter((event) => {
      const eventStart = new Date(event.start);
      return isSameDay(eventStart, day) && eventStart.getHours() === hour;
    });
  };

  return (
    <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-lg overflow-hidden shadow-sm">
      <div className="grid grid-cols-8 border-b border-[color:var(--border)] bg-[color:var(--secondary)]/50">
        <div className="p-3 text-sm font-medium text-[color:var(--muted-foreground)]">Time</div>
        {weekDays.map((day, i) => (
          <div key={i} className="p-3 text-center border-l border-[color:var(--border)]">
            <div className="text-sm font-medium text-[color:var(--foreground)]">
              {day.toLocaleDateString('en-US', { weekday: 'short' })}
            </div>
            <div className={cn(
              "text-lg mt-1",
              isSameDay(day, new Date()) && "text-primary font-bold"
            )}>
              {day.getDate()}
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-y-auto max-h-[600px]">
        {hours.map(hour => (
          <div key={hour} className="grid grid-cols-8 border-b border-[color:var(--border)] hover:bg-[color:var(--accent)]/50 transition-colors">
            <div className="p-3 text-sm text-[color:var(--muted-foreground)] border-r border-[color:var(--border)]">
              {hour.toString().padStart(2, '0')}:00
            </div>
            {weekDays.map((day, i) => {
              const slotEvents = getEventsForTimeSlot(day, hour);
              return (
                <div
                  key={i}
                  className="p-1 border-l border-[color:var(--border)] min-h-[60px] cursor-pointer hover:bg-[color:var(--accent)]/30 transition-colors"
                  onClick={() => onTimeSlotClick(new Date(day.setHours(hour, 0)))}
                >
                  {slotEvents.map(event => (
                    <div
                      key={event.id}
                      className="text-xs p-2 mb-1 rounded text-white cursor-pointer hover:opacity-80 transition-opacity shadow-sm"
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

interface MonthlyViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDayClick: (date: Date) => void;
}

export const MonthlyView: React.FC<MonthlyViewProps> = ({ currentDate, events, onEventClick, onDayClick }) => {
  const monthDays = getMonthDays(currentDate);
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getEventsForDay = (day: Date) => {
    return events.filter((event) => isSameDay(new Date(event.start), day));
  };

  return (
    <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-lg overflow-hidden shadow-sm">
      <div className="grid grid-cols-7 border-b border-[color:var(--border)] bg-[color:var(--secondary)]/50">
        {weekDays.map(day => (
          <div key={day} className="p-3 text-center text-sm font-medium text-[color:var(--foreground)]">
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
              className={cn(
                "min-h-[100px] p-2 border-b border-r border-[color:var(--border)] cursor-pointer hover:bg-[color:var(--accent)]/50 transition-colors",
                !isCurrentMonth && "bg-[color:var(--secondary)]/30 text-[color:var(--muted-foreground)]"
              )}
              onClick={() => onDayClick(date)}
            >
              <div className={cn(
                "text-sm mb-1 inline-flex items-center justify-center",
                isToday && "bg-primary text-primary-foreground rounded-full w-7 h-7 font-bold"
              )}>
                {date.getDate()}
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map(event => (
                  <div
                    key={event.id}
                    className="text-xs p-1.5 rounded text-white truncate cursor-pointer hover:opacity-80 transition-opacity shadow-sm"
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
                  <div className="text-xs text-muted-foreground pl-1">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface YearlyViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onMonthClick: (date: Date) => void;
}

export const YearlyView: React.FC<YearlyViewProps> = ({ currentDate, events, onMonthClick }) => {
  const months = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(currentDate.getFullYear(), i, 1);
    return {
      name: date.toLocaleDateString('en-US', { month: 'long' }),
      date: date
    };
  });

  const getEventsForMonth = (month: number) => {
    return events.filter((event) => {
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
            className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-lg p-4 cursor-pointer hover:shadow-lg hover:border-[color:var(--ring)] transition-all"
            onClick={() => onMonthClick(month.date)}
          >
            <h3 className="font-semibold text-lg mb-3 text-[color:var(--foreground)]">{month.name}</h3>
            <div className="space-y-2">
              {monthEvents.slice(0, 5).map(event => (
                <div
                  key={event.id}
                  className="text-xs p-2 rounded text-white shadow-sm"
                  style={{ backgroundColor: event.color }}
                >
                  {new Date(event.start).getDate()} - {event.title}
                </div>
              ))}
              {monthEvents.length > 5 && (
                <div className="text-xs text-muted-foreground pl-2">
                  +{monthEvents.length - 5} more events
                </div>
              )}
              {monthEvents.length === 0 && (
                <div className="text-xs text-muted-foreground pl-2">No events</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};