const aiService = require('../services/aiService');
const Goal = require('../models/Goal');
const Task = require('../models/Task');
const googleCalendarService = require('../services/googleCalendarService');
const taskInstructionService = require('../services/taskInstructionService');

const MIN_DAILY_HOURS = 0.5;
const MAX_DAILY_HOURS = 16;
const MIN_GOAL_DAYS = 1;
const MAX_GOAL_DAYS = 365;
const MIN_TASK_HOURS = 0.5;
const MAX_TASK_HOURS = 8;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WORKDAY_START_HOUR = 9;
const DAY_START_MINUTES = 0;
const DAY_END_MINUTES = 24 * 60;
const REPLAN_INTERVAL_DAYS = 7;
const REPLAN_LOOKBACK_DAYS = 7;
const REPLAN_AHEAD_DAYS = 7;

const ALLOWED_EXAM_TEMPLATES = new Set([
  'auto',
  'general',
  'ima',
  'nda',
  'cds',
  'upsc',
  'jee',
  'neet',
  'cat',
  'gate',
  'interview',
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const parseTargetDays = (body) => {
  const directDays = body.targetDays;
  if (directDays !== undefined && directDays !== null && directDays !== '') {
    const days = Number(directDays);
    if (!Number.isFinite(days) || days <= 0) {
      throw badRequest('targetDays must be a positive number');
    }
    return Math.round(clamp(days, MIN_GOAL_DAYS, MAX_GOAL_DAYS));
  }

  const durationValue = body.targetDurationValue ?? body.timeframeValue;
  if (durationValue === undefined || durationValue === null || durationValue === '') {
    return null;
  }

  const numericValue = Number(durationValue);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw badRequest('targetDurationValue must be a positive number');
  }

  const durationUnit = (body.targetDurationUnit ?? body.timeframeUnit ?? 'days')
    .toString()
    .trim()
    .toLowerCase();

  let computedDays;
  if (durationUnit === 'day' || durationUnit === 'days') {
    computedDays = numericValue;
  } else if (durationUnit === 'month' || durationUnit === 'months') {
    computedDays = numericValue * 30;
  } else {
    throw badRequest('targetDurationUnit must be "days" or "months"');
  }

  return Math.round(clamp(computedDays, MIN_GOAL_DAYS, MAX_GOAL_DAYS));
};

const parseDailyHours = (body) => {
  const value = body.dailyAvailableHours;
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw badRequest('dailyAvailableHours must be a positive number');
  }

  return Number(clamp(numericValue, MIN_DAILY_HOURS, MAX_DAILY_HOURS).toFixed(1));
};

const parseExamTemplate = (body) => {
  const value = body.examTemplate;
  if (value === undefined || value === null || value === '') {
    return 'auto';
  }
  const normalized = value.toString().trim().toLowerCase();
  if (!ALLOWED_EXAM_TEMPLATES.has(normalized)) {
    throw badRequest('examTemplate is invalid');
  }
  return normalized;
};

const parseCurrentLevel = (body) => {
  const value = body.currentLevel;
  if (value === undefined || value === null || value === '') {
    return '';
  }
  return value.toString().trim().slice(0, 60);
};

const parseWeakAreas = (body) => {
  const value = body.weakAreas;
  if (value === undefined || value === null || value === '') {
    return [];
  }

  const list = Array.isArray(value)
    ? value
    : value
        .toString()
        .split(',')
        .map((item) => item.trim());

  return list
    .map((item) => item.toString().trim())
    .filter(Boolean)
    .slice(0, 10);
};

const parsePreferredStudyWindow = (body) => {
  const value = body.preferredStudyWindow ?? body.preferred_time ?? body.preferredTimeWindow;
  if (value === undefined || value === null || value === '') {
    return '';
  }
  return value.toString().trim().slice(0, 80);
};

const normalizeMeridiem = (value) => {
  const normalized = (value || '').toString().trim().toLowerCase();
  if (normalized === 'am' || normalized === 'pm') {
    return normalized;
  }
  return '';
};

const parseClockToMinutes = ({ hourRaw, minuteRaw, meridiem, isEnd = false }) => {
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw || 0);
  const mer = normalizeMeridiem(meridiem);

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) {
    return null;
  }

  if (mer) {
    if (hour < 1 || hour > 12) {
      return null;
    }
    let convertedHour = hour % 12;
    if (mer === 'pm') {
      convertedHour += 12;
    }
    return convertedHour * 60 + minute;
  }

  if (hour < 0 || hour > 24) {
    return null;
  }
  if (hour === 24 && minute !== 0) {
    return null;
  }
  if (hour === 24 && !isEnd) {
    return null;
  }

  return hour * 60 + minute;
};

const parsePreferredTimeWindows = (windowText) => {
  const raw = (windowText || '').toString().trim();
  if (!raw) return [];

  const normalized = raw
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\bto\b/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  const segments = normalized
    .split(/\s*(?:,|;|\/|&|\band\b)\s*/i)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const ranges = [];
  for (const segment of segments) {
    const match = segment.match(
      /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i
    );
    if (!match) continue;

    const [, startHour, startMinute, startMerRaw, endHour, endMinute, endMerRaw] = match;
    let startMer = normalizeMeridiem(startMerRaw);
    let endMer = normalizeMeridiem(endMerRaw);

    if (!startMer && endMer) {
      startMer = endMer;
    } else if (startMer && !endMer) {
      endMer = startMer;
    }

    const startTotalMinutes = parseClockToMinutes({
      hourRaw: startHour,
      minuteRaw: startMinute,
      meridiem: startMer,
      isEnd: false,
    });
    const endTotalMinutes = parseClockToMinutes({
      hourRaw: endHour,
      minuteRaw: endMinute,
      meridiem: endMer,
      isEnd: true,
    });

    if (
      startTotalMinutes == null ||
      endTotalMinutes == null ||
      startTotalMinutes < DAY_START_MINUTES ||
      endTotalMinutes > DAY_END_MINUTES
    ) {
      continue;
    }

    if (endTotalMinutes <= startTotalMinutes) {
      continue;
    }

    ranges.push({
      startMinute: startTotalMinutes,
      endMinute: endTotalMinutes,
    });
  }

  if (ranges.length === 0) {
    return [];
  }

  const sorted = ranges.sort((a, b) => a.startMinute - b.startMinute);
  const merged = [];

  for (const range of sorted) {
    if (merged.length === 0) {
      merged.push({ ...range });
      continue;
    }

    const previous = merged[merged.length - 1];
    if (range.startMinute <= previous.endMinute) {
      previous.endMinute = Math.max(previous.endMinute, range.endMinute);
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
};

const getTotalWindowMinutes = (timeWindows = []) =>
  timeWindows.reduce((sum, slot) => sum + Math.max(0, slot.endMinute - slot.startMinute), 0);

const formatTimeLabel = (date) =>
  date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

const formatTaskTimeRange = (startTime, endTime) => `${formatTimeLabel(startTime)} - ${formatTimeLabel(endTime)}`;

const buildTimedStepSchedule = (task) => {
  const steps = Array.isArray(task?.aiInstructions?.steps) ? task.aiInstructions.steps : [];
  if (!steps.length || !task?.startTime || !task?.endTime) {
    return [];
  }

  const startMs = new Date(task.startTime).getTime();
  const endMs = new Date(task.endTime).getTime();
  const totalMinutes = Math.max(1, Math.round((endMs - startMs) / MINUTE_MS));
  const baseStepMinutes = Math.max(1, Math.floor(totalMinutes / steps.length));
  let remainingMinutes = totalMinutes;
  let cursorMs = startMs;

  return steps.map((step, index) => {
    const remainingSteps = steps.length - index;
    const minutesForThisStep =
      remainingSteps <= 1 ? remainingMinutes : Math.max(1, Math.min(baseStepMinutes, remainingMinutes));
    const stepStart = new Date(cursorMs);
    const stepEnd = new Date(stepStart.getTime() + minutesForThisStep * MINUTE_MS);

    cursorMs = stepEnd.getTime();
    remainingMinutes = Math.max(0, remainingMinutes - minutesForThisStep);

    return {
      text: step?.text || '',
      time: formatTaskTimeRange(stepStart, stepEnd),
      startTime: stepStart,
      endTime: stepEnd,
    };
  });
};

const triggerGoogleSyncInBackground = (userId, tasks = []) => {
  if (!Array.isArray(tasks) || tasks.length === 0) return;

  setImmediate(() => {
    googleCalendarService.syncTasksBatch(userId, tasks).catch((error) => {
      console.error('Google Calendar background sync failed:', error.message);
    });
  });
};

const buildTaskDocsWithInstructions = async ({
  scheduledTasks = [],
  userId,
  goalId,
  source,
  planType,
  localOnly = true,
}) => {
  const taskDocs = [];

  for (const task of scheduledTasks) {
    // AI-generated goal flows can create many tasks; local-only instruction generation
    // keeps this responsive while still producing structured guidance.
    // eslint-disable-next-line no-await-in-loop
    const instructionPack = await taskInstructionService.generateTaskInstructionPack({
      title: task.title,
      description: task.description,
      localOnly,
    });

    taskDocs.push({
      userId,
      goalId,
      title: task.title,
      description: task.description,
      source,
      planType,
      startTime: task.startTime,
      endTime: task.endTime,
      dueDate: task.endTime,
      aiInstructions: instructionPack.aiInstructions,
      instructionProgress: instructionPack.instructionProgress,
    });
  }

  return taskDocs;
};

const normalizeTaskDurations = (tasks = []) =>
  tasks.map((task) => {
    const hours = Number(task?.durationHours);
    const normalizedHours = Number.isFinite(hours) ? hours : 1;
    return {
      title: task?.title || 'Untitled task',
      description: task?.description || 'Work on this step.',
      durationHours: Number(clamp(normalizedHours, MIN_TASK_HOURS, MAX_TASK_HOURS).toFixed(1)),
    };
  });

const getTotalMinutes = (taskList) =>
  taskList.reduce((sum, task) => sum + Math.round(task.durationHours * 60), 0);

const fitTasksWithinBudget = (tasks, targetDays, dailyAvailableHours) => {
  const normalizedTasks = normalizeTaskDurations(tasks);
  if (!targetDays || !dailyAvailableHours) {
    return normalizedTasks;
  }

  const budgetMinutes = Math.round(targetDays * dailyAvailableHours * 60);
  if (budgetMinutes <= 0) {
    return normalizedTasks;
  }

  const currentMinutes = getTotalMinutes(normalizedTasks);
  if (currentMinutes <= budgetMinutes) {
    return normalizedTasks;
  }

  const scale = budgetMinutes / currentMinutes;
  const scaledTasks = normalizedTasks.map((task) => ({
    ...task,
    durationHours: Number(
      clamp(task.durationHours * scale, MIN_TASK_HOURS, MAX_TASK_HOURS).toFixed(1)
    ),
  }));

  let totalMinutes = getTotalMinutes(scaledTasks);
  let guard = 4000;
  while (totalMinutes > budgetMinutes && guard > 0) {
    guard -= 1;
    let maxIndex = -1;
    let maxHours = MIN_TASK_HOURS;

    for (let i = 0; i < scaledTasks.length; i += 1) {
      if (scaledTasks[i].durationHours > maxHours) {
        maxHours = scaledTasks[i].durationHours;
        maxIndex = i;
      }
    }

    if (maxIndex === -1) {
      break;
    }

    const reduced = Number((scaledTasks[maxIndex].durationHours - 0.1).toFixed(1));
    scaledTasks[maxIndex].durationHours = Math.max(MIN_TASK_HOURS, reduced);
    totalMinutes = getTotalMinutes(scaledTasks);
  }

  if (totalMinutes <= budgetMinutes) {
    return scaledTasks;
  }

  const maxTasksPossible = Math.max(1, Math.floor(budgetMinutes / (MIN_TASK_HOURS * 60)));
  return scaledTasks.slice(0, maxTasksPossible).map((task) => ({
    ...task,
    durationHours: MIN_TASK_HOURS,
  }));
};

const expandTasksForTimeline = (tasks, targetDays, dailyAvailableHours) => {
  const normalizedTasks = normalizeTaskDurations(tasks);
  if (!targetDays || !dailyAvailableHours || normalizedTasks.length === 0) {
    return normalizedTasks;
  }

  const budgetMinutes = Math.round(targetDays * dailyAvailableHours * 60);
  if (budgetMinutes <= 0) {
    return normalizedTasks;
  }

  const targetCoverageMinutes = Math.round(budgetMinutes * 0.85);
  const maxTaskCount = Math.min(400, Math.max(20, targetDays * 4));
  const expanded = [...normalizedTasks];
  let totalMinutes = getTotalMinutes(expanded);
  let cursor = 0;

  while (totalMinutes < targetCoverageMinutes && expanded.length < maxTaskCount) {
    const template = normalizedTasks[cursor % normalizedTasks.length];
    const sessionNumber = Math.floor(cursor / normalizedTasks.length) + 2;
    expanded.push({
      ...template,
      title: `${template.title} (Session ${sessionNumber})`,
    });
    totalMinutes += Math.round(template.durationHours * 60);
    cursor += 1;
  }

  return expanded;
};

const buildDailySchedule = (tasks, dailyAvailableHours, options = {}) => {
  const requestedDailyMinutes = Math.max(30, Math.round(dailyAvailableHours * 60));
  const parsedTimeWindows =
    Array.isArray(options.preferredTimeWindows) && options.preferredTimeWindows.length > 0
      ? options.preferredTimeWindows
      : parsePreferredTimeWindows(options.preferredStudyWindow);

  let effectiveTimeWindows = parsedTimeWindows;
  if (!effectiveTimeWindows.length) {
    const defaultStartMinute = WORKDAY_START_HOUR * 60;
    const defaultEndMinute = Math.min(DAY_END_MINUTES, defaultStartMinute + requestedDailyMinutes);
    effectiveTimeWindows = [
      {
        startMinute: defaultStartMinute,
        endMinute: Math.max(defaultStartMinute + 30, defaultEndMinute),
      },
    ];
  }

  const windowMinutesPerDay = getTotalWindowMinutes(effectiveTimeWindows);
  const dailyMinutesBudget = Math.max(30, Math.min(requestedDailyMinutes, windowMinutesPerDay));
  const referenceDate = options.startDate ? new Date(options.startDate) : new Date();
  const baseDayStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    0,
    0,
    0,
    0
  );

  const scheduled = [];
  let dayIndex = 0;
  let minutesUsedToday = 0;
  let slotIndex = 0;
  let minutesUsedInSlot = 0;

  const moveToNextDay = () => {
    dayIndex += 1;
    minutesUsedToday = 0;
    slotIndex = 0;
    minutesUsedInSlot = 0;
  };

  for (const task of tasks) {
    let remainingMinutes = Math.max(30, Math.round(task.durationHours * 60));
    let partNumber = 1;

    while (remainingMinutes > 0) {
      if (minutesUsedToday >= dailyMinutesBudget) {
        moveToNextDay();
      }

      if (slotIndex >= effectiveTimeWindows.length) {
        moveToNextDay();
      }

      const currentSlot = effectiveTimeWindows[slotIndex];
      const slotCapacity = Math.max(0, currentSlot.endMinute - currentSlot.startMinute);
      const slotRemaining = slotCapacity - minutesUsedInSlot;
      const dayRemaining = dailyMinutesBudget - minutesUsedToday;

      if (slotRemaining <= 0) {
        slotIndex += 1;
        minutesUsedInSlot = 0;
        continue;
      }

      if (dayRemaining <= 0) {
        moveToNextDay();
        continue;
      }

      const chunkMinutes = Math.min(remainingMinutes, slotRemaining, dayRemaining);
      if (chunkMinutes <= 0) {
        if (slotRemaining <= dayRemaining) {
          slotIndex += 1;
          minutesUsedInSlot = 0;
        } else {
          moveToNextDay();
        }
        continue;
      }

      const dayStart = new Date(baseDayStart.getTime() + dayIndex * DAY_MS);
      const startOffsetMinutes = currentSlot.startMinute + minutesUsedInSlot;
      const startTime = new Date(dayStart.getTime() + startOffsetMinutes * MINUTE_MS);
      const endTime = new Date(startTime.getTime() + chunkMinutes * MINUTE_MS);
      const isSplitTask = remainingMinutes > chunkMinutes || partNumber > 1;

      scheduled.push({
        title: isSplitTask ? `${task.title} (Part ${partNumber})` : task.title,
        description: task.description,
        startTime,
        endTime,
      });

      remainingMinutes -= chunkMinutes;
      minutesUsedToday += chunkMinutes;
      minutesUsedInSlot += chunkMinutes;
      partNumber += 1;

      if (minutesUsedInSlot >= slotCapacity) {
        slotIndex += 1;
        minutesUsedInSlot = 0;
      }
    }
  }

  return scheduled;
};

const resolvePlanningPreferences = (body) => ({
  targetDays: parseTargetDays(body),
  dailyAvailableHours: parseDailyHours(body),
  examTemplate: parseExamTemplate(body),
  currentLevel: parseCurrentLevel(body),
  weakAreas: parseWeakAreas(body),
  preferredStudyWindow: parsePreferredStudyWindow(body),
});

const createAdaptiveTemplates = (goal, completionRate) => {
  const subject = goal.title || 'your goal';
  const examTemplate = (goal.aiPlanning?.examTemplate || 'auto').toLowerCase();
  const weakAreas = Array.isArray(goal.aiPlanning?.weakAreas) ? goal.aiPlanning.weakAreas : [];
  const weakText = weakAreas.slice(0, 3).join(', ');
  const weakAreaSuffix = weakText ? ` Focus on: ${weakText}.` : '';
  const isDefense = ['ima', 'nda', 'cds'].includes(examTemplate);
  const isInterview = examTemplate === 'interview';

  if (completionRate < 45) {
    return [
      {
        title: `Catch-up revision block for ${subject}`,
        description: `Revisit unfinished topics and close pending tasks.${weakAreaSuffix}`,
        durationHours: 1.5,
      },
      {
        title: 'Timed practice set',
        description: 'Do a focused timed session and review mistakes immediately.',
        durationHours: 1.5,
      },
      {
        title: 'Weekly recovery planning',
        description: 'Create a realistic next 7-day action plan with smaller milestones.',
        durationHours: 1,
      },
    ];
  }

  if (isDefense) {
    return [
      {
        title: 'Defense written mock + review',
        description: `Attempt a full mock and update weak-topic tracker.${weakAreaSuffix}`,
        durationHours: 2,
      },
      {
        title: 'Physical conditioning session',
        description: 'Run stamina drills and bodyweight exercises for defense readiness.',
        durationHours: 1,
      },
      {
        title: 'Current affairs and reasoning drill',
        description: 'Practice GK, reasoning, and English with time constraints.',
        durationHours: 1.5,
      },
    ];
  }

  if (isInterview) {
    return [
      {
        title: 'Timed DSA drill',
        description: `Solve interview-level problems under time pressure.${weakAreaSuffix}`,
        durationHours: 1.5,
      },
      {
        title: 'Project depth and storytelling',
        description: 'Ship one project improvement and prepare interview explanation points.',
        durationHours: 1.5,
      },
      {
        title: 'Mock interview and feedback',
        description: 'Run one mock and create fix tasks for weak communication and content.',
        durationHours: 1,
      },
    ];
  }

  return [
    {
      title: `Weekly deep work for ${subject}`,
      description: `Execute the highest-impact study/work block for this goal.${weakAreaSuffix}`,
      durationHours: 1.5,
    },
    {
      title: 'Timed test and analysis',
      description: 'Do one timed test and convert mistakes into next-day tasks.',
      durationHours: 1.5,
    },
    {
      title: 'Weekly strategy review',
      description: 'Adjust next week plan based on completion and bottlenecks.',
      durationHours: 1,
    },
  ];
};

const createAdaptiveReplanForGoal = async (goal, userId) => {
  const now = new Date();
  const lookbackStart = new Date(now.getTime() - REPLAN_LOOKBACK_DAYS * DAY_MS);

  const recentTasks = await Task.find({
    userId,
    goalId: goal._id,
    source: 'ai',
    startTime: { $gte: lookbackStart, $lt: now },
  })
    .select('status')
    .lean();

  const hasAiHistory = recentTasks.length > 0 || goal.aiPlanning?.isAiGenerated;
  if (!hasAiHistory) {
    return null;
  }

  const completedCount = recentTasks.filter((task) => task.status === 'completed').length;
  const completionRate =
    recentTasks.length > 0 ? Math.round((completedCount / recentTasks.length) * 100) : 60;

  const dailyHours = Number(
    clamp(
      Number(goal.aiPlanning?.dailyAvailableHours || goal.dailyAvailableHours || 2),
      MIN_DAILY_HOURS,
      MAX_DAILY_HOURS
    ).toFixed(1)
  );
  const preferredStudyWindow = (goal.aiPlanning?.preferredStudyWindow || '').toString().trim();
  const preferredTimeWindows = parsePreferredTimeWindows(preferredStudyWindow);

  const nextWeekStart = startOfDay(new Date(now.getTime() + DAY_MS));
  const nextWeekEnd = new Date(nextWeekStart.getTime() + REPLAN_AHEAD_DAYS * DAY_MS);

  const staleAdaptiveTasks = await Task.find({
    userId,
    goalId: goal._id,
    planType: 'adaptive_replan',
    status: 'scheduled',
    startTime: { $gte: nextWeekStart, $lt: nextWeekEnd },
  });

  if (staleAdaptiveTasks.length > 0) {
    await Task.deleteMany({
      _id: { $in: staleAdaptiveTasks.map((task) => task._id) },
      userId,
    });
    await googleCalendarService.syncTaskDeleteBatch(userId, staleAdaptiveTasks);
  }

  const templates = createAdaptiveTemplates(goal, completionRate);
  const budgetedTasks = fitTasksWithinBudget(templates, REPLAN_AHEAD_DAYS, dailyHours);
  const timelineTasks = expandTasksForTimeline(budgetedTasks, REPLAN_AHEAD_DAYS, dailyHours);
  const scheduledTasks = buildDailySchedule(timelineTasks, dailyHours, {
    startDate: nextWeekStart,
    preferredStudyWindow,
    preferredTimeWindows,
  }).filter((task) => task.startTime < nextWeekEnd);

  const taskDocs = await buildTaskDocsWithInstructions({
    scheduledTasks,
    userId,
    goalId: goal._id,
    source: 'ai',
    planType: 'adaptive_replan',
    localOnly: true,
  });

  let insertedTasks = [];
  if (taskDocs.length > 0) {
    insertedTasks = await Task.insertMany(taskDocs);
    triggerGoogleSyncInBackground(userId, insertedTasks);
  }

  await Goal.updateOne(
    { _id: goal._id, userId },
    {
      $set: {
        'aiPlanning.isAiGenerated': true,
        'aiPlanning.dailyAvailableHours': dailyHours,
        'aiPlanning.lastReplannedAt': now,
        'aiPlanning.lastWeeklyCompletionRate': completionRate,
        'aiPlanning.preferredStudyWindow': preferredStudyWindow || undefined,
      },
    }
  );

  return {
    goalId: goal._id.toString(),
    goalTitle: goal.title,
    completionRate,
    generatedTasks: taskDocs.length,
  };
};

// @desc    Generate a goal and tasks from a prompt using AI
// @route   POST /api/v1/ai/generate-goal
// @access  Private
const generateGoal = async (req, res, next) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ message: 'Prompt is required' });
    }

    const planning = resolvePlanningPreferences(req.body);
    const preferredTimeWindows = parsePreferredTimeWindows(planning.preferredStudyWindow);
    if (planning.preferredStudyWindow && preferredTimeWindows.length === 0) {
      throw badRequest(
        'preferredStudyWindow format is invalid. Example: "6-8 AM" or "6-8 AM and 9-10 PM".'
      );
    }
    const aiPlan = await aiService.generateGoalWithTasks(prompt, planning);

    const deadlineDays =
      planning.targetDays ||
      Math.round(clamp(Number(aiPlan?.goal?.deadlineDays) || 7, MIN_GOAL_DAYS, MAX_GOAL_DAYS));
    const dailyAvailableHours =
      planning.dailyAvailableHours ||
      Number(
        clamp(
          Number(aiPlan?.goal?.dailyAvailableHours) || 2,
          MIN_DAILY_HOURS,
          MAX_DAILY_HOURS
        ).toFixed(1)
      );

    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + deadlineDays);

    const goal = await Goal.create({
      userId: req.user._id,
      title: aiPlan.goal.title,
      description: aiPlan.goal.description,
      deadline: deadlineDate,
      dailyAvailableHours,
      aiPlanning: {
        isAiGenerated: true,
        examTemplate: planning.examTemplate,
        currentLevel: planning.currentLevel || undefined,
        weakAreas: planning.weakAreas,
        preferredStudyWindow: planning.preferredStudyWindow || undefined,
        targetDays: deadlineDays,
        dailyAvailableHours,
      },
    });

    const budgetedTasks = fitTasksWithinBudget(aiPlan.tasks, deadlineDays, dailyAvailableHours);
    const timelineTasks = expandTasksForTimeline(budgetedTasks, deadlineDays, dailyAvailableHours);
    const scheduledTasks = buildDailySchedule(timelineTasks, dailyAvailableHours, {
      preferredStudyWindow: planning.preferredStudyWindow,
      preferredTimeWindows,
    });

    const taskDocs = await buildTaskDocsWithInstructions({
      scheduledTasks,
      userId: req.user._id,
      goalId: goal._id,
      source: 'ai',
      planType: 'goal_plan',
      localOnly: true,
    });

    const tasks = taskDocs.length > 0 ? await Task.insertMany(taskDocs) : [];
    if (tasks.length > 0) {
      triggerGoogleSyncInBackground(req.user._id, tasks);
    }

    const taskSchedule = tasks.map((task) => ({
      title: task.title,
      time: formatTaskTimeRange(task.startTime, task.endTime),
      steps: buildTimedStepSchedule(task),
    }));

    res.status(201).json({
      goal,
      tasks,
      taskSchedule,
      planMeta: {
        deadlineDays,
        dailyAvailableHours,
        preferredStudyWindow: planning.preferredStudyWindow || null,
        schedulingWindowApplied: preferredTimeWindows.length > 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Run adaptive weekly re-plan for all due active AI goals
// @route   POST /api/v1/ai/replan-weekly
// @access  Private
const replanWeekly = async (req, res, next) => {
  try {
    const now = new Date();
    const dueBefore = new Date(now.getTime() - REPLAN_INTERVAL_DAYS * DAY_MS);

    const goals = await Goal.find({
      userId: req.user._id,
      status: 'active',
      $or: [
        { 'aiPlanning.lastReplannedAt': { $exists: false } },
        { 'aiPlanning.lastReplannedAt': null },
        { 'aiPlanning.lastReplannedAt': { $lte: dueBefore } },
      ],
    }).sort({ createdAt: -1 });

    const details = [];
    for (const goal of goals) {
      const replanResult = await createAdaptiveReplanForGoal(goal, req.user._id);
      if (replanResult) {
        details.push(replanResult);
      }
    }

    res.status(200).json({
      processedGoals: goals.length,
      updatedGoals: details.length,
      details,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get AI suggestions for a specific task
// @route   POST /api/v1/ai/tasks/:id/suggest
// @access  Private
const suggestTaskSteps = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const suggestion = await aiService.suggestTaskBreakdown(task.title, task.description);
    res.status(200).json({ suggestion });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateGoal,
  replanWeekly,
  suggestTaskSteps,
};
