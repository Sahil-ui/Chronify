const express = require('express');

const { protect } = require('../middleware/authMiddleware');
const {
  createTask,
  listTasks,
  updateTaskStatus,
  updateTask,
  updateChecklistStep,
  deleteTask,
} = require('../controllers/taskController');

const router = express.Router();

router.use(protect);

router.post('/', createTask);
router.get('/', listTasks);
router.patch('/:id/status', updateTaskStatus);
router.patch('/:id/checklist/:stepId', updateChecklistStep);
router.patch('/:id', updateTask);
router.delete('/:id', deleteTask);

module.exports = router;

