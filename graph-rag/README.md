This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# Graph RAG + Calendar API Additions

## Calendar Endpoints
All endpoints require authentication.

### Events
- GET /api/calendar/events?start=ISO&end=ISO
- POST /api/calendar/events (CalendarEventDTO)
- PATCH /api/calendar/events (id + partial CalendarEventDTO)
- DELETE /api/calendar/events?id=ID

### Tasks
- GET /api/calendar/tasks?date=ISO_DATE
- POST /api/calendar/tasks (TaskDTO)
- PATCH /api/calendar/tasks (id + partial TaskDTO)
- DELETE /api/calendar/tasks?id=ID

### Series
- GET /api/calendar/series
- POST /api/calendar/series { rrule, exdates?, notes? }
- PATCH /api/calendar/series { id, ... }
- DELETE /api/calendar/series?id=ID

### Reminders
- GET /api/calendar/reminders?eventId=EVENT_ID
- POST /api/calendar/reminders { eventId, minutesBefore, method? }
- DELETE /api/calendar/reminders?id=ID

### Attendees
- GET /api/calendar/attendees?eventId=EVENT_ID
- POST /api/calendar/attendees { eventId, userId? | email?, name? }
- PATCH /api/calendar/attendees { id, status }
- DELETE /api/calendar/attendees?id=ID

## Examples
```bash
# List events for a month
curl -H "Cookie: <auth>" 'http://localhost:3000/api/calendar/events?start=2025-11-01T00:00:00.000Z&end=2025-11-30T23:59:59.999Z'

# Create task
curl -X POST -H 'Content-Type: application/json' -H 'Cookie: <auth>' \
  -d '{"title":"Demo","dueDate":"2025-11-20T10:00:00.000Z","priority":"HIGH"}' \
  http://localhost:3000/api/calendar/tasks
```

Run `npx prisma generate` after modifying `prisma/schema.prisma`.

Run migrations:
```bash
npx prisma migrate dev --name init_calendar
```

## TODO
- Integrate frontend fetching
- Add optimistic UI updates
- Add recurrence expansion on client
