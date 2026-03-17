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

// @desc    Update a goal
// @route   PATCH /api/v1/goals/:id
// @access  Private
const updateGoal = async (req, res, next) => {
  try {
    const { title, description, deadline, dailyAvailableHours, tags, status } = req.body;

    const goal = await goalService.updateGoal(req.params.id, req.user._id, {
      title,
      description,
      deadline,
      dailyAvailableHours,
      tags,
      status,
    });

    res.status(200).json(goal);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a goal
// @route   DELETE /api/v1/goals/:id
// @access  Private
const deleteGoal = async (req, res, next) => {
  try {
    await goalService.deleteGoal(req.params.id, req.user._id);
    res.status(200).json({ message: 'Goal deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createGoal,
  listGoals,
  updateGoal,
  deleteGoal,
};

