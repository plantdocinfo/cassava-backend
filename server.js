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
  // Accept image types AND octet-stream (ESP32-CAM raw upload)
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

// Body parsing - Support raw binary for ESP32-CAM
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.raw({ type: 'image/*', limit: '50mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));

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