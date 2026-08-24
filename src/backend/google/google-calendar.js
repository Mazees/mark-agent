import { google } from 'googleapis'
import { getAuthClient } from './google-service.js'

/**
 * Helper to initialize the Calendar API.
 */
export async function getCalendarApi(clientId, clientSecret) {
  const auth = await getAuthClient(clientId, clientSecret)
  if (!auth) throw new Error('Not connected to Google Workspace.')
  return google.calendar({ version: 'v3', auth })
}

/**
 * gcalendar-list: Get upcoming events.
 */
export async function listEvents(clientId, clientSecret, maxResults = 10, timeMin = new Date().toISOString()) {
  const calendar = await getCalendarApi(clientId, clientSecret)
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  })
  return res.data.items.map(event => ({
    id: event.id,
    summary: event.summary,
    description: event.description,
    start: event.start.dateTime || event.start.date,
    end: event.end.dateTime || event.end.date,
    link: event.htmlLink
  }))
}

/**
 * gcalendar-create: Create a new event.
 */
export async function createEvent(clientId, clientSecret, summary, description, startTime, endTime) {
  const calendar = await getCalendarApi(clientId, clientSecret)
  const event = {
    summary,
    description,
    start: {
      dateTime: new Date(startTime).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: new Date(endTime).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  }
  const res = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
  })
  return res.data
}

/**
 * gcalendar-delete: Delete an event.
 */
export async function deleteEvent(clientId, clientSecret, eventId) {
  const calendar = await getCalendarApi(clientId, clientSecret)
  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
  })
  return { success: true, message: 'Event deleted successfully.' }
}
