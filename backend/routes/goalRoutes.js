const express = require('express');

const { protect } = require('../middleware/authMiddleware');
const { createGoal, listGoals } = require('../controllers/goalController');

const router = express.Router();

router.use(protect);

router.post('/', createGoal);
router.get('/', listGoals);

module.exports = router;

