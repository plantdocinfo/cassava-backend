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

    // Handle different input formats
    if (req.file) {
      // Multer file upload
      imageBuffer = req.file.buffer;
      fileSize = req.file.size;
      originalName = req.file.originalname || 'leaf.jpg';
    } else if (req.body.image) {
      // Base64 image
      const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
      fileSize = imageBuffer.length;
    } else if (req.body && Buffer.isBuffer(req.body)) {
      // Raw binary
      imageBuffer = req.body;
      fileSize = req.body.length;
    } else {
      return res.status(400).json({
        success: false,
        error: 'No image provided. Send as binary JPEG or base64.'
      });
    }

    // Validate image
    const validation = validateImage(imageBuffer);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    console.log(`📷 Processing image: ${fileSize} bytes`);

    // ========== STEP 1: Upload to Cloudinary ==========
    console.log('☁️ Uploading to Cloudinary...');
    
    // Optimize image before upload
    const optimizedBuffer = await optimizeImage(imageBuffer, {
      maxWidth: 1200,
      maxHeight: 1200,
      quality: 80,
      format: 'jpeg'
    });
    
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
      // Continue with diagnosis even if Cloudinary fails
    } else {
      console.log(`✅ Cloudinary upload success: ${cloudinaryResult.url}`);
    }

    // ========== STEP 2: Send to Roboflow ==========
    console.log('🤖 Sending to Roboflow...');
    const roboflowResult = await roboflowService.detect(imageBuffer);
    console.log('✅ Roboflow response received');

    // ========== STEP 3: Prepare response ==========
    const response = {
      success: true,
      disease: roboflowResult.disease,
      confidence: roboflowResult.confidence,
      healthy: roboflowResult.healthy,
      predictions: roboflowResult.predictions,
      timestamp: new Date().toISOString()
    };

    // Add Cloudinary info if available
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

    // ========== STEP 4: Save to database ==========
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
      error: error.message || 'Failed to diagnose image'
    });
  }
};