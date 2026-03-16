const ProductivityLog = require('../models/ProductivityLog');

const startOfDayUtc = (date) => {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const getTodayOverview = async (userId) => {
  const today = startOfDayUtc(new Date());

  const todayLog = await ProductivityLog.findOne({
    userId,
    date: today,
  });

  const completionRate = todayLog?.completionRate ?? 0;
  const tasksCompleted = todayLog?.tasksCompleted ?? 0;
  const tasksScheduled = todayLog?.tasksScheduled ?? 0;

  return {
    date: today,
    completionRate,
    tasksCompleted,
    tasksScheduled,
  };
};

const getWeeklyStreak = async (userId) => {
  const today = startOfDayUtc(new Date());
  const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);

  const logs = await ProductivityLog.find({
    userId,
    date: {
      $gte: sevenDaysAgo,
      $lte: today,
    },
  }).sort({ date: 1 });

  // Simple definition: number of consecutive days (up to 7) ending today
  // where completionRate > 0.
  let streak = 0;
  const map = new Map(logs.map((l) => [startOfDayUtc(l.date).getTime(), l]));

  for (let i = 0; i < 7; i += 1) {
    const day = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const key = day.getTime();
    const log = map.get(key);

    if (log && log.completionRate > 0) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
};

const getOverview = async (userId) => {
  const [todayOverview, weeklyStreak] = await Promise.all([
    getTodayOverview(userId),
    getWeeklyStreak(userId),
  ]);

  return {
    today: todayOverview,
    weeklyStreak,
  };
};

module.exports = {
  getOverview,
};

