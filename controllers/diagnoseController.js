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
    // FIX: Handle multiple input formats for ESP32-CAM
    // ============================================================

    // 1. Multipart/form-data (standard)
    if (req.file) {
      imageBuffer = req.file.buffer;
      fileSize = req.file.size;
      originalName = req.file.originalname || 'leaf.jpg';
      console.log(`📷 Received multipart image: ${fileSize} bytes`);
    }
    // 2. Base64 JSON
    else if (req.body && req.body.image) {
      let base64Data = req.body.image;
      base64Data = base64Data.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
      fileSize = imageBuffer.length;
      originalName = req.body.filename || 'leaf.jpg';
      console.log(`📷 Received base64 image: ${fileSize} bytes`);
    }
    // 3. Raw binary (ESP32-CAM direct POST)
    else if (req.body && Buffer.isBuffer(req.body)) {
      imageBuffer = req.body;
      fileSize = req.body.length;
      console.log(`📷 Received raw binary image: ${fileSize} bytes`);
    }
    // 4. Raw body as string (fallback)
    else if (req.body && typeof req.body === 'string' && req.body.length > 100) {
      try {
        imageBuffer = Buffer.from(req.body, 'base64');
        fileSize = imageBuffer.length;
        console.log(`📷 Received base64 string image: ${fileSize} bytes`);
      } catch (e) {
        console.log('Failed to parse as base64, trying as raw text');
        return res.status(400).json({
          success: false,
          error: 'Invalid image format. Please send JPEG or base64.'
        });
      }
    }
    else {
      console.log('❌ No image found in request');
      return res.status(400).json({
        success: false,
        error: 'No image provided. Send as multipart/form-data, base64 JSON, or raw binary.',
        received: {
          hasFile: !!req.file,
          hasBodyImage: !!(req.body && req.body.image),
          bodyType: typeof req.body,
          bodyLength: req.body ? req.body.length : 0
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