class Diagnosis {
  constructor(data) {
    this.id = data.id || null;
    this.disease = data.disease || 'Unknown';
    this.confidence = data.confidence || 0;
    this.healthy = data.healthy || false;
    this.imageSize = data.image_size || 0;
    this.imageUrl = data.image_url || null;
    this.imagePublicId = data.image_public_id || null;
    this.predictions = data.predictions || [];
    this.timestamp = data.timestamp || new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      disease: this.disease,
      confidence: this.confidence,
      healthy: this.healthy,
      image_size: this.imageSize,
      image_url: this.imageUrl,
      image_public_id: this.imagePublicId,
      predictions: this.predictions,
      timestamp: this.timestamp
    };
  }

  static fromRow(row) {
    return new Diagnosis({
      id: row.id,
      disease: row.disease,
      confidence: row.confidence,
      healthy: row.healthy,
      image_size: row.image_size,
      image_url: row.image_url,
      image_public_id: row.image_public_id,
      predictions: row.predictions,
      timestamp: row.timestamp
    });
  }
}

module.exports = Diagnosis;