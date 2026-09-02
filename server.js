require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

// Import routes
const diagnoseRoutes = require('./routes/diagnose');
const historyRoutes = require('./routes/history');

// Initialize app
const app = express();
const PORT = process.env.PORT || 3000;

// ============= FIX: Trust Proxy (for Render) =============
app.set('trust proxy', 1);

// ============= MULTER CONFIGURATION =============
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Accept all image types and octet-stream
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/octet-stream'];
  if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(jpg|jpeg|png|webp)$/i)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WEBP are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: fileFilter
});

// ============= MIDDLEWARE =============

// Security - Disable HSTS for ESP32-CAM compatibility
app.use(helmet({
  hsts: false
}));

// Compression
app.use(compression());

// CORS - Allow all origins for ESP32-CAM
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Content-Length']
}));

// Logging
app.use(morgan('combined'));

// ============================================================
// CRITICAL FIX: Handle raw binary body BEFORE JSON middleware
// This allows the ESP32-CAM to send raw JPEG data
// ============================================================

// First, check if the request is a raw binary image
app.use((req, res, next) => {
  // Skip for non-POST requests or if content-type is already set
  if (req.method !== 'POST') return next();
  
  const contentType = req.headers['content-type'] || '';
  
  // If it's a raw image or octet-stream, capture the raw body
  if (contentType.includes('image/jpeg') || 
      contentType.includes('image/png') || 
      contentType.includes('image/webp') ||
      contentType.includes('application/octet-stream')) {
    
    let rawData = [];
    req.on('data', (chunk) => {
      rawData.push(chunk);
    });
    req.on('end', () => {
      if (rawData.length > 0) {
        req.rawBody = Buffer.concat(rawData);
        // Also store as body for compatibility
        req.body = req.rawBody;
      }
      next();
    });
  } else {
    next();
  }
});

// Then apply JSON and URL-encoded middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    error: 'Too many requests, please try again later.'
  }
});
app.use('/api', limiter);

// ============= ROUTES =============

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: '🌿 Cassava Disease Diagnosis API',
    version: '2.0.0',
    endpoints: {
      health: 'GET /health',
      diagnose: 'POST /api/diagnose (multipart/form-data with "image" field)',
      diagnose_base64: 'POST /api/diagnose (JSON with "image" field as base64)',
      diagnose_raw: 'POST /api/diagnose (raw JPEG binary - for ESP32-CAM)',
      history: 'GET /api/history',
      history_limit: 'GET /api/history?limit=10'
    }
  });
});

// ============================================================
// CRITICAL FIX: Custom middleware for /api/diagnose to handle raw body
// ============================================================
app.use('/api/diagnose', (req, res, next) => {
  // If we captured a raw body and it's not multipart, attach it
  if (req.rawBody && !req.file) {
    // Check if it's a valid JPEG (starts with 0xFF 0xD8)
    if (req.rawBody.length > 10 && req.rawBody[0] === 0xFF && req.rawBody[1] === 0xD8) {
      // Create a file-like object for the controller
      req.file = {
        buffer: req.rawBody,
        size: req.rawBody.length,
        originalname: 'leaf.jpg',
        mimetype: 'image/jpeg'
      };
      console.log('📷 Raw JPEG detected and attached to request');
    }
  }
  next();
});

// API Routes with multer for file uploads
app.use('/api/diagnose', upload.single('image'), diagnoseRoutes);
app.use('/api/history', historyRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// ============= START SERVER =============

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║  🌿 CASSAVA DISEASE DIAGNOSIS BACKEND                       ║
║                                                              ║
║  🚀 Server running on port: ${PORT}                          ║
║  🔗 Health check: http://localhost:${PORT}/health           ║
║  📡 API: http://localhost:${PORT}/api                       ║
║                                                              ║
║  🌍 Environment: ${process.env.NODE_ENV || 'development'}   ║
║  📦 Roboflow: ${process.env.ROBOFLOW_MODEL || 'Not set'}    ║
║  ☁️ Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME || 'Not set'} ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});