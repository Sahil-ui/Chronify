const Task = require('../models/Task');
const ProductivityLog = require('../models/ProductivityLog');

const calculateReminderTime = (startTime, reminderOffsetMinutes) => {
  if (!startTime || reminderOffsetMinutes == null) {
    return null;
  }

  const start = new Date(startTime);
  const reminder = new Date(start.getTime() - reminderOffsetMinutes * 60 * 1000);

  return reminder;
};

const createTask = async ({
  userId,
  goalId,
  title,
  description,
  source = 'manual',
  startTime,
  endTime,
  reminderOffsetMinutes,
}) => {
  const reminderTime = calculateReminderTime(startTime, reminderOffsetMinutes);

  const task = await Task.create({
    userId,
    goalId: goalId || null,
    title,
    description,
    source,
    startTime,
    endTime,
    reminderOffsetMinutes: reminderOffsetMinutes ?? null,
    reminderTime,
  });

  return task;
};

const listTasksForUser = async (userId, { from, to } = {}) => {
  const filter = { userId };

  if (from || to) {
    filter.startTime = {};
    if (from) filter.startTime.$gte = from;
    if (to) filter.startTime.$lte = to;
  }

  const tasks = await Task.find(filter).sort({ startTime: 1 });
  return tasks;
};

const updateTaskStatus = async (taskId, userId, status) => {
  const allowedStatuses = ['scheduled', 'completed', 'missed', 'skipped'];

  if (!allowedStatuses.includes(status)) {
    const error = new Error('Invalid status value');
    error.statusCode = 400;
    throw error;
  }

  const task = await Task.findOneAndUpdate(
    { _id: taskId, userId },
    { status },
    { new: true }
  );

  if (!task) {
    const error = new Error('Task not found');
    error.statusCode = 404;
    throw error;
  }

  await updateProductivityLogForTask(task);

  return task;
};

const updateTask = async (taskId, userId, updates) => {
  // Rebuild reminderTime if startTime or offset changes
  const patch = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );

  if (patch.startTime || patch.reminderOffsetMinutes !== undefined) {
    // Need the existing task to fill in whichever field wasn't updated
    const existing = await Task.findOne({ _id: taskId, userId });
    if (!existing) {
      const err = new Error('Task not found');
      err.statusCode = 404;
      throw err;
    }
    const start = patch.startTime ? new Date(patch.startTime) : existing.startTime;
    const offset = patch.reminderOffsetMinutes !== undefined
      ? patch.reminderOffsetMinutes
      : existing.reminderOffsetMinutes;
    patch.reminderTime = calculateReminderTime(start, offset);
    patch.reminderSent = false; // Reset so the job can re-fire if needed
  }

  if (patch.goalId !== undefined) {
    patch.goalId = patch.goalId || null;
  }

  const task = await Task.findOneAndUpdate(
    { _id: taskId, userId },
    patch,
    { new: true, runValidators: true }
  );

  if (!task) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  await updateProductivityLogForTask(task);

  return task;
};

const deleteTask = async (taskId, userId) => {
  const task = await Task.findOneAndDelete({ _id: taskId, userId });

  if (!task) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  // Refresh the log so analytics stay accurate
  await updateProductivityLogForTask(task);
};

const startOfDayUtc = (date) => {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const updateProductivityLogForTask = async (task) => {
  if (!task || !task.startTime) {
    return;
  }

  const day = startOfDayUtc(task.startTime);

  // Recompute metrics for that day based on all tasks
  const allTasksForDay = await Task.find({
    userId: task.userId,
    startTime: {
      $gte: day,
      $lt: new Date(day.getTime() + 24 * 60 * 60 * 1000),
    },
  });

  const tasksScheduled = allTasksForDay.length;
  const tasksCompleted = allTasksForDay.filter((t) => t.status === 'completed').length;

  const completionRate =
    tasksScheduled === 0 ? 0 : Math.round((tasksCompleted / tasksScheduled) * 100);

  // Basic focusScore: same as completionRate for MVP
  const focusScore = completionRate;

  await ProductivityLog.findOneAndUpdate(
    { userId: task.userId, date: day },
    {
      userId: task.userId,
      date: day,
      tasksCompleted,
      tasksScheduled,
      completionRate,
      focusScore,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

module.exports = {
  createTask,
  listTasksForUser,
  updateTaskStatus,
  updateTask,
  deleteTask,
};

