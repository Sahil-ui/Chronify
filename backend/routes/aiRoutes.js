const express = require('express');

const { generateGoal, replanWeekly, suggestTaskSteps } = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware');
const { apiLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.post('/generate-goal', protect, apiLimiter, generateGoal);
router.post('/replan-weekly', protect, apiLimiter, replanWeekly);
router.post('/tasks/:id/suggest', protect, apiLimiter, suggestTaskSteps);

module.exports = router;
