const { startReminderJob } = require('./reminderJob');

const startJobs = () => {
  startReminderJob();
};

module.exports = {
  startJobs,
};

