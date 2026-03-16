const mongoose = require('mongoose');

const { Schema } = mongoose;

const productivityLogSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    tasksCompleted: {
      type: Number,
      default: 0,
      min: 0,
    },
    tasksScheduled: {
      type: Number,
      default: 0,
      min: 0,
    },
    completionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    focusScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    streakDays: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

const ProductivityLog = mongoose.model('ProductivityLog', productivityLogSchema);

module.exports = ProductivityLog;

