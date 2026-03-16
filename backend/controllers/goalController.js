const goalService = require('../services/goalService');

// @desc    Create a new goal
// @route   POST /api/v1/goals
// @access  Private
const createGoal = async (req, res, next) => {
  try {
    const { title, description, deadline, dailyAvailableHours, tags } = req.body;

    if (!title || !deadline || !dailyAvailableHours) {
      return res.status(400).json({
        message: 'Title, deadline, and dailyAvailableHours are required',
      });
    }

    const goal = await goalService.createGoal({
      userId: req.user._id,
      title,
      description,
      deadline,
      dailyAvailableHours,
      tags,
    });

    res.status(201).json(goal);
  } catch (error) {
    next(error);
  }
};

// @desc    List goals for current user
// @route   GET /api/v1/goals
// @access  Private
const listGoals = async (req, res, next) => {
  try {
    const goals = await goalService.listGoalsForUser(req.user._id);
    res.status(200).json(goals);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createGoal,
  listGoals,
};

