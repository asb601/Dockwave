// ai/app/tools/getMeetings.ts
// Tool to fetch all events and tasks for the current user from the Next.js API

import fetch from 'node-fetch';

/**
 * Fetch all calendar events (with tasks) for the current user.
 * @param {string} apiBaseUrl - The base URL of the Next.js API (e.g. http://localhost:3000)
 * @param {string} authToken - The user's auth token (JWT/cookie)
 * @returns {Promise<{ events: any[] }>} - Array of events (each with tasks[])
 */
export async function getMeetings(apiBaseUrl: string, authToken: string) {
  const url = `${apiBaseUrl}/api/calendar/events`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `next-auth.session-token=${authToken}`,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data;
}

// Usage: LLM or agent can call getMeetings(apiBaseUrl, authToken) to get all meetings/tasks for the user.
