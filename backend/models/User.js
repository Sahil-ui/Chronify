const mongoose = require('mongoose');

const { Schema } = mongoose;

const userSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name must be at most 100 characters'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'Please provide a valid email address',
    ],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    maxlength: [128, 'Password must be at most 128 characters'],
    select: false, // do not return password by default
  },
  productivityScore: {
    type: Number,
    default: 0,
    min: [0, 'Productivity score cannot be negative'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
  tokenVersion: {
    type: Number,
    default: 0,
    min: [0, 'tokenVersion cannot be negative'],
  },
});

const User = mongoose.model('User', userSchema);

module.exports = User;

