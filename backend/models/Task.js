const mongoose = require('mongoose');

const { Schema } = mongoose;

const taskSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    goalId: {
      type: Schema.Types.ObjectId,
      ref: 'Goal',
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [300, 'Title must be at most 300 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description must be at most 2000 characters'],
    },
    source: {
      type: String,
      enum: ['ai', 'manual'],
      default: 'manual',
      index: true,
    },
    startTime: {
      type: Date,
      required: [true, 'Start time is required'],
      index: true,
    },
    endTime: {
      type: Date,
      required: [true, 'End time is required'],
      validate: {
        validator(value) {
          return !this.startTime || value > this.startTime;
        },
        message: 'End time must be after start time',
      },
    },
    reminderOffsetMinutes: {
      type: Number,
      default: null,
      min: [0, 'Reminder offset must be non-negative'],
      max: [24 * 60, 'Reminder offset must be at most 1440 minutes'],
    },
    reminderTime: {
      type: Date,
      default: null,
      index: true,
    },
    reminderSent: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'missed', 'skipped'],
      default: 'scheduled',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;

