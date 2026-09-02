const roboflowService = require('../services/roboflowService');
const databaseService = require('../services/databaseService');
const cloudinaryService = require('../services/cloudinaryService');
const { optimizeImage, validateImage } = require('../utils/imageUtils');
const { v4: uuidv4 } = require('uuid');

exports.diagnoseLeaf = async (req, res) => {
  try {
    let imageBuffer;
    let fileSize;
    let originalName = 'leaf.jpg';

    // ============================================================
    // DEBUG: Log everything to see what's coming in
    // ============================================================
    console.log('📥 ===== REQUEST DEBUG =====');
    console.log('  Content-Type:', req.headers['content-type']);
    console.log('  Content-Length:', req.headers['content-length']);
    console.log('  Has file:', !!req.file);
    console.log('  Has rawBody:', !!req.rawBody);
    console.log('  Body type:', typeof req.body);
    console.log('  Body length:', req.body ? (Buffer.isBuffer(req.body) ? req.body.length : req.body.length || 0) : 0);
    console.log('  Body keys:', req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? Object.keys(req.body) : 'N/A');
    console.log('===============================');

    // ============================================================
    // Handle ALL input formats (in order of priority)
    // ============================================================

    // 1. Multipart/form-data (standard upload)
    if (req.file) {
      imageBuffer = req.file.buffer;
      fileSize = req.file.size;
      originalName = req.file.originalname || 'leaf.jpg';
      console.log(`📷 [1] Received multipart image: ${fileSize} bytes`);
    }
    // 2. Raw binary (ESP32-CAM direct POST) - from our middleware
    else if (req.rawBody && req.rawBody.length > 100) {
      imageBuffer = req.rawBody;
      fileSize = req.rawBody.length;
      console.log(`📷 [2] Received raw binary image: ${fileSize} bytes`);
      
      // Validate JPEG header
      if (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) {
        console.log('✅ Valid JPEG header detected');
      } else {
        console.log('⚠️ Unknown image format (not JPEG)');
        console.log('  First bytes:', imageBuffer.slice(0, 20).toString('hex'));
      }
    }
    // 3. Base64 JSON
    else if (req.body && typeof req.body === 'object' && req.body.image) {
      let base64Data = req.body.image;
      if (typeof base64Data === 'string') {
        base64Data = base64Data.replace(/^data:image\/\w+;base64,/, '');
        imageBuffer = Buffer.from(base64Data, 'base64');
        fileSize = imageBuffer.length;
        originalName = req.body.filename || 'leaf.jpg';
        console.log(`📷 [3] Received base64 image: ${fileSize} bytes`);
      }
    }
    // 4. Body as buffer (already parsed)
    else if (req.body && Buffer.isBuffer(req.body)) {
      imageBuffer = req.body;
      fileSize = req.body.length;
      console.log(`📷 [4] Received buffer image: ${fileSize} bytes`);
    }
    // 5. Body as string (fallback)
    else if (req.body && typeof req.body === 'string' && req.body.length > 100) {
      try {
        // Try parsing as base64
        imageBuffer = Buffer.from(req.body, 'base64');
        fileSize = imageBuffer.length;
        console.log(`📷 [5a] Received base64 string image: ${fileSize} bytes`);
      } catch (e) {
        // Try parsing as JSON
        try {
          const json = JSON.parse(req.body);
          if (json.image) {
            let base64Data = json.image.replace(/^data:image\/\w+;base64,/, '');
            imageBuffer = Buffer.from(base64Data, 'base64');
            fileSize = imageBuffer.length;
            console.log(`📷 [5b] Received JSON base64 image: ${fileSize} bytes`);
          }
        } catch (e2) {
          console.log('Failed to parse as base64 or JSON');
          return res.status(400).json({
            success: false,
            error: 'Invalid image format. Please send JPEG or base64.'
          });
        }
      }
    }
    else {
      console.log('❌ No image found in request');
      return res.status(400).json({
        success: false,
        error: 'No image provided. Send as multipart/form-data, base64 JSON, or raw binary.',
        debug: {
          hasFile: !!req.file,
          hasRawBody: !!req.rawBody,
          hasBodyImage: !!(req.body && req.body.image),
          bodyType: typeof req.body,
          bodyLength: req.body ? (Buffer.isBuffer(req.body) ? req.body.length : req.body.length || 0) : 0,
          contentType: req.headers['content-type']
        }
      });
    }

    // Validate image
    if (!imageBuffer || imageBuffer.length < 100) {
      return res.status(400).json({
        success: false,
        error: 'Image is too small or empty. Received: ' + (imageBuffer ? imageBuffer.length : 0) + ' bytes'
      });
    }

    const validation = validateImage(imageBuffer);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    console.log(`📷 Processing image: ${fileSize} bytes`);

    // ========== STEP 1: Optimize Image ==========
    console.log('🖼️ Optimizing image...');
    const optimizedBuffer = await optimizeImage(imageBuffer, {
      maxWidth: 1200,
      maxHeight: 1200,
      quality: 80,
      format: 'jpeg'
    });

    // ========== STEP 2: Upload to Cloudinary ==========
    console.log('☁️ Uploading to Cloudinary...');
    const cloudinaryResult = await cloudinaryService.uploadImage(
      optimizedBuffer,
      originalName,
      {
        tags: ['cassava-diagnosis', 'field-test'],
        context: {
          alt: 'Cassava leaf disease diagnosis',
          caption: `Diagnosis at ${new Date().toISOString()}`
        }
      }
    );

    if (!cloudinaryResult.success) {
      console.error('Cloudinary upload failed:', cloudinaryResult.error);
    } else {
      console.log(`✅ Cloudinary upload success: ${cloudinaryResult.url}`);
    }

    // ========== STEP 3: Send to Roboflow ==========
    console.log('🤖 Sending to Roboflow...');
    const roboflowResult = await roboflowService.detect(optimizedBuffer);
    console.log('✅ Roboflow response received');

    // ========== STEP 4: Prepare response ==========
    const response = {
      success: true,
      disease: roboflowResult.disease,
      confidence: roboflowResult.confidence,
      healthy: roboflowResult.healthy,
      predictions: roboflowResult.predictions,
      timestamp: new Date().toISOString()
    };

    if (cloudinaryResult.success) {
      response.image = {
        url: cloudinaryResult.url,
        thumbnail: cloudinaryService.getThumbnailUrl(cloudinaryResult.publicId),
        publicId: cloudinaryResult.publicId,
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
        format: cloudinaryResult.format,
        size: cloudinaryResult.bytes
      };
    }

    // ========== STEP 5: Save to database ==========
    try {
      if (databaseService.isConnected()) {
        const record = {
          id: uuidv4(),
          disease: roboflowResult.disease,
          confidence: roboflowResult.confidence,
          healthy: roboflowResult.healthy,
          image_size: fileSize,
          image_url: cloudinaryResult.success ? cloudinaryResult.url : null,
          image_public_id: cloudinaryResult.success ? cloudinaryResult.publicId : null,
          predictions: roboflowResult.predictions,
          timestamp: new Date().toISOString()
        };
        await databaseService.saveDiagnosis(record);
        response.record_id = record.id;
        console.log('💾 Diagnosis saved to database');
      }
    } catch (dbError) {
      console.warn('⚠️ Database save failed:', dbError.message);
    }

    res.status(200).json(response);

  } catch (error) {
    console.error('❌ Diagnosis error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to diagnose image',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};