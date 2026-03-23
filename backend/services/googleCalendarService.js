const crypto = require('crypto');
const fetch = require('node-fetch');

const User = require('../models/User');
const Task = require('../models/Task');

const GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_CALENDAR_BASE_URL = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');
const GOOGLE_SYNC_BATCH_CONCURRENCY = Math.min(
  8,
  Math.max(1, Number.parseInt(process.env.GOOGLE_SYNC_BATCH_CONCURRENCY || '3', 10) || 3)
);
const GOOGLE_SYNC_RETRY_ATTEMPTS = Math.min(
  6,
  Math.max(1, Number.parseInt(process.env.GOOGLE_SYNC_RETRY_ATTEMPTS || '3', 10) || 3)
);
const GOOGLE_SYNC_RETRY_BASE_DELAY_MS = Math.min(
  5000,
  Math.max(100, Number.parseInt(process.env.GOOGLE_SYNC_RETRY_BASE_DELAY_MS || '400', 10) || 400)
);
const GOOGLE_SYNC_DELETE_BATCH_CONCURRENCY = Math.min(
  8,
  Math.max(
    1,
    Number.parseInt(process.env.GOOGLE_SYNC_DELETE_BATCH_CONCURRENCY || '3', 10) || 3
  )
);
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

const hasGoogleCalendarConfig = () =>
  Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI
  );

const buildOAuthUrl = (state) => {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || '',
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}`;
};

const generateOAuthState = () => crypto.randomBytes(24).toString('hex');

const tokenExpiryFromNow = (expiresInSeconds) =>
  new Date(Date.now() + Number(expiresInSeconds || 3600) * 1000);

const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

const parseGoogleApiError = async (response) => {
  let payload = null;
  try {
    payload = await response.json();
  } catch (e) {
    payload = null;
  }
  const message =
    payload?.error_description ||
    payload?.error?.message ||
    payload?.error ||
    `Google API request failed with status ${response.status}`;
  const error = new Error(message);
  error.statusCode = response.status;
  error.payload = payload;
  return error;
};

const isRetryableError = (error) => {
  if (!error) return false;
  if (!error.statusCode) return true;
  return RETRYABLE_STATUS_CODES.has(error.statusCode);
};

const withRetry = async (operation, options = {}) => {
  const maxAttempts = Math.max(1, options.maxAttempts || GOOGLE_SYNC_RETRY_ATTEMPTS);

  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      // attempt is 1-based for readability in logs/errors.
      // eslint-disable-next-line no-await-in-loop
      return await operation(attempt + 1);
    } catch (error) {
      const isLastAttempt = attempt >= maxAttempts - 1;
      if (isLastAttempt || !isRetryableError(error)) {
        throw error;
      }

      const backoffMs = GOOGLE_SYNC_RETRY_BASE_DELAY_MS * 2 ** attempt;
      // eslint-disable-next-line no-await-in-loop
      await wait(backoffMs);
    }

    attempt += 1;
  }

  return null;
};

const exchangeCodeForTokens = async (code) => {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || '',
    grant_type: 'authorization_code',
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw await parseGoogleApiError(response);
  }

  return response.json();
};

const refreshGoogleAccessToken = async (refreshToken) => {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    grant_type: 'refresh_token',
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw await parseGoogleApiError(response);
  }

  return response.json();
};

const fetchGoogleUserEmail = async (accessToken) => {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw await parseGoogleApiError(response);
  }

  const payload = await response.json();
  return payload?.email || null;
};

const loadUserForSync = async (userId) =>
  User.findById(userId).select(
    '+googleCalendar.accessToken +googleCalendar.refreshToken'
  );

const saveGoogleSyncError = async (user, errorMessage) => {
  if (!user) return;
  user.googleCalendar = user.googleCalendar || {};
  user.googleCalendar.lastSyncError = (errorMessage || '').toString().slice(0, 500);
  await user.save({ validateBeforeSave: false });
};

const saveGoogleSyncSuccess = async (user) => {
  if (!user) return;
  user.googleCalendar = user.googleCalendar || {};
  user.googleCalendar.lastSyncAt = new Date();
  user.googleCalendar.lastSyncError = undefined;
  await user.save({ validateBeforeSave: false });
};

const ensureGoogleAccessToken = async (user) => {
  const gc = user?.googleCalendar || {};
  const accessToken = gc.accessToken;
  const refreshToken = gc.refreshToken;
  const expiry = gc.tokenExpiryDate ? new Date(gc.tokenExpiryDate) : null;

  if (accessToken && expiry && expiry.getTime() - Date.now() > 60 * 1000) {
    return accessToken;
  }

  if (!refreshToken) {
    const error = new Error('Google Calendar refresh token missing');
    error.statusCode = 401;
    throw error;
  }

  const refreshed = await refreshGoogleAccessToken(refreshToken);
  gc.accessToken = refreshed.access_token;
  gc.tokenExpiryDate = tokenExpiryFromNow(refreshed.expires_in);
  gc.connected = true;
  gc.syncEnabled = true;
  gc.lastSyncError = undefined;
  user.googleCalendar = gc;
  await user.save({ validateBeforeSave: false });

  return gc.accessToken;
};

const toGoogleEventIdChunk = (value) =>
  (value || '')
    .toString()
    .toLowerCase()
    .replace(/[^a-v0-9]/g, '');

const buildDeterministicEventId = (taskDoc, userId) => {
  const taskChunk = toGoogleEventIdChunk(taskDoc?._id || crypto.randomBytes(12).toString('hex'));
  const userChunk = toGoogleEventIdChunk(userId).slice(-12);
  const composed = `task${userChunk}${taskChunk}`;

  if (composed.length >= 5) {
    return composed.slice(0, 200);
  }

  return `task${crypto.randomBytes(6).toString('hex')}`;
};

const reserveTaskEventId = async (userId, taskDoc) => {
  if (!taskDoc) {
    return null;
  }

  if (taskDoc.googleCalendarEventId) {
    return taskDoc.googleCalendarEventId;
  }

  const deterministicEventId = buildDeterministicEventId(taskDoc, userId);

  const reservedTask = await Task.findOneAndUpdate(
    {
      _id: taskDoc._id,
      userId,
      $or: [
        { googleCalendarEventId: null },
        { googleCalendarEventId: { $exists: false } },
      ],
    },
    {
      $set: { googleCalendarEventId: deterministicEventId },
    },
    {
      new: true,
    }
  ).select('googleCalendarEventId');

  if (reservedTask?.googleCalendarEventId) {
    taskDoc.googleCalendarEventId = reservedTask.googleCalendarEventId;
    return reservedTask.googleCalendarEventId;
  }

  const existingTask = await Task.findOne({ _id: taskDoc._id, userId }).select(
    'googleCalendarEventId'
  );
  const finalEventId = existingTask?.googleCalendarEventId || deterministicEventId;

  taskDoc.googleCalendarEventId = finalEventId;
  return finalEventId;
};

const toValidDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const resolveTaskEventWindow = (task) => {
  const defaultStart = new Date();
  const start = toValidDate(task?.startTime) || defaultStart;

  let end = toValidDate(task?.endTime) || toValidDate(task?.dueDate);
  if (!end || end <= start) {
    end = new Date(start.getTime() + 30 * 60 * 1000);
  }

  return { start, end };
};

const buildCalendarEventPayload = (task) => {
  const { start, end } = resolveTaskEventWindow(task);
  const dueDate = toValidDate(task?.dueDate) || end;
  const goalId = task?.goalId?.toString ? task.goalId.toString() : '';

  const descriptionLines = [];
  if (task?.description) {
    descriptionLines.push(task.description);
  }
  descriptionLines.push(`Status: ${task?.status || 'scheduled'}`);
  if (dueDate) {
    descriptionLines.push(`Due: ${dueDate.toISOString()}`);
  }
  descriptionLines.push(`Chronify Task ID: ${task?._id}`);

  return {
    summary: task?.title || 'Untitled Task',
    description: descriptionLines.join('\n'),
    start: {
      dateTime: start.toISOString(),
      timeZone: 'UTC',
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: 'UTC',
    },
    extendedProperties: {
      private: {
        chronifyTaskId: task?._id?.toString() || '',
        chronifyGoalId: goalId,
        chronifyStatus: task?.status || 'scheduled',
      },
    },
  };
};

const callCalendarApi = async ({
  accessToken,
  method,
  calendarId,
  eventId,
  body,
}) => {
  const encodedCalendarId = encodeURIComponent(calendarId || 'primary');
  const encodedEventId = eventId ? `/${encodeURIComponent(eventId)}` : '';
  const endpoint = `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodedCalendarId}/events${encodedEventId}`;

  const response = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return response;
};

const upsertCalendarEvent = async ({
  accessToken,
  calendarId,
  eventId,
  payload,
}) => {
  const patchResponse = await callCalendarApi({
    accessToken,
    method: 'PATCH',
    calendarId,
    eventId,
    body: payload,
  });

  if (patchResponse.ok) {
    return patchResponse;
  }

  if (patchResponse.status !== 404) {
    throw await parseGoogleApiError(patchResponse);
  }

  const createResponse = await callCalendarApi({
    accessToken,
    method: 'POST',
    calendarId,
    body: {
      ...payload,
      id: eventId,
    },
  });

  if (createResponse.ok) {
    return createResponse;
  }

  if (createResponse.status === 409) {
    const patchAfterConflict = await callCalendarApi({
      accessToken,
      method: 'PATCH',
      calendarId,
      eventId,
      body: payload,
    });

    if (patchAfterConflict.ok) {
      return patchAfterConflict;
    }

    throw await parseGoogleApiError(patchAfterConflict);
  }

  throw await parseGoogleApiError(createResponse);
};

const deleteCalendarEvent = async ({
  accessToken,
  calendarId,
  eventId,
}) => {
  const response = await callCalendarApi({
    accessToken,
    method: 'DELETE',
    calendarId,
    eventId,
  });

  if (!response.ok && response.status !== 404) {
    throw await parseGoogleApiError(response);
  }
};

const syncTaskUpsert = async (userId, taskDoc) => {
  if (!hasGoogleCalendarConfig() || !taskDoc) return;

  const user = await loadUserForSync(userId);
  if (!user?.googleCalendar?.connected || user.googleCalendar.syncEnabled === false) {
    return;
  }

  try {
    const eventId = await reserveTaskEventId(userId, taskDoc);
    const payload = buildCalendarEventPayload(taskDoc);

    const response = await withRetry(async () => {
      const accessToken = await ensureGoogleAccessToken(user);
      return upsertCalendarEvent({
        accessToken,
        calendarId: user.googleCalendar.calendarId || 'primary',
        eventId,
        payload,
      });
    });

    if (!response.ok) {
      throw await parseGoogleApiError(response);
    }

    const event = await response.json();
    const syncedEventId = event?.id || eventId;

    if (syncedEventId && syncedEventId !== taskDoc.googleCalendarEventId) {
      await Task.updateOne(
        { _id: taskDoc._id, userId },
        { $set: { googleCalendarEventId: syncedEventId } }
      );
      taskDoc.googleCalendarEventId = syncedEventId;
    }

    await saveGoogleSyncSuccess(user);
  } catch (error) {
    await saveGoogleSyncError(user, error.message);
  }
};

const syncTaskDelete = async (userId, taskDoc) => {
  if (!hasGoogleCalendarConfig() || !taskDoc?.googleCalendarEventId) return;

  const user = await loadUserForSync(userId);
  if (!user?.googleCalendar?.connected || user.googleCalendar.syncEnabled === false) {
    return;
  }

  try {
    await withRetry(async () => {
      const accessToken = await ensureGoogleAccessToken(user);
      await deleteCalendarEvent({
        accessToken,
        calendarId: user.googleCalendar.calendarId || 'primary',
        eventId: taskDoc.googleCalendarEventId,
      });
    });

    await saveGoogleSyncSuccess(user);
  } catch (error) {
    await saveGoogleSyncError(user, error.message);
  }
};

const syncTasksBatch = async (userId, tasks = []) => {
  if (!Array.isArray(tasks) || tasks.length === 0) return;

  const queue = tasks.slice();
  const workerCount = Math.min(GOOGLE_SYNC_BATCH_CONCURRENCY, queue.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) continue;
      // eslint-disable-next-line no-await-in-loop
      await syncTaskUpsert(userId, task);
    }
  });

  await Promise.all(workers);
};

const syncTaskDeleteBatch = async (userId, tasks = []) => {
  if (!Array.isArray(tasks) || tasks.length === 0) return;

  const queue = tasks.slice();
  const workerCount = Math.min(GOOGLE_SYNC_DELETE_BATCH_CONCURRENCY, queue.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) continue;
      // eslint-disable-next-line no-await-in-loop
      await syncTaskDelete(userId, task);
    }
  });

  await Promise.all(workers);
};

const applyCalendarEventToTask = async (userId, calendarEvent) => {
  const taskId = calendarEvent?.extendedProperties?.private?.chronifyTaskId;
  if (!taskId) return null;

  const task = await Task.findOne({ _id: taskId, userId });
  if (!task) return null;

  const patch = {
    title: calendarEvent.summary || task.title,
    description: calendarEvent.description || task.description,
  };

  if (calendarEvent.start?.dateTime) {
    patch.startTime = new Date(calendarEvent.start.dateTime);
  }
  if (calendarEvent.end?.dateTime) {
    patch.endTime = new Date(calendarEvent.end.dateTime);
    patch.dueDate = new Date(calendarEvent.end.dateTime);
  }

  const updatedTask = await Task.findOneAndUpdate(
    { _id: taskId, userId },
    { $set: patch },
    { new: true, runValidators: true }
  );

  return updatedTask;
};

const getGoogleCalendarStatus = (user) => {
  const gc = user?.googleCalendar || {};
  return {
    configured: hasGoogleCalendarConfig(),
    connected: Boolean(gc.connected && gc.syncEnabled !== false),
    email: gc.email || null,
    calendarId: gc.calendarId || 'primary',
    syncEnabled: gc.syncEnabled !== false,
    lastSyncAt: gc.lastSyncAt || null,
    lastSyncError: gc.lastSyncError || null,
  };
};

module.exports = {
  GOOGLE_SCOPES,
  applyCalendarEventToTask,
  buildOAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleUserEmail,
  generateOAuthState,
  getGoogleCalendarStatus,
  hasGoogleCalendarConfig,
  loadUserForSync,
  syncTaskDelete,
  syncTaskDeleteBatch,
  syncTaskUpsert,
  syncTasksBatch,
  tokenExpiryFromNow,
};
