const Goal = require('../models/Goal');

const createGoal = async ({ userId, title, description, deadline, dailyAvailableHours, tags }) => {
  const goal = await Goal.create({
    userId,
    title,
    description,
    deadline,
    dailyAvailableHours,
    tags,
  });

  return goal;
};

const listGoalsForUser = async (userId) => {
  const goals = await Goal.find({ userId }).sort({ createdAt: -1 });
  return goals;
};

const updateGoal = async (goalId, userId, updates) => {
  // Strip undefined fields so we only patch what was sent
  const patch = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );

  const goal = await Goal.findOneAndUpdate(
    { _id: goalId, userId },
    patch,
    { new: true, runValidators: true }
  );

  if (!goal) {
    const err = new Error('Goal not found');
    err.statusCode = 404;
    throw err;
  }

  return goal;
};

const deleteGoal = async (goalId, userId) => {
  const goal = await Goal.findOneAndDelete({ _id: goalId, userId });

  if (!goal) {
    const err = new Error('Goal not found');
    err.statusCode = 404;
    throw err;
  }
};

module.exports = {
  createGoal,
  listGoalsForUser,
  updateGoal,
  deleteGoal,
};

