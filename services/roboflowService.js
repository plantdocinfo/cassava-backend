const axios = require('axios');

// Configuration
const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;
const ROBOFLOW_MODEL = process.env.ROBOFLOW_MODEL || 'cassava-disease/1';
const ROBOFLOW_URL = process.env.ROBOFLOW_URL || 'https://detect.roboflow.com';

// Disease mapping for better readability
const DISEASE_MAPPING = {
  'cassava_mosaic_disease': 'Cassava Mosaic Disease',
  'cassava_brown_streak': 'Cassava Brown Streak',
  'cassava_green_mottle': 'Cassava Green Mottle',
  'cassava_bacterial_blight': 'Cassava Bacterial Blight',
  'healthy': 'Healthy',
  'CMD': 'Cassava Mosaic Disease',
  'CBSD': 'Cassava Brown Streak Disease',
  'CGM': 'Cassava Green Mottle',
  'CBB': 'Cassava Bacterial Blight'
};

/**
 * Detect disease from image buffer
 * @param {Buffer} imageBuffer - Image buffer (JPEG or PNG)
 * @returns {Promise<Object>} Detection results
 */
exports.detect = async (imageBuffer) => {
  if (!ROBOFLOW_API_KEY) {
    console.warn('⚠️ ROBOFLOW_API_KEY not set! Using mock data.');
    return getMockResult();
  }

  try {
    // ============================================================
    // FIX 1: Convert to base64 WITHOUT data URL prefix
    // ============================================================
    const base64Image = imageBuffer.toString('base64');

    // ============================================================
    // FIX 2: Use JSON format (most reliable for Roboflow)
    // ============================================================
    const url = `${ROBOFLOW_URL}/${ROBOFLOW_MODEL}?api_key=${ROBOFLOW_API_KEY}`;

    const response = await axios({
      method: 'POST',
      url: url,
      headers: {
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({
        image: base64Image  // Clean base64 - NO data:image/... prefix!
      }),
      timeout: 30000
    });

    // ============================================================
    // FIX 3: Handle response with better error checking
    // ============================================================
    if (!response.data) {
      throw new Error('Empty response from Roboflow');
    }

    // Check if response has error
    if (response.data.error) {
      throw new Error(`Roboflow API error: ${response.data.error}`);
    }

    // Check if response has predictions
    if (!response.data.predictions || !Array.isArray(response.data.predictions)) {
      // If no predictions, return empty result
      return {
        disease: 'Unknown',
        confidence: 0,
        healthy: false,
        predictions: [],
        rawResponse: response.data
      };
    }

    const predictions = response.data.predictions || [];

    if (predictions.length === 0) {
      return {
        disease: 'Unknown',
        confidence: 0,
        healthy: false,
        predictions: []
      };
    }

    // ============================================================
    // FIX 4: Better prediction sorting and selection
    // ============================================================
    // Sort predictions by confidence (highest first)
    const sortedPredictions = [...predictions].sort((a, b) => b.confidence - a.confidence);
    const top = sortedPredictions[0];

    const diseaseName = top.class || 'Unknown';
    const confidence = top.confidence || 0;

    // Check if healthy (case insensitive)
    const healthy = diseaseName.toLowerCase().includes('healthy');

    // Map to readable disease name
    const mappedDisease = DISEASE_MAPPING[diseaseName] || diseaseName;

    // ============================================================
    // FIX 5: Additional validation and logging
    // ============================================================
    console.log(`🤖 Roboflow result: ${mappedDisease} (${(confidence * 100).toFixed(1)}%)`);

    return {
      disease: mappedDisease,
      confidence: confidence,
      healthy: healthy,
      predictions: sortedPredictions.map(p => ({
        class: p.class,
        confidence: p.confidence,
        bbox: p.bbox || null
      })),
      // Include raw response for debugging (optional)
      rawResponse: {
        processing_time: response.data.time || null,
        image_size: response.data.image_size || null
      }
    };

  } catch (error) {
    console.error('❌ Roboflow API error:', error.message);
    
    // ============================================================
    // FIX 6: Better error handling with specific error types
    // ============================================================
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      
      // Provide user-friendly error messages
      if (error.response.status === 400) {
        throw new Error('Invalid image format. Please send a valid JPEG or PNG image.');
      } else if (error.response.status === 401) {
        throw new Error('Invalid Roboflow API key. Please check your credentials.');
      } else if (error.response.status === 429) {
        throw new Error('Roboflow API rate limit exceeded. Please try again later.');
      } else if (error.response.status === 500) {
        throw new Error('Roboflow server error. Please try again later.');
      }
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Roboflow API timeout. Please try again.');
    }
    
    throw new Error(`Roboflow API error: ${error.message}`);
  }
};

// ============================================================
// FIX 7: More realistic mock data for testing
// ============================================================
function getMockResult() {
  const diseases = [
    { disease: 'Cassava Mosaic Disease', confidence: 0.94, healthy: false },
    { disease: 'Cassava Brown Streak Disease', confidence: 0.87, healthy: false },
    { disease: 'Healthy', confidence: 0.98, healthy: true },
    { disease: 'Cassava Bacterial Blight', confidence: 0.76, healthy: false }
  ];

  const result = diseases[Math.floor(Math.random() * diseases.length)];

  return {
    disease: result.disease,
    confidence: result.confidence,
    healthy: result.healthy,
    predictions: [
      {
        class: result.disease,
        confidence: result.confidence,
        bbox: { x: 0.5, y: 0.5, width: 0.3, height: 0.3 }
      }
    ]
  };
}