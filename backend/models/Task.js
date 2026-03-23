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
      required: [true, 'Goal is required'],
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
    googleCalendarEventId: {
      type: String,
      index: true,
    },
    planType: {
      type: String,
      enum: ['standard', 'goal_plan', 'adaptive_replan'],
      default: 'standard',
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
    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
      index: true,
      validate: {
        validator(value) {
          return !this.startTime || value >= this.startTime;
        },
        message: 'Due date must be at or after start time',
      },
    },
    aiInstructions: {
      summary: {
        type: String,
        trim: true,
        maxlength: [500, 'Instruction summary must be at most 500 characters'],
      },
      steps: [
        {
          id: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
          },
          text: {
            type: String,
            required: true,
            trim: true,
            maxlength: [300, 'Checklist step must be at most 300 characters'],
          },
          completed: {
            type: Boolean,
            default: false,
          },
          completedAt: {
            type: Date,
            default: null,
          },
        },
      ],
      tips: [
        {
          type: String,
          trim: true,
          maxlength: [200, 'Instruction tip must be at most 200 characters'],
        },
      ],
      expectedOutcome: {
        type: String,
        trim: true,
        maxlength: [400, 'Expected outcome must be at most 400 characters'],
      },
      generatedAt: {
        type: Date,
      },
    },
    instructionProgress: {
      type: Number,
      default: 0,
      min: [0, 'Instruction progress cannot be below 0'],
      max: [100, 'Instruction progress cannot exceed 100'],
      index: true,
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

taskSchema.pre('validate', function setDueDate() {
  if (!this.dueDate && this.endTime) {
    this.dueDate = this.endTime;
  }

  // Keep a stable non-null ID so inserts remain unique even if an old DB index still
  // treats missing values as null.
  if (this.googleCalendarEventId == null || this.googleCalendarEventId === '') {
    const userPart = this.userId ? this.userId.toString().toLowerCase() : '';
    const taskPart = this._id ? this._id.toString().toLowerCase() : '';

    if (userPart && taskPart) {
      this.googleCalendarEventId = `task${userPart}${taskPart}`;
    } else {
      this.googleCalendarEventId = undefined;
    }
  }
});

taskSchema.index(
  { userId: 1, googleCalendarEventId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      googleCalendarEventId: { $type: 'string' },
    },
  }
);

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
