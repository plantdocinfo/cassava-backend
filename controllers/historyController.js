const databaseService = require('../services/databaseService');

exports.getHistory = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    let records = [];
    let total = 0;

    if (databaseService.isConnected()) {
      // Get from database
      const result = await databaseService.getHistory(limit, offset);
      records = result.records;
      total = result.total;
    } else {
      // Return sample data if no database
      records = [
        {
          id: '1',
          disease: 'Cassava Mosaic Disease',
          confidence: 0.94,
          healthy: false,
          timestamp: new Date().toISOString()
        },
        {
          id: '2',
          disease: 'Healthy',
          confidence: 0.98,
          healthy: true,
          timestamp: new Date(Date.now() - 3600000).toISOString()
        },
        {
          id: '3',
          disease: 'Cassava Brown Streak',
          confidence: 0.87,
          healthy: false,
          timestamp: new Date(Date.now() - 7200000).toISOString()
        }
      ];
      total = records.length;
    }

    res.status(200).json({
      success: true,
      total: total,
      limit: limit,
      offset: offset,
      records: records
    });

  } catch (error) {
    console.error('❌ History error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch history'
    });
  }
};

exports.getRecord = async (req, res) => {
  try {
    const { id } = req.params;

    let record = null;

    if (databaseService.isConnected()) {
      record = await databaseService.getRecord(id);
    } else {
      // Return sample data
      record = {
        id: id,
        disease: 'Cassava Mosaic Disease',
        confidence: 0.94,
        healthy: false,
        timestamp: new Date().toISOString()
      };
    }

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Record not found'
      });
    }

    res.status(200).json({
      success: true,
      record: record
    });

  } catch (error) {
    console.error('❌ Get record error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch record'
    });
  }
};

exports.deleteRecord = async (req, res) => {
  try {
    const { id } = req.params;

    if (!databaseService.isConnected()) {
      return res.status(503).json({
        success: false,
        error: 'Database not connected'
      });
    }

    const deleted = await databaseService.deleteRecord(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Record not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Record deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete record error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete record'
    });
  }
};