// models/user.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  id: { type: Number, unique: true }, // Add this if needed
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    required: [true, 'Gender is required'],
  },
  age: {
    type: Number,
    required: [true, 'Age is required'],
    min: [18, 'You must be at least 18 years old'],
  },
  country: {
    type: String,
    required: [true, 'Country is required'],
  },
  state: {
    type: String,
    required: [true, 'State is required'],
  },
  city: {
    type: String,
    required: [true, 'City is required'],
  },
  postalCode: {
    type: String,
    trim: true,
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^\+?[1-9]\d{1,14}$/, 'Phone number is invalid'],
  },
  profilePicture: {
    type: String,
    default: '',
  },
  // Add missing fields that auth.js expects
  location: String,
  bio: String,
  isAdmin: { type: Boolean, default: false },
  balance: { type: Number, default: 0 },
  fcmTokens: [{ type: String, default: [] }],
  numbersVisibility: { 
    type: String, 
    enum: ['all_users', 'subscribers_only', 'followers_only', 'non'], 
    default: 'all_users'
  },
  // Add any other fields that auth.js expects
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { collation: { locale: 'en', strength: 2 } });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if model already exists to avoid OverwriteModelError
module.exports = mongoose.models.User || mongoose.model('User', userSchema);