// middleware/index.js
const jwt = require('jsonwebtoken');
const { TokenExpiredError } = require('jsonwebtoken');
const { User } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET;

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.email && (!decoded._id || !decoded.username)) {
      return res.status(403).json({ message: 'Invalid token: Missing required fields' });
    }
    
    req.user = {
      _id: decoded._id || null,
      username: decoded.username || null,
      email: decoded.email || null,
      isAdmin: decoded.isAdmin || false
    };
    
    next();
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return res.status(401).json({
        message: 'Token expired',
        expired: true
      });
    }
    return res.status(403).json({ message: 'Invalid token' });
  }
};

// Middleware to authenticate admin
const authenticateAdmin = async (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// Database connection check middleware
let lastPingTime = 0;
let lastPingResult = null;

const checkDbConnection = async (req, res, next) => {
  const now = Date.now();
  
  // Cache ping results for 30 seconds
  if (lastPingResult && now - lastPingTime < 30000) {
    return lastPingResult ? next() : res.status(503).json({ message: 'Database not connected' });
  }

  try {
    if (mongoose.connection.readyState !== 1) {
      console.log('[DB Check] Connection not ready');
      return res.status(503).json({ message: 'Database connection lost' });
    }

    await mongoose.connection.db.command({ ping: 1 });
    lastPingResult = true;
    lastPingTime = now;
    next();
  } catch (error) {
    console.error('[DB Check] Database ping failed:', error);
    lastPingResult = false;
    lastPingTime = now;
    return res.status(503).json({ 
      message: 'Database connection error',
      dbState: mongoose.connection.readyState,
    });
  }
};

// Middleware to update user online status
const updateOnlineStatus = (req, res, next) => {
  if (req.user && req.user.username) {
    const { updateUserOnlineStatus } = require('../utils/userStatus');
    updateUserOnlineStatus(req.user.username);
  }
  next();
};

// Content Security Policy Middleware
const cspMiddleware = (req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' https://checkout.paystack.com https://www.googletagmanager.com https://s3-eu-west-1.amazonaws.com 'unsafe-inline' 'sha256-VA8O2hAdooB288EpSTrGl7z3QikbWU9wwoebO/QaYk=' 'sha256-+5XkZFazzJo8n0iOP4ti/cLCMUudTf//Mzkb7xNPXIc=' https://www.gstatic.com/firebasejs; " +
    "style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self' https://api.paystack.co https://www.googletagmanager.com https://*.supabase.co https://firestore.googleapis.com https://fcm.googleapis.com; " +
    "img-src 'self' data: https://*.supabase.co; " +
    "frame-src 'self' https://checkout.paystack.com; " +
    "media-src 'self' https://*.supabase.co;"
  );
  next();
};

module.exports = {
  authenticateToken,
  authenticateAdmin,
  checkDbConnection,
  updateOnlineStatus,
  cspMiddleware
};