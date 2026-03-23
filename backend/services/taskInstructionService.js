const crypto = require('crypto');

const aiService = require('./aiService');

const MAX_SUMMARY_LENGTH = 400;
const MAX_STEP_LENGTH = 220;
const MAX_TIP_LENGTH = 180;
const MAX_OUTCOME_LENGTH = 300;
const MIN_STEPS = 3;
const MAX_STEPS = 7;
const MAX_TIPS = 3;

const cleanText = (value, maxLength) =>
  (value || '')
    .toString()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

const normalizeStepKey = (value) =>
  (value || '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const buildStepId = (text, index) => {
  const hash = crypto
    .createHash('sha1')
    .update(`${index}:${text}`)
    .digest('hex')
    .slice(0, 12);
  return `step_${hash}`;
};

const fallbackStepsForTask = (taskTitle) => {
  const shortTitle = cleanText(taskTitle, 80) || 'this task';
  return [
    `Define exactly what "done" means for "${shortTitle}".`,
    'Gather all materials, notes, or tools you need before you start.',
    'Work on the main part in one focused session without distractions.',
    'Review the result and improve unclear or incomplete parts.',
    'Finalize and save/submit the finished output.',
  ];
};

const ensureStepCount = (steps, taskTitle) => {
  const filtered = steps.slice(0, MAX_STEPS);
  if (filtered.length >= MIN_STEPS) {
    return filtered;
  }

  const fallback = fallbackStepsForTask(taskTitle);
  for (const step of fallback) {
    if (filtered.length >= MIN_STEPS) break;
    const exists = filtered.some((currentStep) => normalizeStepKey(currentStep) === normalizeStepKey(step));
    if (!exists) {
      filtered.push(step);
    }
  }

  return filtered.slice(0, MAX_STEPS);
};

const normalizeTips = (tips = []) => {
  if (!Array.isArray(tips)) return [];

  const unique = [];
  const seen = new Set();

  for (const tip of tips) {
    const cleaned = cleanText(tip, MAX_TIP_LENGTH);
    if (!cleaned) continue;
    const key = normalizeStepKey(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(cleaned);
    if (unique.length >= MAX_TIPS) break;
  }

  return unique;
};

const normalizeInstructionPlan = ({ plan, taskTitle, taskDescription }) => {
  const title = cleanText(taskTitle, 120) || 'Task';
  const description = cleanText(taskDescription, 250);
  const fallbackSummary = description
    ? `Complete "${title}" by following clear steps and finishing on time.`
    : `Complete "${title}" with a clear, actionable plan.`;

  const summary = cleanText(plan?.summary, MAX_SUMMARY_LENGTH) || fallbackSummary;
  const rawSteps = Array.isArray(plan?.steps) ? plan.steps : [];
  const dedupedSteps = [];
  const seen = new Set();

  for (const step of rawSteps) {
    const cleaned = cleanText(step, MAX_STEP_LENGTH);
    if (!cleaned) continue;
    const key = normalizeStepKey(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedSteps.push(cleaned);
    if (dedupedSteps.length >= MAX_STEPS) break;
  }

  const ensuredSteps = ensureStepCount(dedupedSteps, title);
  const tips = normalizeTips(plan?.tips);
  const expectedOutcome =
    cleanText(plan?.expectedOutcome, MAX_OUTCOME_LENGTH) ||
    `You complete "${title}" with a result ready to use or submit.`;

  return {
    summary,
    steps: ensuredSteps,
    tips,
    expectedOutcome,
  };
};

const computeInstructionProgress = (steps = []) => {
  if (!Array.isArray(steps) || steps.length === 0) return 0;
  const completedCount = steps.filter((step) => step.completed).length;
  return Math.round((completedCount / steps.length) * 100);
};

const attachChecklistState = ({ steps, existingSteps = [] }) => {
  const completionByKey = new Map();
  for (const step of existingSteps) {
    completionByKey.set(normalizeStepKey(step?.text), {
      completed: Boolean(step?.completed),
      completedAt: step?.completedAt || null,
    });
  }

  return steps.map((text, index) => {
    const previous = completionByKey.get(normalizeStepKey(text));
    return {
      id: buildStepId(text, index),
      text,
      completed: Boolean(previous?.completed),
      completedAt: previous?.completed ? previous.completedAt || new Date() : null,
    };
  });
};

const generateTaskInstructionPack = async ({
  title,
  description,
  existingSteps = [],
  localOnly = false,
} = {}) => {
  const instructionPlan = await aiService.generateTaskInstructions(title, description, {
    localOnly,
  });
  const normalizedPlan = normalizeInstructionPlan({
    plan: instructionPlan,
    taskTitle: title,
    taskDescription: description,
  });
  const checklist = attachChecklistState({
    steps: normalizedPlan.steps,
    existingSteps,
  });

  return {
    aiInstructions: {
      summary: normalizedPlan.summary,
      steps: checklist,
      tips: normalizedPlan.tips,
      expectedOutcome: normalizedPlan.expectedOutcome,
      generatedAt: new Date(),
    },
    instructionProgress: computeInstructionProgress(checklist),
  };
};

const applyChecklistStepUpdate = ({ task, stepId, completed }) => {
  if (!task?.aiInstructions?.steps?.length) {
    const error = new Error('Task checklist not found');
    error.statusCode = 404;
    throw error;
  }

  const targetIndex = task.aiInstructions.steps.findIndex((step) => step.id === stepId);
  if (targetIndex === -1) {
    const error = new Error('Checklist step not found');
    error.statusCode = 404;
    throw error;
  }

  task.aiInstructions.steps[targetIndex].completed = completed;
  task.aiInstructions.steps[targetIndex].completedAt = completed ? new Date() : null;
  task.instructionProgress = computeInstructionProgress(task.aiInstructions.steps);

  return task;
};

module.exports = {
  applyChecklistStepUpdate,
  computeInstructionProgress,
  generateTaskInstructionPack,
};
