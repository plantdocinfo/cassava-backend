const axios = require('axios');
const FormData = require('form-data');

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
    console.log(`📤 Sending image to Roboflow (${(imageBuffer.length / 1024).toFixed(1)} KB)`);

    // ============================================================
    // FIX: Use multipart/form-data format (most reliable)
    // ============================================================
    const formData = new FormData();
    
    // Create a file-like object from the buffer
    const fileStream = require('stream').Readable.from(imageBuffer);
    formData.append('file', fileStream, {
      filename: 'image.jpg',
      contentType: 'image/jpeg'
    });

    const url = `${ROBOFLOW_URL}/${ROBOFLOW_MODEL}?api_key=${ROBOFLOW_API_KEY}`;
    console.log('📡 Roboflow URL:', url.replace(ROBOFLOW_API_KEY, '***'));

    // ============================================================
    // Use multipart/form-data with file upload
    // ============================================================
    const response = await axios({
      method: 'POST',
      url: url,
      headers: {
        ...formData.getHeaders()
      },
      data: formData,
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    console.log('✅ Roboflow request successful');

    // Handle response
    if (!response.data) {
      throw new Error('Empty response from Roboflow');
    }

    if (response.data.error) {
      throw new Error(`Roboflow API error: ${response.data.error}`);
    }

    if (!response.data.predictions || !Array.isArray(response.data.predictions)) {
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

    // Sort predictions by confidence
    const sortedPredictions = [...predictions].sort((a, b) => b.confidence - a.confidence);
    const top = sortedPredictions[0];

    const diseaseName = top.class || 'Unknown';
    const confidence = top.confidence || 0;
    const healthy = diseaseName.toLowerCase().includes('healthy');
    const mappedDisease = DISEASE_MAPPING[diseaseName] || diseaseName;

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
      rawResponse: {
        processing_time: response.data.time || null,
        image_size: response.data.image_size || null
      }
    };

  } catch (error) {
    console.error('❌ Roboflow API error:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 400) {
        const errorMsg = error.response.data?.message || '';
        if (errorMsg.includes('base64') || errorMsg.includes('Malformed') || errorMsg.includes('Invalid')) {
          throw new Error('Image format issue. Please ensure the image is a valid JPEG or PNG.');
        } else {
          throw new Error('Invalid image format. Please send a valid JPEG or PNG image.');
        }
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