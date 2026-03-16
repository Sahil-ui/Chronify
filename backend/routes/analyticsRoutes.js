const express = require('express');

const { protect } = require('../middleware/authMiddleware');
const { getOverview } = require('../controllers/analyticsController');

const router = express.Router();

router.use(protect);

router.get('/overview', getOverview);

module.exports = router;

