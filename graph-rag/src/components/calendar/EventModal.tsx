import React, { useState } from "react";
import { X } from "lucide-react";
import { CalendarEvent } from "@/types";

interface EventModalProps {
  event: Partial<CalendarEvent> | null;
  onClose: () => void;
  onSave: (event: CalendarEvent) => void;
  onDelete: (id: string) => void;
}

const COLORS = [
  { name: "Blue", value: "#3b82f6" },
  { name: "Red", value: "#ef4444" },
  { name: "Green", value: "#10b981" },
  { name: "Orange", value: "#f59e0b" },
  { name: "Purple", value: "#8b5cf6" },
  { name: "Pink", value: "#ec4899" },
] as const;

export const EventModal: React.FC<EventModalProps> = ({
  event,
  onClose,
  onSave,
  onDelete,
}) => {
  const [formData, setFormData] = useState({
    title: event?.title || "",
    start: event?.start
      ? new Date(event.start).toISOString().slice(0, 16)
      : "",
    end: event?.end ? new Date(event.end).toISOString().slice(0, 16) : "",
    color: event?.color || "#3b82f6",
    description: event?.description || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...event,
      ...formData,
      start: new Date(formData.start),
      end: new Date(formData.end),
      id: event?.id || crypto.randomUUID(),
    } as CalendarEvent);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-panel max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">
            {event?.id ? "Edit Event" : "New Event"}
          </h2>
          <button
            onClick={onClose}
            className="btn-icon h-8 w-8"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              className="input"
              placeholder="Event title"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Start</label>
              <input
                type="datetime-local"
                value={formData.start}
                onChange={(e) =>
                  setFormData({ ...formData, start: e.target.value })
                }
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">End</label>
              <input
                type="datetime-local"
                value={formData.end}
                onChange={(e) =>
                  setFormData({ ...formData, end: e.target.value })
                }
                className="input"
                required
              />
            </div>
          </div>

          <div>
            <label className="label">Color</label>
            <div className="flex gap-2">
              {COLORS.map(({ name, value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormData({ ...formData, color: value })}
                  className={`w-10 h-10 rounded-full transition-transform hover:scale-110 ${
                    formData.color === value
                      ? "ring-2 ring-offset-2 ring-offset-background ring-ring scale-110"
                      : ""
                  }`}
                  style={{ backgroundColor: value }}
                  title={name}
                  aria-label={`Select ${name} color`}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="input resize-none"
              rows={3}
              placeholder="Add event details..."
            />
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t border-border">
            {event?.id && (
              <button
                type="button"
                onClick={() => onDelete(event.id!)}
                className="btn btn-danger"
              >
                Delete
              </button>
            )}
            <button type="button" onClick={onClose} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
