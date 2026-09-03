require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Import routes
const diagnoseRoutes = require('./routes/diagnose');
const historyRoutes = require('./routes/history');

// Initialize app
const app = express();
const PORT = process.env.PORT || 3000;

// ============= Trust Proxy (for Render) =============
app.set('trust proxy', 1);

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
// Raw binary body capture for /api/diagnose (ESP32-CAM uploads)
// ============================================================
// IMPORTANT: this is the ONLY body-reading middleware for this route.
// A previous version also ran `multer`'s upload.single('image') on the
// same route AFTER this middleware -- since an HTTP request body is a
// stream that can only be consumed once, that second middleware sat
// waiting forever for data that had already been fully read here. The
// request never completed, so it never logged and never reached the
// controller. Do not add a second body-parsing middleware to this route
// without removing or properly gating this one.

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB cap
const RAW_BODY_STALL_TIMEOUT_MS = 30000;   // abort if data stops arriving

app.use('/api/diagnose', (req, res, next) => {
  if (req._rawBodyHandled) return next();

  const contentType = req.headers['content-type'] || '';
  const isRawImage = contentType.includes('image/jpeg') ||
                      contentType.includes('image/png') ||
                      contentType.includes('application/octet-stream') ||
                      contentType.includes('image/webp');

  if (!isRawImage) return next();

  let rawData = [];
  let totalBytes = 0;
  let finished = false;

  const stallTimer = setTimeout(() => {
    if (finished) return;
    finished = true;
    console.log('⏱️ Raw body collection stalled -- aborting');
    res.status(408).json({ success: false, error: 'Upload stalled or timed out' });
  }, RAW_BODY_STALL_TIMEOUT_MS);

  req.on('data', (chunk) => {
    if (finished) return;

    totalBytes += chunk.length;
    if (totalBytes > MAX_IMAGE_BYTES) {
      finished = true;
      clearTimeout(stallTimer);
      res.status(413).json({ success: false, error: 'Image too large (max 10MB)' });
      req.destroy();
      return;
    }
    rawData.push(chunk);
  });

  req.on('end', () => {
    if (finished) return;
    finished = true;
    clearTimeout(stallTimer);

    if (rawData.length > 0) {
      const buffer = Buffer.concat(rawData);
      req.rawBody = buffer;
      req._rawBodyHandled = true;
      console.log(`📷 Captured raw image: ${buffer.length} bytes`);

      if (buffer.length > 10 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
        console.log('✅ Valid JPEG detected');
        req.file = {
          buffer: buffer,
          size: buffer.length,
          originalname: 'leaf.jpg',
          mimetype: 'image/jpeg'
        };
      } else {
        console.log('⚠️ Not a valid JPEG (no FF D8 header)');
      }
    }
    next();
  });

  req.on('error', (err) => {
    if (finished) return;
    finished = true;
    clearTimeout(stallTimer);
    console.error('❌ Raw body stream error:', err.message);
    res.status(400).json({ success: false, error: 'Upload stream error' });
  });
});

// JSON / URL-encoded support for non-image clients (e.g. a future web
// dashboard sending base64). These skip automatically for content types
// they don't recognize, so they don't conflict with the raw-body reader
// above -- by the time a request reaches here, an image/jpeg request has
// already had its body fully consumed and req._rawBodyHandled is true.
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
      diagnose_raw: 'POST /api/diagnose (raw JPEG binary - ESP32-CAM)',
      diagnose_base64: 'POST /api/diagnose (JSON with "image" field as base64)',
      history: 'GET /api/history',
      history_limit: 'GET /api/history?limit=10'
    }
  });
});

// API Routes -- no multer here; the raw-body middleware above already
// populates req.file/req.rawBody for the ESP32's raw JPEG uploads, and
// the controller's base64/JSON fallback path covers other clients.
app.use('/api/diagnose', diagnoseRoutes);
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
