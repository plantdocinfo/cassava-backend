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

exports.detect = async (imageBuffer) => {
  if (!ROBOFLOW_API_KEY) {
    console.warn('⚠️ ROBOFLOW_API_KEY not set! Using mock data.');
    return getMockResult();
  }

  try {
    const url = `${ROBOFLOW_URL}/${ROBOFLOW_MODEL}?api_key=${ROBOFLOW_API_KEY}`;

    const response = await axios({
      method: 'POST',
      url: url,
      headers: {
        'Content-Type': 'application/octet-stream'
      },
      data: imageBuffer,
      timeout: 30000 // 30 seconds
    });

    // Parse Roboflow response
    const predictions = response.data?.predictions || [];

    if (predictions.length === 0) {
      return {
        disease: 'Unknown',
        confidence: 0,
        healthy: false,
        predictions: []
      };
    }

    // Get top prediction
    const top = predictions[0];
    const diseaseName = top.class || 'Unknown';
    const confidence = top.confidence || 0;

    // Check if healthy
    const healthy = diseaseName.toLowerCase().includes('healthy');

    // Map to readable disease name
    const mappedDisease = DISEASE_MAPPING[diseaseName] || diseaseName;

    return {
      disease: mappedDisease,
      confidence: confidence,
      healthy: healthy,
      predictions: predictions.map(p => ({
        class: p.class,
        confidence: p.confidence,
        bbox: p.bbox || null
      }))
    };

  } catch (error) {
    console.error('❌ Roboflow API error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    throw new Error(`Roboflow API error: ${error.message}`);
  }
};

// Mock data for testing without Roboflow API key
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