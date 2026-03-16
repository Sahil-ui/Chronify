const cron = require('node-cron');
const Task = require('../models/Task');

// For MVP we just log reminders to the console.
// Later, this can be extended to send emails, push notifications, etc.

const runReminderTick = async () => {
  const now = new Date();

  try {
    const dueTasks = await Task.find({
      reminderTime: { $ne: null, $lte: now },
      status: 'scheduled',
      reminderSent: false,
    }).limit(100);

    if (!dueTasks.length) {
      return;
    }

    // eslint-disable-next-line no-console
    console.log(
      `🔔 Found ${dueTasks.length} task reminder(s) to process at ${now.toISOString()}`
    );

    // For each task, "send" a reminder and mark it as sent
    const updates = dueTasks.map((task) =>
      Task.findByIdAndUpdate(task._id, { reminderSent: true })
    );

    await Promise.all(updates);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Reminder job error:', error);
  }
};

const startReminderJob = () => {
  // eslint-disable-next-line no-console
  console.log('⏰ Starting reminder job via node-cron (every minute)');

  // Runs once every minute. Adjust the expression as needed.
  cron.schedule('*/2 * * * *', () => {
    runReminderTick();
  });
};

module.exports = {
  startReminderJob,
};

