const mongoose = require('mongoose');
const Task = require('../backend/models/Task');

const TASK_CALENDAR_INDEX_NAME = 'userId_1_googleCalendarEventId_1';

const ensureTaskCalendarIndex = async () => {
  const indexes = await Task.collection.indexes();
  const existing = indexes.find((index) => index.name === TASK_CALENDAR_INDEX_NAME);

  const hasExpectedDefinition =
    Boolean(existing?.unique) &&
    existing?.partialFilterExpression?.googleCalendarEventId?.$type === 'string';

  if (hasExpectedDefinition) {
    return;
  }

  if (existing) {
    await Task.collection.dropIndex(TASK_CALENDAR_INDEX_NAME);
  }

  await Task.collection.createIndex(
    { userId: 1, googleCalendarEventId: 1 },
    {
      name: TASK_CALENDAR_INDEX_NAME,
      unique: true,
      partialFilterExpression: { googleCalendarEventId: { $type: 'string' } },
    }
  );
};

/**
 * Establish a connection to MongoDB using Mongoose.
 * The connection URI is read from MONGO_URI in the environment.
 */
const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is not defined in environment variables');
  }

  try {
    await mongoose.connect(mongoUri, {
      autoIndex: true,
    });

    // Use native promises
    mongoose.Promise = global.Promise;

    // Keep DB indexes aligned with schema definitions.
    if (process.env.MONGO_SYNC_INDEXES !== 'false') {
      try {
        await Task.syncIndexes();
      } catch (error) {
        console.warn('Task.syncIndexes warning:', error.message);
      }
      await ensureTaskCalendarIndex();
    }

    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    // Exit the process if the DB connection fails in startup
    process.exit(1);
  }
};

module.exports = {
  connectDB,
};
