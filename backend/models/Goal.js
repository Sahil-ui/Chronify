const mongoose = require('mongoose');

const { Schema } = mongoose;

const goalSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title must be at most 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description must be at most 2000 characters'],
    },
    deadline: {
      type: Date,
      required: [true, 'Deadline is required'],
    },
    dailyAvailableHours: {
      type: Number,
      required: [true, 'Daily available hours are required'],
      min: [0.5, 'Daily available hours must be at least 0.5'],
      max: [16, 'Daily available hours must be at most 16'],
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'completed', 'archived'],
      default: 'active',
      index: true,
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: 50,
      },
    ],
    aiPlanning: {
      isAiGenerated: {
        type: Boolean,
        default: false,
      },
      examTemplate: {
        type: String,
        trim: true,
        maxlength: 60,
      },
      currentLevel: {
        type: String,
        trim: true,
        maxlength: 60,
      },
      weakAreas: [
        {
          type: String,
          trim: true,
          maxlength: 80,
        },
      ],
      preferredStudyWindow: {
        type: String,
        trim: true,
        maxlength: 80,
      },
      targetDays: {
        type: Number,
        min: 1,
        max: 365,
      },
      dailyAvailableHours: {
        type: Number,
        min: 0.5,
        max: 16,
      },
      lastReplannedAt: {
        type: Date,
      },
      lastWeeklyCompletionRate: {
        type: Number,
        min: 0,
        max: 100,
      },
    },
  },
  {
    timestamps: true,
  }
);

const Goal = mongoose.model('Goal', goalSchema);

module.exports = Goal;
