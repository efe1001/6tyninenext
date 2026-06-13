// config/db.js - OPTIMIZED FOR SINGLE CONNECTION IN M0 CLUSTER
const mongoose = require('mongoose');

let cachedConnection = null;
let isConnected = false;

const connectDB = async () => {
  console.log('[DB] connectDB called, current readyState:', mongoose.connection.readyState);

  // Check if there's an existing active connection
  if (isConnected && cachedConnection && mongoose.connection.readyState === 1) {
    console.log('[DB] Reusing existing SINGLE MongoDB connection', {
      dbName: mongoose.connection.name,
      host: mongoose.connection.host
    });
    return cachedConnection;
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI environment variable not set');
  }

  // Log obscured URI for debugging
  const obscuredUri = mongoUri.replace(/\/\/(.+?)@/, '//[credentials]@');
  console.log('[DB] Attempting to establish SINGLE connection to:', obscuredUri);

  // CRITICAL: Minimal connection options for M0 cluster (strictly 1 connection)
  const options = {
    maxPoolSize: 1, // STRICT: Only 1 connection total for M0
    minPoolSize: 1, // Keep exactly 1 connection open to avoid recreation
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    retryWrites: true,
    retryReads: true,
    bufferCommands: false, // Don't buffer when disconnected
    bufferMaxEntries: 0, // No buffering
    autoIndex: false, // Disable auto-indexing to reduce load
    keepAlive: true,
    keepAliveInitialDelay: 300000, // 5 minutes
  };

  // Retry logic aligned with router (3 attempts, 5s delay)
  let attempts = 0;
  const maxAttempts = 3;
  const delay = 5000;
  while (attempts < maxAttempts) {
    try {
      cachedConnection = await mongoose.connect(mongoUri, options);
      isConnected = true;
      console.log('[DB] SINGLE MongoDB connection established successfully', {
        dbName: mongoose.connection.name,
        host: mongoose.connection.host,
        poolSize: '1 (M0 Optimized)'
      });
      return cachedConnection;
    } catch (error) {
      attempts++;
      console.error(`[DB] Connection attempt ${attempts} failed:`, error.message);
      if (attempts >= maxAttempts) {
        isConnected = false;
        throw new Error(`Failed to connect to MongoDB after ${maxAttempts} attempts: ${error.message}`);
      }
      console.log(`[DB] Retrying in ${delay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Handle connection events (global, no reconnections)
mongoose.connection.on('error', (error) => {
  console.error('[DB] MongoDB connection error:', error.message);
  isConnected = false;
  cachedConnection = null;
});

mongoose.connection.on('disconnected', () => {
  console.warn('[DB] MongoDB disconnected - no auto-reconnect');
  isConnected = false;
  cachedConnection = null;
});

mongoose.connection.on('connected', () => {
  console.log('[DB] MongoDB SINGLE connection active');
  isConnected = true;
});

mongoose.connection.on('reconnected', () => {
  console.log('[DB] MongoDB reconnected (unexpected in single-pool mode)');
  isConnected = true;
});

// Graceful shutdown (call from server.js)
const closeDB = async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    console.log('[DB] SINGLE connection closed gracefully');
  }
};

process.on('SIGINT', async () => {
  await closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDB();
  process.exit(0);
});

module.exports = connectDB;
module.exports.closeDB = closeDB; // Export for server.js if needed