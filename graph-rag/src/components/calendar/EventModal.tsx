// components/calendar/EventModal.tsx
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { CalendarEvent } from '@/types';

interface EventModalProps {
  event: Partial<CalendarEvent> | null;
  onClose: () => void;
  onSave: (event: CalendarEvent) => void;
  onDelete: (id: string) => void;
}

const colors = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Green', value: '#10b981' },
  { name: 'Orange', value: '#f59e0b' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' }
];

export const EventModal: React.FC<EventModalProps> = ({ event, onClose, onSave, onDelete }) => {
  const [formData, setFormData] = useState({
    title: event?.title || '',
    start: event?.start ? new Date(event.start).toISOString().slice(0, 16) : '',
    end: event?.end ? new Date(event.end).toISOString().slice(0, 16) : '',
    color: event?.color || '#3b82f6',
    description: event?.description || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...event,
      ...formData,
      start: new Date(formData.start),
      end: new Date(formData.end),
      id: event?.id || crypto.randomUUID()
    } as CalendarEvent);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-lg max-w-md w-full p-6 shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-[color:var(--foreground)]">
            {event?.id ? 'Edit Event' : 'New Event'}
          </h2>
          <button 
            onClick={onClose} 
            className="text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] transition-colors p-1 hover:bg-[color:var(--accent)] rounded"
          >
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full bg-[color:var(--secondary)] text-[color:var(--foreground)] border border-[color:var(--border)] rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
              placeholder="Event title"
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Start</label>
              <input
                type="datetime-local"
                value={formData.start}
                onChange={(e) => setFormData({ ...formData, start: e.target.value })}
                className="w-full bg-[color:var(--secondary)] text-[color:var(--foreground)] border border-[color:var(--border)] rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">End</label>
              <input
                type="datetime-local"
                value={formData.end}
                onChange={(e) => setFormData({ ...formData, end: e.target.value })}
                className="w-full bg-[color:var(--secondary)] text-[color:var(--foreground)] border border-[color:var(--border)] rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
                required
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Color</label>
            <div className="flex gap-2">
              {colors.map(({ name, value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormData({ ...formData, color: value })}
                  className={`w-10 h-10 rounded-full transition-transform hover:scale-110 ${
                    formData.color === value ? 'ring-2 ring-offset-2 ring-offset-[color:var(--background)] ring-[color:var(--ring)] scale-110' : ''
                  }`}
                  style={{ backgroundColor: value }}
                  title={name}
                  aria-label={`Select ${name} color`}
                />
              ))}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-[color:var(--secondary)] text-[color:var(--foreground)] border border-[color:var(--border)] rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] resize-none"
              rows={3}
              placeholder="Add event details..."
            />
          </div>
          
          <div className="flex gap-2 justify-end pt-4 border-t border-[color:var(--border)]">
            {event?.id && (
              <button
                type="button"
                onClick={() => onDelete(event.id!)}
                className="px-4 py-2 text-[color:var(--destructive)] hover:bg-[color:var(--destructive)]/10 rounded-md transition-colors"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[color:var(--secondary)] text-[color:var(--foreground)] border border-[color:var(--border)] rounded-md hover:bg-[color:var(--accent)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[color:var(--primary)] text-[color:var(--primary-foreground)] rounded-md hover:opacity-90 transition-opacity"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};