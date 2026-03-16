const taskService = require('../services/taskService');

// @desc    Create a new task (manual or AI-sourced)
// @route   POST /api/v1/tasks
// @access  Private
const createTask = async (req, res, next) => {
  try {
    const {
      goalId,
      title,
      description,
      source,
      startTime,
      endTime,
      reminderOffsetMinutes,
    } = req.body;

    if (!title || !startTime || !endTime) {
      return res.status(400).json({
        message: 'Title, startTime, and endTime are required',
      });
    }

    const task = await taskService.createTask({
      userId: req.user._id,
      goalId,
      title,
      description,
      source,
      startTime,
      endTime,
      reminderOffsetMinutes,
    });

    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
};

// @desc    List tasks for current user (optionally within a time range)
// @route   GET /api/v1/tasks
// @access  Private
const listTasks = async (req, res, next) => {
  try {
    const { from, to } = req.query;

    const parsedFrom = from ? new Date(from) : undefined;
    const parsedTo = to ? new Date(to) : undefined;

    const tasks = await taskService.listTasksForUser(req.user._id, {
      from: parsedFrom,
      to: parsedTo,
    });

    res.status(200).json(tasks);
  } catch (error) {
    next(error);
  }
};

// @desc    Update task status (completed, missed, skipped, scheduled)
// @route   PATCH /api/v1/tasks/:id/status
// @access  Private
const updateTaskStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }

    const task = await taskService.updateTaskStatus(id, req.user._id, status);

    res.status(200).json(task);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTask,
  listTasks,
  updateTaskStatus,
};

