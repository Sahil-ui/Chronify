const OpenAI = require('openai');

// Initialize all AI model clients
const models = {
  openai: null,
  claude: null,
  gemini: null,
  deepseek: null,
  grok: null,
};

// OpenAI
if (process.env.OPENAI_API_KEY) {
  models.openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log('âœ… OpenAI initialized');
} else {
  console.warn('âš ï¸  Warning: OPENAI_API_KEY is not set');
}

// Claude (Anthropic)
if (process.env.ANTHROPIC_API_KEY) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    models.claude = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    console.log('âœ… Claude initialized');
  } catch (e) {
    console.warn('âš ï¸  Anthropic SDK not installed. Install with: npm install @anthropic-ai/sdk');
  }
} else {
  console.warn('âš ï¸  Warning: ANTHROPIC_API_KEY is not set');
}

// Gemini
if (process.env.GEMINI_API_KEY) {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    models.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('âœ… Gemini initialized');
  } catch (e) {
    console.warn('âš ï¸  Gemini SDK not installed. Install with: npm install @google/generative-ai');
  }
} else {
  console.warn('âš ï¸  Warning: GEMINI_API_KEY is not set');
}

// DeepSeek
if (process.env.DEEPSEEK_API_KEY) {
  models.deepseek = {
    apiKey: process.env.DEEPSEEK_API_KEY,
    apiUrl: 'https://api.deepseek.com/chat/completions',
  };
  console.log('âœ… DeepSeek initialized');
} else {
  console.warn('âš ï¸  Warning: DEEPSEEK_API_KEY is not set');
}

// Grok
if (process.env.GROK_API_KEY) {
  models.grok = {
    apiKey: process.env.GROK_API_KEY,
    apiUrl: 'https://api.x.ai/v1/chat/completions',
  };
  console.log('âœ… Grok initialized');
} else {
  console.warn('âš ï¸  Warning: GROK_API_KEY is not set');
}

// Helper: allow local/offline fallback for dev and tests
const shouldUseLocalFallback = () =>
  process.env.LOCAL_AI_FALLBACK === 'true' || process.env.NODE_ENV !== 'production';

const clampNumber = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
};

const AI_PROVIDER_TIMEOUT_MS = Math.round(
  clampNumber(process.env.AI_PROVIDER_TIMEOUT_MS, 3000, 60000, 12000)
);
const AI_CREDIT_COOLDOWN_MS = Math.round(
  clampNumber(process.env.AI_CREDIT_COOLDOWN_MS, 60 * 1000, 24 * 60 * 60 * 1000, 30 * 60 * 1000)
);
const AI_AUTH_COOLDOWN_MS = Math.round(
  clampNumber(process.env.AI_AUTH_COOLDOWN_MS, 60 * 1000, 24 * 60 * 60 * 1000, 30 * 60 * 1000)
);
const AI_RATE_LIMIT_COOLDOWN_MS = Math.round(
  clampNumber(process.env.AI_RATE_LIMIT_COOLDOWN_MS, 5 * 1000, 10 * 60 * 1000, 20 * 1000)
);

const providerCooldowns = new Map();

const parseRetryDelayMs = (error) => {
  const message = error?.message?.toString() || '';
  const retryInMatch = message.match(/retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);
  if (retryInMatch) {
    const seconds = Number(retryInMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000);
    }
  }
  return null;
};

const getCooldownMsForError = (errorType, error) => {
  if (errorType === 'no_credits') return AI_CREDIT_COOLDOWN_MS;
  if (errorType === 'auth_error') return AI_AUTH_COOLDOWN_MS;
  if (errorType === 'rate_limited') {
    return parseRetryDelayMs(error) || AI_RATE_LIMIT_COOLDOWN_MS;
  }
  return 0;
};

const getProviderCooldown = (providerName) => {
  const key = providerName.toLowerCase();
  const cooldown = providerCooldowns.get(key);
  if (!cooldown) return null;
  if (cooldown.until <= Date.now()) {
    providerCooldowns.delete(key);
    return null;
  }
  return cooldown;
};

const setProviderCooldown = (providerName, errorType, error) => {
  const cooldownMs = getCooldownMsForError(errorType, error);
  if (!cooldownMs) return;
  providerCooldowns.set(providerName.toLowerCase(), {
    errorType,
    until: Date.now() + cooldownMs,
  });
};

const withTimeout = async (promise, timeoutMs, providerName) => {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }

  let timerId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timerId = setTimeout(() => {
          const timeoutError = new Error(`${providerName} request timed out`);
          timeoutError.status = 504;
          timeoutError.statusCode = 504;
          reject(timeoutError);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timerId) clearTimeout(timerId);
  }
};

function normalizePlanningOptions(options = {}) {
  const rawTargetDays = Number(options?.targetDays);
  const rawDailyHours = Number(options?.dailyAvailableHours);
  const rawExamTemplate = (options?.examTemplate || 'auto').toString().trim().toLowerCase();
  const rawCurrentLevel = (options?.currentLevel || '').toString().trim();
  const rawPreferredStudyWindow = (options?.preferredStudyWindow || '').toString().trim();
  const weakAreaSource = options?.weakAreas;

  const targetDays = Number.isFinite(rawTargetDays)
    ? Math.round(clampNumber(rawTargetDays, 1, 365, 14))
    : null;
  const dailyAvailableHours = Number.isFinite(rawDailyHours)
    ? Number(clampNumber(rawDailyHours, 0.5, 16, 2).toFixed(1))
    : null;
  const weakAreas = (Array.isArray(weakAreaSource)
    ? weakAreaSource
    : (weakAreaSource || '')
        .toString()
        .split(','))
    .map((item) => item.toString().trim())
    .filter(Boolean)
    .slice(0, 10);

  return {
    targetDays,
    dailyAvailableHours,
    examTemplate: rawExamTemplate || 'auto',
    currentLevel: rawCurrentLevel.slice(0, 60),
    weakAreas,
    preferredStudyWindow: rawPreferredStudyWindow.slice(0, 80),
  };
}

const normalizeTextKey = (value) =>
  (value || '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const normalizeGoalSubject = (goal) => {
  const cleaned = (goal || '')
    .toString()
    .trim()
    .replace(/^(i\s+want\s+to|i\s+wanna|want\s+to|i\s+need\s+to|need\s+to|my\s+goal\s+is\s+to)\s+/i, '')
    .replace(/^to\s+/i, '')
    .trim();

  return cleaned || 'your goal';
};

const detectGoalTrack = (goalText) => {
  const text = normalizeTextKey(goalText);
  if (
    /(interview|placement|job|package|lpa|ctc|resume|dsa|system design|leetcode)/i.test(text)
  ) {
    return 'interview';
  }
  if (
    /(exam|clear|crack|test|preparation|prep|syllabus|mock|question|ima|nda|cds|upsc|neet|jee|cat|gate|ssc|bank)/i.test(
      text
    )
  ) {
    return 'exam';
  }
  if (/(fitness|workout|weight|muscle|run|marathon|diet)/i.test(text)) {
    return 'fitness';
  }
  return 'general';
};

const detectExamTemplateFromText = (goalText) => {
  const text = normalizeTextKey(goalText);
  if (/(ima|indian military academy|cds ima|ssb)/i.test(text)) return 'ima';
  if (/(nda|national defence academy)/i.test(text)) return 'nda';
  if (/(cds|combined defence services)/i.test(text)) return 'cds';
  if (/(upsc|civil services|ias|ips)/i.test(text)) return 'upsc';
  if (/(jee|iit)/i.test(text)) return 'jee';
  if (/(neet|medical entrance)/i.test(text)) return 'neet';
  if (/(cat|mba entrance)/i.test(text)) return 'cat';
  if (/(gate|graduate aptitude test in engineering)/i.test(text)) return 'gate';
  if (/(interview|placement|job|package|lpa|dsa|leetcode)/i.test(text)) return 'interview';
  return 'general';
};

const buildExamPackTasks = (template, subject, weakAreas = [], currentLevel = '') => {
  const weakAreaHint =
    weakAreas.length > 0 ? ` Focus areas: ${weakAreas.slice(0, 3).join(', ')}.` : '';
  const levelHint = currentLevel ? ` Level: ${currentLevel}.` : '';
  const metadataHint = `${levelHint}${weakAreaHint}`.trim();
  const suffix = metadataHint ? ` ${metadataHint}` : '';

  const packs = {
    ima: [
      {
        title: `IMA exam pattern and syllabus mapping for ${subject}`,
        description:
          'List written sections, SSB stages, and fitness standards with weekly milestones.' +
          suffix,
        durationHours: 1,
      },
      {
        title: 'Defense aptitude and current affairs drill',
        description:
          'Practice quant, reasoning, English, and defense-relevant current affairs in timed sets.',
        durationHours: 2,
      },
      {
        title: 'Physical training for defense readiness',
        description:
          'Do running, stamina, mobility, and bodyweight training aligned with defense tests.',
        durationHours: 1,
      },
      {
        title: 'Mock paper plus post-test error analysis',
        description:
          'Attempt one timed mock, classify mistakes, and assign next-day correction tasks.',
        durationHours: 2,
      },
    ],
    nda: [
      {
        title: `NDA syllabus and chapter prioritization for ${subject}`,
        description: 'Map math and GAT topics by weightage and weak areas.' + suffix,
        durationHours: 1,
      },
      {
        title: 'NDA math timed practice block',
        description: 'Solve topic-wise and mixed questions with strict timer discipline.',
        durationHours: 2,
      },
      {
        title: 'GAT revision and current affairs notes',
        description: 'Revise English, GS, and static GK with short daily notes.',
        durationHours: 1.5,
      },
      {
        title: 'Weekly NDA mock and score review',
        description: 'Track score trend and create targeted remedial tasks.',
        durationHours: 2,
      },
    ],
    cds: [
      {
        title: `CDS paper plan and syllabus coverage for ${subject}`,
        description: 'Break English, GS, and math prep into weekly targets.' + suffix,
        durationHours: 1,
      },
      {
        title: 'CDS timed paper sections practice',
        description: 'Practice one section at exam speed and review accuracy drop points.',
        durationHours: 2,
      },
      {
        title: 'Defense current affairs and revision sprint',
        description: 'Prepare high-yield notes and quick recall practice.',
        durationHours: 1.5,
      },
      {
        title: 'Mock plus strategy adjustment',
        description: 'Run a full mock and tune topic priority for next cycle.',
        durationHours: 2,
      },
    ],
    upsc: [
      {
        title: `UPSC syllabus decomposition for ${subject}`,
        description: 'Map GS, optional, and current affairs into a weekly workflow.' + suffix,
        durationHours: 1,
      },
      {
        title: 'GS concept block and note consolidation',
        description: 'Study one major GS theme and prepare revision-ready notes.',
        durationHours: 2,
      },
      {
        title: 'Answer writing practice session',
        description: 'Write timed answers and evaluate structure, facts, and conclusion.',
        durationHours: 1.5,
      },
      {
        title: 'Prelims MCQ drill with analysis',
        description: 'Attempt a mixed-question set and correct topic-level weak zones.',
        durationHours: 2,
      },
    ],
    jee: [
      {
        title: `JEE chapter sequencing for ${subject}`,
        description: 'Prioritize PCM chapters by weightage and personal difficulty.' + suffix,
        durationHours: 1,
      },
      {
        title: 'Concept drill for PCM core topics',
        description: 'Solve level-wise questions from one high-weight chapter.',
        durationHours: 2,
      },
      {
        title: 'Timed mixed-problem set',
        description: 'Practice exam-style mixed questions under strict time constraints.',
        durationHours: 1.5,
      },
      {
        title: 'Error log revision and formula recap',
        description: 'Review wrong questions and update formula/approach sheets.',
        durationHours: 1.5,
      },
    ],
    neet: [
      {
        title: `NEET syllabus prioritization for ${subject}`,
        description: 'Map Biology, Chemistry, and Physics topics by expected yield.' + suffix,
        durationHours: 1,
      },
      {
        title: 'Biology NCERT and MCQ intensive block',
        description: 'Do focused NCERT revision and high-volume MCQ practice.',
        durationHours: 2,
      },
      {
        title: 'Physics/Chemistry problem-solving sprint',
        description: 'Practice high-frequency numericals and concept traps.',
        durationHours: 1.5,
      },
      {
        title: 'Full-section mock and error notebook update',
        description: 'Run timed sets and maintain a correction notebook.',
        durationHours: 2,
      },
    ],
    cat: [
      {
        title: `CAT prep blueprint for ${subject}`,
        description: 'Split VARC, DILR, and QA into daily and weekly targets.' + suffix,
        durationHours: 1,
      },
      {
        title: 'DILR and QA timed practice',
        description: 'Attempt selected sets with timer and strategy notes.',
        durationHours: 2,
      },
      {
        title: 'VARC comprehension and accuracy drill',
        description: 'Practice reading sets and evaluate mistake patterns.',
        durationHours: 1.5,
      },
      {
        title: 'CAT sectional mock and analysis',
        description: 'Take one sectional test and convert insights into next tasks.',
        durationHours: 2,
      },
    ],
    gate: [
      {
        title: `GATE topic roadmap for ${subject}`,
        description: 'Prioritize technical subjects, aptitude, and engineering math.' + suffix,
        durationHours: 1,
      },
      {
        title: 'Core subject problem-solving block',
        description: 'Solve previous-year style problems with concept tagging.',
        durationHours: 2,
      },
      {
        title: 'Aptitude and engineering math revision',
        description: 'Do timed drills for accuracy and speed improvements.',
        durationHours: 1.5,
      },
      {
        title: 'Weekly mock and weak-topic recovery',
        description: 'Run one mock and create targeted recovery tasks.',
        durationHours: 2,
      },
    ],
    interview: [
      {
        title: `Interview prep roadmap for ${subject}`,
        description:
          'Split preparation into DSA, core CS, projects, and communication milestones.' +
          suffix,
        durationHours: 1,
      },
      {
        title: 'Timed DSA practice session',
        description: 'Solve medium questions and write clean approach summaries.',
        durationHours: 2,
      },
      {
        title: 'Project implementation and narrative prep',
        description:
          'Build a real feature and prepare STAR-style explanation for interviews.',
        durationHours: 2,
      },
      {
        title: 'Mock interview plus feedback loop',
        description: 'Run one mock and convert feedback into concrete fix tasks.',
        durationHours: 1.5,
      },
    ],
    general: [
      {
        title: `Define milestones for ${subject}`,
        description: `Write clear outcomes for "${subject}" and break them into weekly checkpoints.` + suffix,
        durationHours: 1,
      },
      {
        title: `Deep work session on ${subject}`,
        description: 'Execute the highest-impact step with focused attention.',
        durationHours: 2,
      },
      {
        title: 'Practice and feedback iteration',
        description: 'Test output quality, gather feedback, and improve.',
        durationHours: 1.5,
      },
      {
        title: 'Review progress and plan next day',
        description: 'Track completion and prepare the next small actionable step.',
        durationHours: 0.5,
      },
    ],
  };

  return packs[template] || packs.general;
};

const createGoalAlignedTasks = (goalTitle, goalDescription = '', options = {}) => {
  const subject = normalizeGoalSubject(goalTitle);
  const planning = normalizePlanningOptions(options);
  const detectedTemplate = detectExamTemplateFromText(`${goalTitle} ${goalDescription}`);
  const selectedTemplate =
    planning.examTemplate && planning.examTemplate !== 'auto'
      ? planning.examTemplate
      : detectedTemplate;

  const goalTrack = detectGoalTrack(`${goalTitle} ${goalDescription}`);

  if (goalTrack === 'fitness' && selectedTemplate === 'general') {
    return [
      {
        title: `Set measurable fitness baseline for ${subject}`,
        description: 'Record current metrics and define weekly targets for strength and endurance.',
        durationHours: 0.5,
      },
      {
        title: 'Strength and cardio training session',
        description: 'Follow a structured routine with progressive overload and recovery.',
        durationHours: 1,
      },
      {
        title: 'Meal planning and sleep consistency',
        description: 'Plan meals, hydration, and sleep schedule for better recovery.',
        durationHours: 0.5,
      },
      {
        title: 'Weekly progress review',
        description: 'Adjust workout and nutrition plan based on adherence and results.',
        durationHours: 0.5,
      },
    ];
  }

  return buildExamPackTasks(
    selectedTemplate,
    subject,
    planning.weakAreas || [],
    planning.currentLevel || ''
  );
};

// Heuristic generator so local development continues without paid API keys.
const createLocalGoalPlan = (prompt, options = {}) => {
  const planning = normalizePlanningOptions(options);
  const sanitized = (prompt || 'Unnamed goal').trim();
  const subject = normalizeGoalSubject(sanitized);
  const summary = subject.length > 60 ? `${subject.slice(0, 57)}...` : subject || 'Planned goal';

  const tasks = createGoalAlignedTasks(subject, sanitized, planning);
  const deadlineDays = planning.targetDays || Math.min(30, Math.max(7, tasks.length * 4));
  const dailyAvailableHours = planning.dailyAvailableHours || 2;

  return JSON.stringify({
    goal: {
      title: summary,
      description: `Plan generated locally from your input: ${sanitized || subject}`,
      deadlineDays,
      dailyAvailableHours,
    },
    tasks,
  });
};

const createLocalTaskMentor = (taskTitle, taskDescription) => {
  const title = taskTitle || 'your task';
  const desc = taskDescription ? taskDescription.trim() : '';

  const bullets = [
    `Clarify "done": what concrete output finishes "${title}"${desc ? ` (${desc})` : ''}.`,
    'Break it into 2-4 substeps; put them on your calendar with time boxes.',
    'Do a 25-minute focus block starting with the riskiest or blocked step.',
    'Note what you finished and write the very next small step before stopping.',
  ];

  return `- ${bullets.join('\n- ')}`;
};

const detectInstructionTaskType = (taskTitle, taskDescription) => {
  const text = normalizeTextKey(`${taskTitle || ''} ${taskDescription || ''}`);
  if (
    /(code|coding|build|bug|debug|fix|api|backend|frontend|react|node|database|deploy|feature|test case|unit test)/i.test(
      text
    )
  ) {
    return 'coding';
  }
  if (
    /(study|revise|revision|exam|learn|practice|interview|dsa|upsc|nda|jee|neet|cat|gate|syllabus|chapter|topic)/i.test(
      text
    )
  ) {
    return 'study';
  }
  if (/(workout|fitness|run|exercise|diet|gym|cardio|strength|walk|yoga)/i.test(text)) {
    return 'fitness';
  }
  if (
    /(report|presentation|proposal|document|draft|client|meeting|email|submission|project|roadmap|plan|analysis|review)/i.test(
      text
    )
  ) {
    return 'work';
  }
  if (
    /(home|family|personal|travel|shopping|clean|organize|appointment|bank|bills|health|habit|routine)/i.test(
      text
    )
  ) {
    return 'personal';
  }
  return 'general';
};

const instructionSeed = (value) => {
  const input = (value || '').toString();
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) % 2147483647;
  }
  return Math.abs(hash);
};

const pickDeterministicItems = (items, count, seed) => {
  if (!Array.isArray(items) || items.length === 0 || count <= 0) {
    return [];
  }

  const picked = [];
  const used = new Set();
  let cursor = Math.abs(seed) % items.length;
  let guard = 0;

  while (picked.length < count && guard < items.length * 4) {
    const item = items[cursor % items.length];
    const key = normalizeTextKey(item);
    if (!used.has(key)) {
      used.add(key);
      picked.push(item);
    }
    cursor += 1;
    guard += 1;
  }

  return picked;
};

const looksVagueTask = (taskDescription) => {
  const desc = (taskDescription || '').toString().trim();
  if (!desc) return true;
  if (desc.split(/\s+/).length < 4) return true;
  return /^(do it|complete it|finish it|work on it|same as title)$/i.test(desc);
};

const createLocalTaskInstructions = (taskTitle, taskDescription) => {
  const title = (taskTitle || 'your task').toString().trim() || 'your task';
  const description = (taskDescription || '').toString().trim();
  const taskType = detectInstructionTaskType(title, description);
  const seed = instructionSeed(`${title}::${description}::${taskType}`);
  const vagueTask = looksVagueTask(description);
  const context = description || `Complete "${title}" end-to-end in one focused session.`;
  const wordCount = `${title} ${description}`.trim().split(/\s+/).filter(Boolean).length;
  const baseStepCount = wordCount >= 24 ? 6 : wordCount >= 14 ? 5 : wordCount >= 8 ? 4 : 3;
  const stepCount = Math.min(7, Math.max(3, baseStepCount + (seed % 2)));

  const stepCatalog = {
    coding: [
      `Write 3 acceptance checks for "${title}" so you know exactly what must work.`,
      'Open the relevant module/files and implement the smallest working version first.',
      'Add input validation and clear error handling for the main failure cases.',
      'Run manual test cases for happy path, invalid input, and one edge case.',
      'Fix issues from logs/console output, then simplify variable names for readability.',
      'Run existing tests (or add quick checks) and confirm no regressions.',
      'Prepare a short change note describing what was built and what was verified.',
    ],
    study: [
      `Set one measurable study target for "${title}" (for example, one chapter or 30 problems).`,
      'Study the core concept first, then write 5-8 short recall notes in your own words.',
      'Solve timed practice questions immediately after learning each concept.',
      'Tag every mistake by reason (concept gap, calculation, or rush) and correct it.',
      'Revise weak points once more using active recall, not passive reading.',
      'Take a mini mock or quiz and track your score to measure progress.',
      'Prepare a short revision sheet you can reuse tomorrow.',
    ],
    fitness: [
      `Set a clear workout target for "${title}" (duration, sets/reps, or distance).`,
      'Do a 5-10 minute warm-up focused on mobility and light cardio.',
      'Complete the main routine with planned sets, reps, and rest intervals.',
      'Track numbers after each set (weight, reps, pace, or heart rate).',
      'Finish with a cool-down and light stretching for recovery.',
      'Log the session result and adjust the next workout target slightly upward.',
      'Hydrate and schedule the next training slot now to stay consistent.',
    ],
    work: [
      `Confirm the final deliverable for "${title}" and who will receive it.`,
      'Collect all required inputs (notes, data, prior feedback, and reference docs).',
      'Create a concrete draft structure before producing the final content.',
      'Fill each section with clear facts, decisions, and next actions.',
      'Check deadlines, formatting, and stakeholder requirements before sending.',
      'Share the final version through the expected channel and capture confirmation.',
      'Log pending follow-ups so this task is fully closed.',
    ],
    personal: [
      `Define the exact real-world result for "${title}" (what will be done today).`,
      'List items/places/people involved so you can execute without backtracking.',
      'Block a specific time window and prepare whatever you need in advance.',
      'Complete the highest-priority action first while your energy is fresh.',
      'Finish the remaining actions in order and mark each one immediately.',
      'Handle payment, booking, or confirmations before ending the task.',
      'Update your personal notes/calendar so this does not repeat unexpectedly.',
    ],
    general: [
      `Write one concrete finish line for "${title}" so completion is unambiguous.`,
      'Gather all required information, files, and tools before starting.',
      'Execute the core action that creates the main result.',
      'Resolve missing details by contacting the right person/source immediately.',
      'Finalize the output in the required format and store/share it properly.',
      'Record what is done and note one follow-up action if needed.',
      'Schedule a short checkpoint to confirm the result stays on track.',
    ],
  };

  const tipCatalog = {
    coding: [
      'Keep commits small so bugs are easier to isolate.',
      'Test with real-looking sample data, not only ideal inputs.',
      'Name functions by behavior to make maintenance easier.',
    ],
    study: [
      'Use active recall: answer before you look at notes.',
      'Keep wrong-answer patterns in one error log notebook.',
      'Short focused sessions beat long distracted sessions.',
    ],
    fitness: [
      'Stop a set if form breaks; quality beats extra reps.',
      'Use a timer for rest intervals to keep workout intensity consistent.',
      'Recovery sleep is part of the plan, not optional.',
    ],
    work: [
      'Use clear headings so stakeholders scan quickly.',
      'State decisions and owners explicitly to avoid rework.',
      'Send a concise summary line with every handoff.',
    ],
    personal: [
      'Keep travel and waiting time in your estimate.',
      'Prepare essentials the night before to reduce friction.',
      'Bundle nearby errands to save time and energy.',
    ],
    general: [
      'Start with the action that removes the biggest blocker.',
      'Time-box the task to avoid perfection delays.',
      'Capture the next action before you close the session.',
    ],
  };

  const summaryCatalog = {
    coding: [
      `Implement "${title}" in a working, testable way and verify it with realistic scenarios.`,
      `Build "${title}" from first pass to stable output with checks for errors and edge cases.`,
    ],
    study: [
      `Study "${title}" through focused learning blocks, practice, and revision so retention is strong.`,
      `Turn "${title}" into exam-ready understanding using notes, practice problems, and error correction.`,
    ],
    fitness: [
      `Complete "${title}" as a structured training session with warm-up, tracked effort, and recovery.`,
      `Execute "${title}" safely and consistently so today's session improves your fitness baseline.`,
    ],
    work: [
      `Finish "${title}" as a clear professional deliverable that is ready to share on time.`,
      `Move "${title}" from draft to submission with complete inputs, polished content, and confirmation.`,
    ],
    personal: [
      `Complete "${title}" with practical real-life actions, clear timing, and no loose ends.`,
      `Handle "${title}" end-to-end so everything needed is done in one pass.`,
    ],
    general: [
      `Complete "${title}" with a clear execution sequence and a usable final result.`,
      `Turn "${title}" into a finished outcome by executing focused, concrete actions.`,
    ],
  };

  const outcomeCatalog = {
    coding: `A working "${title}" implementation that handles expected inputs and passes your checks.`,
    study: `You can explain "${title}" clearly and solve related questions with confidence.`,
    fitness: 'You complete the planned workout and log measurable progress for the next session.',
    work: `A polished "${title}" deliverable is submitted/shared and stakeholders have what they need.`,
    personal: `All actions for "${title}" are completed with confirmations and no pending loose ends.`,
    general: `A complete and usable result for "${title}" is finished and documented.`,
  };

  const summaryChoices = summaryCatalog[taskType] || summaryCatalog.general;
  const summary = summaryChoices[seed % summaryChoices.length];
  const addContextLine = vagueTask
    ? `The plan below assumes this is a practical ${taskType} task and makes it specific.`
    : `Focus context: ${context}.`;
  const finalSummary = `${summary} ${addContextLine}`;

  const stepChoices = stepCatalog[taskType] || stepCatalog.general;
  const steps = pickDeterministicItems(stepChoices, stepCount, seed + 11);

  const tipChoices = tipCatalog[taskType] || tipCatalog.general;
  const includeTips = seed % 3 !== 0;
  const tips = includeTips ? pickDeterministicItems(tipChoices, 1 + (seed % 2), seed + 29) : [];

  return {
    summary: finalSummary,
    steps,
    tips,
    expectedOutcome: outcomeCatalog[taskType] || outcomeCatalog.general,
  };
};
const normalizeTaskInstructionPayload = (payload, taskTitle, taskDescription) => {
  const fallback = createLocalTaskInstructions(taskTitle, taskDescription);
  const steps = Array.isArray(payload?.steps)
    ? payload.steps
        .map((step) => (step || '').toString().trim())
        .filter(Boolean)
        .slice(0, 7)
    : fallback.steps;
  const tips = Array.isArray(payload?.tips)
    ? payload.tips
        .map((tip) => (tip || '').toString().trim())
        .filter(Boolean)
        .slice(0, 3)
    : fallback.tips;

  return {
    summary:
      (payload?.summary || '').toString().trim().slice(0, 500) ||
      fallback.summary,
    steps: steps.length > 0 ? steps : fallback.steps,
    tips,
    expectedOutcome:
      (payload?.expectedOutcome || payload?.outcome || '').toString().trim().slice(0, 400) ||
      fallback.expectedOutcome,
  };
};

const isLowSignalTaskTitle = (title, goalTitle) => {
  const text = normalizeTextKey(title);
  const goalText = normalizeTextKey(goalTitle);
  if (!text || text.length < 4) {
    return true;
  }
  if (/^(i want to|want to|i need to|need to|my goal is to)/i.test((title || '').toString().trim())) {
    return true;
  }
  if (goalText && text === goalText) {
    return true;
  }
  return false;
};

const normalizeGoalPlan = (data, prompt, options = {}) => {
  const planning = normalizePlanningOptions(options);
  const rawGoal = data?.goal || {};
  const rawTasks = Array.isArray(data?.tasks) ? data.tasks : [];

  const fallbackTitle = normalizeGoalSubject(prompt || 'Planned goal');
  const goalTitle = normalizeGoalSubject(rawGoal.title || fallbackTitle);
  const goalDescription =
    (rawGoal.description || `Plan to achieve: ${goalTitle}`).toString().trim() ||
    `Plan to achieve: ${goalTitle}`;

  const seenTitles = new Set();
  const tasks = rawTasks
    .map((task) => {
      const title = (task?.title || '').toString().trim();
      if (!title || isLowSignalTaskTitle(title, goalTitle)) {
        return null;
      }

      const normalizedKey = normalizeTextKey(title);
      if (seenTitles.has(normalizedKey)) {
        return null;
      }
      seenTitles.add(normalizedKey);

      const description =
        (task?.description || `Work on: ${title}`).toString().trim() || `Work on: ${title}`;
      const durationHours = clampNumber(task?.durationHours, 0.5, 8, 1);

      return {
        title,
        description,
        durationHours: Number(durationHours.toFixed(1)),
        steps: Array.isArray(task?.steps) ? task.steps : [],
        tips: Array.isArray(task?.tips) ? task.tips : [],
        expectedOutcome: task?.expectedOutcome || '',
      };
    })
    .filter(Boolean);

  const fallbackTasks = createGoalAlignedTasks(goalTitle, goalDescription, planning);
  const mergedTasks = [...tasks];
  for (const fallbackTask of fallbackTasks) {
    if (mergedTasks.length >= 8) {
      break;
    }
    const key = normalizeTextKey(fallbackTask.title);
    if (seenTitles.has(key)) {
      continue;
    }
    seenTitles.add(key);
    mergedTasks.push(fallbackTask);
  }

  const deadlineDays =
    planning.targetDays != null
      ? planning.targetDays
      : Math.round(clampNumber(rawGoal.deadlineDays, 1, 180, 14));
  const dailyAvailableHours =
    planning.dailyAvailableHours != null
      ? planning.dailyAvailableHours
      : Number(clampNumber(rawGoal.dailyAvailableHours, 0.5, 12, 2).toFixed(1));

  return {
    goal: {
      title: goalTitle,
      description: goalDescription,
      deadlineDays,
      dailyAvailableHours,
    },
    tasks: mergedTasks.slice(0, 8),
  };
};

const parseGoalJson = (rawJson) => {
  const text = (rawJson || '').toString().trim();
  if (!text) {
    throw new Error('AI returned an empty response');
  }

  // Try direct JSON first
  try {
    return JSON.parse(text);
  } catch (directError) {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const jsonSlice = text.slice(firstBrace, lastBrace + 1);
      return JSON.parse(jsonSlice);
    }
    throw directError;
  }
};

/**
 * Check error type to determine if credits are truly expired vs rate-limited vs auth error
 * Priority: no_credits > auth_error > rate_limited > other_error
 */
const classifyError = (error) => {
  const message = error?.message?.toLowerCase() || '';
  const status = error?.status || error?.code;
  
  // Priority 1: TRULY NO CREDITS/INSUFFICIENT BALANCE
  // Check for explicit credit/billing keywords FIRST (before checking "invalid")
  if (
    status === 402 || // Payment Required
    message.includes('insufficient balance') ||
    message.includes('insufficient quota') ||
    message.includes('insufficient credits') ||
    message.includes('credit balance') ||
    message.includes('billing') ||
    message.includes('plan and billing') ||
    message.includes('upgrade') ||
    message.includes('payment') ||
    message.includes('exceeded your current quota') || // OpenAI: plan quota exhausted
    error?.code === 'insufficient_quota'
  ) {
    return 'no_credits';
  }
  
  // Priority 2: AUTH ERRORS (invalid key)
  if (
    status === 401 ||
    status === 403 ||
    message.includes('unauthorized') ||
    message.includes('not authorized') ||
    message.includes('invalid api key') ||
    message.includes('incorrect api key') ||
    error?.code === 'invalid_api_key' ||
    error?.code === 'auth_error'
  ) {
    return 'auth_error';
  }
  
  // Priority 3: RATE LIMITED (temporary quota - free tier limits hit)
  if (
    status === 429 ||
    (message.includes('quota') && status !== 402) ||
    (message.includes('rate limit') && status !== 402) ||
    message.includes('too many requests')
  ) {
    return 'rate_limited';
  }
  
  // Priority 4: OTHER ERRORS
  return 'other_error';
};

/**
 * Call OpenAI with error handling
 */
const callOpenAI = async (systemPrompt, userPrompt) => {
  if (!models.openai) {
    throw new Error('OpenAI not configured');
  }

  console.log('ðŸ¤– Trying OpenAI API with model: gpt-4o-mini');
  const response = await models.openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
  });
  
  console.log('âœ… OpenAI succeeded');
  if (!response?.choices?.[0]?.message?.content) {
    throw new Error('Empty response from OpenAI');
  }
  return response.choices[0].message.content;
};

/**
 * Call Claude with error handling
 */
const callClaude = async (systemPrompt, userPrompt) => {
  if (!models.claude) {
    throw new Error('Claude not configured');
  }

  console.log('ðŸ¤– Trying Claude API');
  const response = await models.claude.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 2000,
    messages: [
      { role: 'user', content: userPrompt }
    ],
    system: systemPrompt,
  });
  
  console.log('âœ… Claude succeeded');
  if (!response?.content?.[0]?.text) {
    throw new Error('Empty response from Claude');
  }
  return response.content[0].text;
};

/**
 * Call Gemini with error handling
 */
const callGemini = async (systemPrompt, userPrompt) => {
  if (!models.gemini) {
    throw new Error('Gemini not configured');
  }

  console.log('ðŸ¤– Trying Gemini API');
  const model = models.gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const response = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [{ text: `${systemPrompt}\n\nUser: ${userPrompt}` }],
      }
    ],
  });

  console.log('âœ… Gemini succeeded');
  const text = response.response.text();
  if (!text) {
    throw new Error('Empty response from Gemini');
  }
  return text;
};

/**
 * Call DeepSeek with error handling
 */
const callDeepSeek = async (systemPrompt, userPrompt) => {
  if (!models.deepseek) {
    throw new Error('DeepSeek not configured');
  }

  console.log('ðŸ¤– Trying DeepSeek API');
  const fetch = require('node-fetch');
  const response = await fetch(models.deepseek.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${models.deepseek.apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    const err = new Error(error.error?.message || 'DeepSeek API error');
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  console.log('âœ… DeepSeek succeeded');
  
  if (!data?.choices?.[0]?.message?.content) {
    throw new Error('Empty response from DeepSeek');
  }
  return data.choices[0].message.content;
};

/**
 * Call Grok with error handling
 */
const callGrok = async (systemPrompt, userPrompt) => {
  if (!models.grok) {
    throw new Error('Grok not configured');
  }

  console.log('ðŸ¤– Trying Grok API');
  const fetch = require('node-fetch');
  const response = await fetch(models.grok.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${models.grok.apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-2-latest',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    const err = new Error(error.error?.message || 'Grok API error');
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  console.log('âœ… Grok succeeded');
  
  if (!data?.choices?.[0]?.message?.content) {
    throw new Error('Empty response from Grok');
  }
  return data.choices[0].message.content;
};
/**
 * Generate goal with AI using fallback to multiple models if one fails.
 * Order: OpenAI -> Claude -> Gemini -> DeepSeek -> Grok
 * 
 * Only shows "credits expired" if MULTIPLE configured models have NO CREDITS (402).
 * Rate limiting (429) doesn't trigger credits error - it's temporary.
 */
const callAIModelWithFallback = async (systemPrompt, userPrompt) => {
  const models_to_try = [
    { name: 'OpenAI', fn: callOpenAI },
    { name: 'Claude', fn: callClaude },
    { name: 'Gemini', fn: callGemini },
    { name: 'DeepSeek', fn: callDeepSeek },
    { name: 'Grok', fn: callGrok },
  ];

  let lastError = null;
  let attemptedCount = 0;
  let noCreditsCount = 0;      // Models with 402 / insufficient balance
  let rateLimitedCount = 0;    // Models with 429 / quota exceeded (temporary)
  let authErrorCount = 0;      // Models with 401/403 / invalid key

  for (const model of models_to_try) {
    const cooldown = getProviderCooldown(model.name);
    if (cooldown) {
      const remainingSeconds = Math.ceil((cooldown.until - Date.now()) / 1000);
      console.warn(`Skipping ${model.name} (${cooldown.errorType}) for ${remainingSeconds}s`);
      if (cooldown.errorType === 'no_credits') {
        noCreditsCount++;
      } else if (cooldown.errorType === 'rate_limited') {
        rateLimitedCount++;
      } else if (cooldown.errorType === 'auth_error') {
        authErrorCount++;
      }
      continue;
    }

    try {
      attemptedCount++;
      const result = await withTimeout(
        model.fn(systemPrompt, userPrompt),
        AI_PROVIDER_TIMEOUT_MS,
        model.name
      );
      return result; // Success!
    } catch (error) {
      const errorType = classifyError(error);
      
      console.error(`âŒ ${model.name} failed:`, {
        message: error.message,
        status: error.status,
        errorType,
      });

      lastError = error;
      setProviderCooldown(model.name, errorType, error);
      
      // Track error types
      if (errorType === 'no_credits') {
        noCreditsCount++;
      } else if (errorType === 'rate_limited') {
        rateLimitedCount++;
      } else if (errorType === 'auth_error') {
        authErrorCount++;
      }

      // Try next model
      continue;
    }
  }

  // If multiple models show NO_CREDITS error (402), credits are likely expired across providers
  if (noCreditsCount >= 2) {
    const err = new Error('Oops your AI credits are expired');
    err.statusCode = 402;
    throw err;
  }

  // If most models are auth errors (invalid keys), inform user
  if (authErrorCount >= 3) {
    const err = new Error('Invalid API keys configured. Please check your credentials.');
    err.statusCode = 401;
    throw err;
  }

  if (attemptedCount === 0) {
    if (noCreditsCount > 0) {
      const err = new Error('AI credits are unavailable right now. Please top up and try again.');
      err.statusCode = 402;
      throw err;
    }
    if (authErrorCount > 0) {
      const err = new Error('AI providers are temporarily disabled due to invalid credentials.');
      err.statusCode = 401;
      throw err;
    }
    if (rateLimitedCount > 0) {
      const err = new Error('AI providers are cooling down from rate limits. Please retry shortly.');
      err.statusCode = 429;
      throw err;
    }
  }

  // If rate limited but have fallbacks, use the error message as-is
  if (lastError) {
    const err = new Error(lastError.message || 'All AI services are currently unavailable');
    err.statusCode = lastError.statusCode || lastError.status || 503;
    throw err;
  }

  throw new Error('No AI models configured or available');
};

/**
 * Generate a new goal and its subtasks using AI with automatic fallback.
 * Tries multiple AI models in sequence if one fails due to expired credentials.
 * @param {string} prompt User's input describing what they want to achieve.
 * @returns {Object} JSON payload of { goal: { title, description, deadline, dailyAvailableHours }, tasks: [{ title, description, durationHours }] }
 */
const generateGoalWithTasks = async (prompt, options = {}) => {
  const planning = normalizePlanningOptions(options);
  const constraintLines = [];
  if (planning.targetDays != null) {
    constraintLines.push(
      `The user wants to achieve the goal in exactly ${planning.targetDays} days.`
    );
  }
  if (planning.dailyAvailableHours != null) {
    constraintLines.push(
      `The user can dedicate ${planning.dailyAvailableHours} hours per day.`
    );
  }
  if (planning.targetDays != null && planning.dailyAvailableHours != null) {
    const totalHoursBudget = Number(
      (planning.targetDays * planning.dailyAvailableHours).toFixed(1)
    );
    constraintLines.push(
      `Total task effort should be realistic for at most ${totalHoursBudget} hours overall.`
    );
  }
  if (planning.examTemplate && planning.examTemplate !== 'auto') {
    constraintLines.push(`Use the "${planning.examTemplate}" exam/career template for planning.`);
  }
  if (planning.currentLevel) {
    constraintLines.push(`Current learner level: ${planning.currentLevel}.`);
  }
  if (Array.isArray(planning.weakAreas) && planning.weakAreas.length > 0) {
    constraintLines.push(`Weak areas to prioritize: ${planning.weakAreas.join(', ')}.`);
  }
  if (planning.preferredStudyWindow) {
    constraintLines.push(`Preferred study window: ${planning.preferredStudyWindow}.`);
  }
  constraintLines.push(
    'Create tasks in a logical day-by-day learning sequence from beginner to advanced execution.'
  );
  constraintLines.push('Avoid generic tasks like "review progress" unless tied to a concrete deliverable.');

  const planningConstraintBlock = constraintLines.join('\n');
  const systemPrompt = `
You are an expert productivity mentor named Chronify. 
Your job is to take a user's rough goal ('prompt') and break it down into a structured, achievable project plan.
Analyze the user's prompt to determine a realistic deadline and a daily time commitment.
Then, break the goal down into distinct tasks. 
Use these planning constraints:
${planningConstraintBlock}
Return ONLY valid JSON matching this exact structure:
{
  "goal": {
    "title": "Clear, actionable title of the goal",
    "description": "Short motivational description",
    "deadlineDays": Number (how many days from today this should take),
    "dailyAvailableHours": Number (recommended hours per day, e.g., 2)
  },
  "tasks": [
    {
      "title": "Specific task title",
      "description": "What exactly to do in this task",
      "durationHours": Number (estimated hours, e.g. 1.5),
      "steps": ["Step 1", "Step 2", "Step 3"],
      "tips": ["Tip 1"],
      "expectedOutcome": "What done looks like"
    }
  ]
}
Do not include markdown blocks like \`\`\`json. Just the raw JSON object.`;

  let rawJson;
  try {
    rawJson = await callAIModelWithFallback(systemPrompt, prompt);
    console.log('âœ… AI API response received');
  } catch (error) {
    console.error('âŒ All AI services failed:', error.message);
    if (shouldUseLocalFallback()) {
      console.warn('Using local AI fallback for goal generation');
      rawJson = createLocalGoalPlan(prompt, planning);
    } else {
      error.statusCode = error.statusCode || 500;
      throw error;
    }
  }

  // Validate response structure
  if (!rawJson) {
    console.error('âŒ Empty AI response');
    throw new Error('AI returned an empty response');
  }

  console.log('ðŸ“ AI Response (first 200 chars):', rawJson.substring(0, 200));

  let parsedData;
  try {
    parsedData = parseGoalJson(rawJson);
  } catch (err) {
    console.error('âŒ Failed to parse AI response as JSON:');
    console.error('Raw response:', rawJson);
    console.error('Parse error:', err.message);

    if (shouldUseLocalFallback()) {
      console.warn('Using local AI fallback because JSON format was invalid');
      parsedData = parseGoalJson(createLocalGoalPlan(prompt, planning));
    } else {
      throw new Error(`AI response format error: ${err.message}`);
    }
  }

  const normalizedPlan = normalizeGoalPlan(parsedData, prompt, planning);
  console.log('âœ… Goal parsed successfully with', normalizedPlan.tasks.length, 'tasks');
  return normalizedPlan;
};

/**
 * Get step-by-step suggestions/mentorship for a specific task.
 * Uses fallback to multiple models if one fails.
 * @param {string} taskTitle Title of the task.
 * @param {string} taskDescription Description of the task.
 * @returns {string} Markdown formatted guidance.
 */
const suggestTaskBreakdown = async (taskTitle, taskDescription) => {
  const systemPrompt = `
You are an expert productivity mentor named Chronify.
Your student is working on a specific task. Provide a brief, highly actionable bulleted list of step-by-step instructions or tips on how to successfully and efficiently complete this task. 
Use markdown formatting to make it easy to read. 
Keep it concise, encouraging, and directly focused on the task at hand.`;

  const userPrompt = `Task Title: ${taskTitle}\nDescription: ${taskDescription || 'None'}\n\nPlease guide me on how to do this.`;

  try {
    console.log('ðŸ¤– Calling AI API for task breakdown');
    const response = await callAIModelWithFallback(systemPrompt, userPrompt);
    
    console.log('âœ… AI API response received for task breakdown');
    return response;
  } catch (error) {
    console.error('âŒ AI services failed (suggestTaskBreakdown):', {
      message: error.message,
      statusCode: error.statusCode,
    });
    if (shouldUseLocalFallback()) {
      console.warn('Using local AI fallback for task breakdown');
      return createLocalTaskMentor(taskTitle, taskDescription);
    }
    error.statusCode = error.statusCode || 500;
    throw error;
  }
};

const generateTaskInstructions = async (taskTitle, taskDescription, options = {}) => {
  const title = (taskTitle || '').toString().trim();
  const description = (taskDescription || '').toString().trim();
  const taskTypeHint = detectInstructionTaskType(title, description);

  if (!title) {
    return normalizeTaskInstructionPayload(
      createLocalTaskInstructions('your task', description),
      'your task',
      description
    );
  }

  if (options.localOnly) {
    return normalizeTaskInstructionPayload(
      createLocalTaskInstructions(title, description),
      title,
      description
    );
  }

  const systemPrompt = `
You are an intelligent task assistant.
Your job is to convert a task (title + description) into clear, actionable, and highly specific instructions.

Generate a UNIQUE response for each task. Avoid template-like repetition.

Return ONLY valid JSON with this exact shape:
{
  "summary": "1-2 sentence explanation",
  "steps": ["Step 1", "Step 2", "Step 3"],
  "tips": ["Optional tip 1", "Optional tip 2"],
  "expectedOutcome": "What successful completion looks like"
}
Rules:
- Summary must be concise and practical.
- Generate 3 to 7 steps.
- Every step must be specific to the task, actionable, realistic, and easy to follow.
- Avoid vague language and avoid unnecessary jargon.
- Never use these generic lines:
  - "Start by understanding the task"
  - "Break it into smaller steps"
  - "Review your work"
- Use varied verbs and phrasing so the response feels freshly written.
- Adapt by task type:
  - Coding: include implementation, tools/files, testing, and debugging actions.
  - Study: include topic coverage, note-making, practice questions, and revision.
  - Fitness: include warm-up, workout details (sets/reps/time), and cool-down.
  - Work: include deliverables, documents, meetings/feedback, and submission.
  - Personal: include realistic real-world actions and logistics.
- If task input is vague, infer a realistic scenario and make the steps concrete.
- "tips" is optional; include only when genuinely useful.
- "expectedOutcome" must be specific, observable, and practical.
`;

  const userPrompt = `INPUT:
- Task Title: ${title}
- Task Description: ${description || 'None'}
- Task Type Hint: ${taskTypeHint}

GOAL:
Generate clear, actionable instructions unique to this task.

OUTPUT:
- Summary
- Steps (3-7)
- Optional tips
- Expected outcome`;

  try {
    const raw = await callAIModelWithFallback(systemPrompt, userPrompt);
    const parsed = parseGoalJson(raw);
    return normalizeTaskInstructionPayload(parsed, title, description);
  } catch (error) {
    if (shouldUseLocalFallback()) {
      return normalizeTaskInstructionPayload(
        createLocalTaskInstructions(title, description),
        title,
        description
      );
    }
    error.statusCode = error.statusCode || 500;
    throw error;
  }
};



module.exports = {
  generateGoalWithTasks,
  generateTaskInstructions,
  suggestTaskBreakdown,
};

