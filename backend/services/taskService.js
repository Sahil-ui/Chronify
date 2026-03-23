const Task = require('../models/Task');
const Goal = require('../models/Goal');
const ProductivityLog = require('../models/ProductivityLog');
const googleCalendarService = require('./googleCalendarService');
const taskInstructionService = require('./taskInstructionService');

const ALLOWED_TASK_STATUSES = ['scheduled', 'completed', 'missed', 'skipped'];

const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const parseDateInput = (value, fieldName) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw badRequest(`${fieldName} must be a valid date`);
  }

  return parsed;
};

const ensureGoalBelongsToUser = async (goalId, userId) => {
  if (!goalId) {
    throw badRequest('goalId is required');
  }

  const goal = await Goal.findOne({ _id: goalId, userId }).select('_id');
  if (!goal) {
    const error = new Error('Goal not found');
    error.statusCode = 404;
    throw error;
  }
};

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
  dueDate,
  status = 'scheduled',
  reminderOffsetMinutes,
}) => {
  await ensureGoalBelongsToUser(goalId, userId);

  const normalizedStartTime = parseDateInput(startTime, 'startTime');
  const normalizedEndTime = parseDateInput(endTime, 'endTime');
  if (!normalizedStartTime || !normalizedEndTime) {
    throw badRequest('startTime and endTime are required');
  }
  const normalizedDueDate = parseDateInput(dueDate, 'dueDate') || normalizedEndTime;

  const reminderTime = calculateReminderTime(normalizedStartTime, reminderOffsetMinutes);
  const instructionPack = await taskInstructionService.generateTaskInstructionPack({
    title,
    description,
    localOnly: source === 'ai',
  });

  const task = await Task.create({
    userId,
    goalId,
    title,
    description,
    source,
    status,
    startTime: normalizedStartTime,
    endTime: normalizedEndTime,
    dueDate: normalizedDueDate,
    aiInstructions: instructionPack.aiInstructions,
    instructionProgress: instructionPack.instructionProgress,
    reminderOffsetMinutes: reminderOffsetMinutes ?? null,
    reminderTime,
  });

  await googleCalendarService.syncTaskUpsert(userId, task);

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
  if (!ALLOWED_TASK_STATUSES.includes(status)) {
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

  if (status === 'completed' && Array.isArray(task.aiInstructions?.steps) && task.aiInstructions.steps.length > 0) {
    task.aiInstructions.steps = task.aiInstructions.steps.map((step) => ({
      ...(step.toObject ? step.toObject() : step),
      completed: true,
      completedAt: step.completedAt || new Date(),
    }));
    task.instructionProgress = 100;
    await task.save();
  }

  await updateProductivityLogForTask(task);
  await googleCalendarService.syncTaskUpsert(userId, task);

  return task;
};

const updateTask = async (taskId, userId, updates) => {
  const patch = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );

  const shouldLoadExistingTask =
    patch.title !== undefined ||
    patch.description !== undefined ||
    patch.startTime !== undefined ||
    patch.endTime !== undefined ||
    patch.dueDate !== undefined ||
    patch.reminderOffsetMinutes !== undefined ||
    patch.goalId !== undefined;

  let existing = null;
  if (shouldLoadExistingTask) {
    existing = await Task.findOne({ _id: taskId, userId });
    if (!existing) {
      const err = new Error('Task not found');
      err.statusCode = 404;
      throw err;
    }
  }

  if (patch.goalId !== undefined) {
    if (!patch.goalId) {
      throw badRequest('A task must always be linked to exactly one goal');
    }
    await ensureGoalBelongsToUser(patch.goalId, userId);
  }

  if (patch.startTime !== undefined) {
    patch.startTime = parseDateInput(patch.startTime, 'startTime');
  }

  if (patch.endTime !== undefined) {
    patch.endTime = parseDateInput(patch.endTime, 'endTime');
  }

  if (patch.dueDate !== undefined) {
    patch.dueDate = parseDateInput(patch.dueDate, 'dueDate');
  } else if (patch.endTime !== undefined) {
    patch.dueDate = patch.endTime;
  }

  if (patch.startTime !== undefined || patch.reminderOffsetMinutes !== undefined) {
    const nextStartTime = patch.startTime || existing?.startTime;
    const nextOffset =
      patch.reminderOffsetMinutes !== undefined
        ? patch.reminderOffsetMinutes
        : existing?.reminderOffsetMinutes;
    patch.reminderTime = calculateReminderTime(nextStartTime, nextOffset);
    patch.reminderSent = false;
  }

  const shouldRegenerateInstructions =
    patch.title !== undefined || patch.description !== undefined;

  if (shouldRegenerateInstructions || (existing && !existing?.aiInstructions?.steps?.length)) {
    const nextTitle = patch.title !== undefined ? patch.title : existing?.title;
    const nextDescription =
      patch.description !== undefined ? patch.description : existing?.description;
    const instructionPack = await taskInstructionService.generateTaskInstructionPack({
      title: nextTitle,
      description: nextDescription,
      existingSteps: existing?.aiInstructions?.steps || [],
    });
    patch.aiInstructions = instructionPack.aiInstructions;
    patch.instructionProgress = instructionPack.instructionProgress;
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
  await googleCalendarService.syncTaskUpsert(userId, task);

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
  await googleCalendarService.syncTaskDelete(userId, task);
};

const updateTaskChecklistStep = async ({
  taskId,
  userId,
  stepId,
  completed,
}) => {
  const task = await Task.findOne({ _id: taskId, userId });

  if (!task) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  taskInstructionService.applyChecklistStepUpdate({
    task,
    stepId,
    completed,
  });

  await task.save();
  return task;
};

const deleteTasksByGoal = async (goalId, userId) => {
  const tasks = await Task.find({ goalId, userId });
  if (tasks.length === 0) {
    return { deletedTasks: 0 };
  }

  await Task.deleteMany({ goalId, userId });
  await Promise.allSettled(tasks.map((task) => updateProductivityLogForTask(task)));
  await googleCalendarService.syncTaskDeleteBatch(userId, tasks);

  return { deletedTasks: tasks.length };
};

const propagateGoalDeadlineToTasks = async ({ goalId, userId, deadline }) => {
  if (!deadline) {
    return { updatedTasks: 0 };
  }

  const normalizedDeadline = parseDateInput(deadline, 'deadline');
  const impactedTasks = await Task.find({
    goalId,
    userId,
    dueDate: { $gt: normalizedDeadline },
  });

  if (impactedTasks.length === 0) {
    return { updatedTasks: 0 };
  }

  const updates = impactedTasks.map((task) => {
    const nextUpdate = {
      dueDate: normalizedDeadline,
    };

    if (task.endTime && task.endTime > normalizedDeadline) {
      nextUpdate.endTime = normalizedDeadline;

      if (task.startTime >= normalizedDeadline) {
        const adjustedStart = new Date(normalizedDeadline.getTime() - 30 * 60 * 1000);
        nextUpdate.startTime = adjustedStart;

        if (task.reminderOffsetMinutes != null) {
          nextUpdate.reminderTime = calculateReminderTime(
            adjustedStart,
            task.reminderOffsetMinutes
          );
          nextUpdate.reminderSent = false;
        }
      }
    }

    return {
      updateOne: {
        filter: { _id: task._id, userId },
        update: { $set: nextUpdate },
      },
    };
  });

  await Task.bulkWrite(updates, { ordered: false });

  const refreshedTasks = await Task.find({
    userId,
    _id: { $in: impactedTasks.map((task) => task._id) },
  });

  await googleCalendarService.syncTasksBatch(userId, refreshedTasks);

  return { updatedTasks: refreshedTasks.length };
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
  updateTaskChecklistStep,
  deleteTask,
  deleteTasksByGoal,
  propagateGoalDeadlineToTasks,
};
