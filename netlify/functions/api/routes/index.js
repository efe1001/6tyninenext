const express = require('express');
const router = express.Router();

// Import all route modules
const authRoutes = require('./auth'); // Main authentication routes
const adminRoutes = require('./admin'); // Admin specific routes
const debugRoutes = require('./debug'); // Debug and test routes

// Import middleware
const {
  authenticateToken,
  authenticateAdmin,
  checkDbConnection,
  cspMiddleware,
  updateOnlineStatus
} = require('./middleware');

// Apply global middleware
router.use(cspMiddleware);
router.use(checkDbConnection);

// Public routes (no authentication required)
router.use('/debug', debugRoutes);

// Authentication routes
router.use('/auth', authRoutes);

// Admin routes (require authentication and admin privileges)
router.use('/admin', authenticateToken, authenticateAdmin, adminRoutes);

// Apply online status middleware to relevant routes
router.use('/chats', updateOnlineStatus);
router.use('/pusher/auth', updateOnlineStatus);

// Base route
router.get('/', (req, res) => {
  res.json({
    message: '6tyNine API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      auth: '/auth',
      admin: '/admin',
      debug: '/debug'
    }
  });
});



// 404 handler
router.use('*', (req, res) => {
  res.status(404).json({
    message: 'Endpoint not found',
    path: req.originalUrl
  });
});

module.exports = router;