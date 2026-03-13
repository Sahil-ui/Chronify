const mongoose = require('mongoose');

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

    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    // Exit the process if the DB connection fails in startup
    process.exit(1);
  }
};

module.exports = {
  connectDB,
};

