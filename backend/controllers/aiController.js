const aiService = require('../services/aiService');
const Goal = require('../models/Goal');
const Task = require('../models/Task');

// @desc    Generate a goal and tasks from a prompt using AI
// @route   POST /api/v1/ai/generate-goal
// @access  Private
const generateGoal = async (req, res, next) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ message: 'Prompt is required' });
    }

    const aiPlan = await aiService.generateGoalWithTasks(prompt);
    
    // Calculate actual Date for deadline
    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + (aiPlan.goal.deadlineDays || 7));

    // Save Goal
    const goal = await Goal.create({
      userId: req.user._id,
      title: aiPlan.goal.title,
      description: aiPlan.goal.description,
      deadline: deadlineDate,
      dailyAvailableHours: aiPlan.goal.dailyAvailableHours || 2,
    });

    // We will distribute tasks sequentially starting from today.
    let currentStartTime = new Date();
    currentStartTime.setHours(9, 0, 0, 0); // Start at 9 AM by default
    
    const taskPromises = aiPlan.tasks.map((t) => {
      const startTime = new Date(currentStartTime);
      const endTime = new Date(currentStartTime);
      // add duration
      const durationMs = (t.durationHours || 1) * 60 * 60 * 1000;
      endTime.setTime(endTime.getTime() + durationMs);
      
      // Move currentStartTime for next task
      currentStartTime.setTime(endTime.getTime() + (30 * 60 * 1000)); // 30 min break

      return Task.create({
        userId: req.user._id,
        goalId: goal._id,
        title: t.title,
        description: t.description,
        source: 'ai',
        startTime,
        endTime,
      });
    });

    const tasks = await Promise.all(taskPromises);

    res.status(201).json({ goal, tasks });
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
  suggestTaskSteps,
};
