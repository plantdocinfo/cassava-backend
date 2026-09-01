const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const FOLDER_NAME = process.env.CLOUDINARY_FOLDER || 'cassava-diagnosis';

/**
 * Upload image to Cloudinary
 * @param {Buffer} imageBuffer - Image buffer
 * @param {string} originalName - Original filename
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result
 */
async function uploadImage(imageBuffer, originalName = 'leaf.jpg', options = {}) {
  try {
    // Generate unique filename
    const uniqueId = uuidv4();
    const timestamp = Date.now();
    const publicId = `${FOLDER_NAME}/${timestamp}-${uniqueId}`;
    
    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          folder: FOLDER_NAME,
          resource_type: 'image',
          format: 'jpg',
          quality: 'auto:good',
          fetch_format: 'auto',
          tags: ['cassava', 'diagnosis', new Date().toISOString().split('T')[0]],
          ...options
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      
      // Convert buffer to stream
      const { Readable } = require('stream');
      const readableStream = new Readable();
      readableStream.push(imageBuffer);
      readableStream.push(null);
      readableStream.pipe(uploadStream);
    });
    
    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
      createdAt: result.created_at,
      metadata: {
        originalName: originalName,
        uploadedAt: new Date().toISOString()
      }
    };
    
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Upload base64 image to Cloudinary
 * @param {string} base64Image - Base64 encoded image
 * @param {string} originalName - Original filename
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result
 */
async function uploadBase64Image(base64Image, originalName = 'leaf.jpg', options = {}) {
  try {
    // Remove data URL prefix if present
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    return await uploadImage(buffer, originalName, options);
  } catch (error) {
    console.error('Base64 upload error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} Delete result
 */
async function deleteImage(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return {
      success: result.result === 'ok',
      result: result
    };
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get image URL with transformations
 * @param {string} publicId - Cloudinary public ID
 * @param {Object} transformations - Cloudinary transformations
 * @returns {string} Image URL
 */
function getImageUrl(publicId, transformations = {}) {
  return cloudinary.url(publicId, {
    secure: true,
    ...transformations
  });
}

/**
 * Get thumbnail URL
 * @param {string} publicId - Cloudinary public ID
 * @param {number} width - Thumbnail width
 * @param {number} height - Thumbnail height
 * @returns {string} Thumbnail URL
 */
function getThumbnailUrl(publicId, width = 200, height = 200) {
  return cloudinary.url(publicId, {
    secure: true,
    width: width,
    height: height,
    crop: 'fill',
    gravity: 'auto',
    format: 'jpg',
    quality: 'auto'
  });
}

module.exports = {
  uploadImage,
  uploadBase64Image,
  deleteImage,
  getImageUrl,
  getThumbnailUrl,
  cloudinary
};