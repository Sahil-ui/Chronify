const express = require('express');

const { protect } = require('../middleware/authMiddleware');
const { createGoal, listGoals, updateGoal, deleteGoal } = require('../controllers/goalController');

const router = express.Router();

router.use(protect);

router.post('/', createGoal);
router.get('/', listGoals);
router.patch('/:id', updateGoal);
router.delete('/:id', deleteGoal);

module.exports = router;

