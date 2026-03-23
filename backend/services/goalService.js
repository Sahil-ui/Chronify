const Goal = require('../models/Goal');
const taskService = require('./taskService');

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
  const existingGoal = await Goal.findOne({ _id: goalId, userId });
  if (!existingGoal) {
    const err = new Error('Goal not found');
    err.statusCode = 404;
    throw err;
  }

  const previousDeadline = existingGoal.deadline
    ? new Date(existingGoal.deadline).getTime()
    : null;

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

  if (patch.deadline !== undefined) {
    const nextDeadline = goal.deadline ? new Date(goal.deadline).getTime() : null;
    if (previousDeadline !== nextDeadline) {
      await taskService.propagateGoalDeadlineToTasks({
        goalId: goal._id,
        userId,
        deadline: goal.deadline,
      });
    }
  }

  return goal;
};

const deleteGoal = async (goalId, userId) => {
  const goal = await Goal.findOne({ _id: goalId, userId });

  if (!goal) {
    const err = new Error('Goal not found');
    err.statusCode = 404;
    throw err;
  }

  await taskService.deleteTasksByGoal(goal._id, userId);
  await Goal.deleteOne({ _id: goal._id, userId });
};

module.exports = {
  createGoal,
  listGoalsForUser,
  updateGoal,
  deleteGoal,
};
