const sharp = require('sharp');

/**
 * Optimize image for upload
 * @param {Buffer} imageBuffer - Raw image buffer
 * @param {Object} options - Optimization options
 * @returns {Promise<Buffer>} Optimized buffer
 */
async function optimizeImage(imageBuffer, options = {}) {
  const {
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 80,
    format = 'jpeg'
  } = options;

  try {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    
    // Calculate resize dimensions
    let width = metadata.width;
    let height = metadata.height;
    
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    
    // Apply transformations
    let processedImage = image
      .resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .rotate(); // Auto-rotate based on EXIF
    
    // Convert format
    if (format === 'jpeg' || format === 'jpg') {
      processedImage = processedImage.jpeg({
        quality: quality,
        progressive: true,
        mozjpeg: true
      });
    } else if (format === 'png') {
      processedImage = processedImage.png({
        compressionLevel: 9,
        quality: quality
      });
    } else if (format === 'webp') {
      processedImage = processedImage.webp({
        quality: quality
      });
    }
    
    return await processedImage.toBuffer();
    
  } catch (error) {
    console.error('Image optimization error:', error);
    return imageBuffer; // Return original on error
  }
}

/**
 * Validate image
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Object} Validation result
 */
function validateImage(imageBuffer) {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const minSize = 100; // 100 bytes
  
  if (!imageBuffer || imageBuffer.length < minSize) {
    return {
      valid: false,
      error: 'Image is too small or empty'
    };
  }
  
  if (imageBuffer.length > maxSize) {
    return {
      valid: false,
      error: `Image size exceeds ${maxSize / 1024 / 1024}MB limit`
    };
  }
  
  // Check for JPEG/PNG signature
  const isJPEG = imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8;
  const isPNG = imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && 
                imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47;
  
  if (!isJPEG && !isPNG) {
    return {
      valid: false,
      error: 'Invalid image format. Only JPEG and PNG are supported'
    };
  }
  
  return {
    valid: true
  };
}

module.exports = {
  optimizeImage,
  validateImage
};