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

module.exports = {
  createGoal,
  listGoalsForUser,
};

