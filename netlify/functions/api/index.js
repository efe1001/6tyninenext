const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');
const admin = require('firebase-admin');
const serverless = require('serverless-http');
require('dotenv').config();

const app = express();

// Validate required env vars — log only, don't crash serverless function
const requiredEnvVars = [
  'MONGO_URI', 'JWT_SECRET', 'KORA_SECRET_KEY',
];
const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingEnvVars.length > 0) {
  console.error('[Server] Missing environment variables:', missingEnvVars);
}

// Initialize Firebase Admin (once) — uses individual env vars to stay under 4KB Lambda limit
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        project_id: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
  } catch (err) {
    console.error('[Firebase Admin] Init failed:', err.message);
  }
}

// Initialize Supabase
let supabase;
try {
  supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
} catch (err) {
  console.error('[Supabase] Init failed:', err.message);
}

// MongoDB — reuse connection across warm invocations
const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) return;
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 10000,
    });
    console.log('[DB] MongoDB connected');
  } catch (err) {
    console.error('[DB] MongoDB connection error:', err.message);
  }
};

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://6tyninenext.netlify.app',
      'https://6tyninefans.netlify.app',
      'https://6tynine.net',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:3001',
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, origin || '*');
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Make Supabase available to routes
app.use((req, res, next) => {
  req.supabase = supabase;
  next();
});

app.options('*', cors());

// Health check
app.get('/health', async (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
  res.json({
    status: 'OK',
    mongodb: mongoStatus,
    firebase: admin.apps.length ? 'Initialized' : 'Not Initialized',
  });
});

app.get('/', (req, res) => res.json({ message: 'API is running' }));

// Static requires so esbuild bundles only these 4 routes (not unused route files)
const authRoutes = require('./routes/auth.js');
const postsRoutes = require('./routes/posts.js');
const commentsRoutes = require('./routes/comments.js');
const usersRoutes = require('./routes/users.js');

const loadRoutes = () => {
  app.use('/api/auth', authRoutes);
  app.use('/api/posts', postsRoutes);
  app.use('/api/comments', commentsRoutes);
  app.use('/api/users', usersRoutes);
};

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Server] Error:', err.message);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

// Initialize once (cached per warm Lambda instance)
let initialized = false;
const initializeServer = async () => {
  if (initialized) return;
  await connectDB();
  loadRoutes();
  initialized = true;
};

// Local dev server
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 8082;
  initializeServer().then(() => {
    app.listen(PORT, () => console.log(`[Server] Running on http://localhost:${PORT}`));
  });

  // Boost expiration job — local only
  const expireBoostsJob = async () => {
    try {
      const response = await fetch(`http://localhost:${process.env.PORT || 8082}/api/auth/boosts/expire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      console.log(`[Schedule] Expired boosts: ${data.expiredCount || 0}`);
    } catch (err) {
      console.error('[Schedule] Failed to expire boosts:', err.message);
    }
  };
  setInterval(expireBoostsJob, 60 * 60 * 1000);
  setTimeout(expireBoostsJob, 5000);
}

// Netlify Function handler
module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await initializeServer();
  return serverless(app)(event, context);
};
