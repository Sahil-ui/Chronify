const express = require('express');

const { generateGoal, suggestTaskSteps } = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware');
const { apiLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.post('/generate-goal', protect, apiLimiter, generateGoal);
router.post('/tasks/:id/suggest', protect, apiLimiter, suggestTaskSteps);

module.exports = router;
