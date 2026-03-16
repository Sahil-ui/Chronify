const analyticsService = require('../services/analyticsService');

// @desc    Get productivity overview for the current user
// @route   GET /api/v1/analytics/overview
// @access  Private
const getOverview = async (req, res, next) => {
  try {
    const overview = await analyticsService.getOverview(req.user._id);
    res.status(200).json(overview);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOverview,
};

