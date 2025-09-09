const express = require('express');
const cors = require('cors');
const GPSDatabase = require('./database');
require('dotenv').config();

class GPSTrackerAPI {
  constructor() {
    this.app = express();
    this.port = process.env.HTTP_PORT || 3000;
    this.host = process.env.HTTP_HOST || '0.0.0.0';
    this.db = new GPSDatabase();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Enable CORS for all routes
    this.app.use(cors());
    
    // Parse JSON bodies
    this.app.use(express.json());
    
    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging middleware
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
      });
    });

    // Get latest locations for all devices
    this.app.get('/locations', async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 100;
        const locations = this.db.getLatestLocations(limit);
        
        res.json({
          success: true,
          count: locations.length,
          data: locations.map(this.formatLocationData)
        });
      } catch (error) {
        console.error('Error fetching latest locations:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch locations',
          message: error.message
        });
      }
    });

    // Get location history for a specific device
    this.app.get('/devices/:deviceId/history', async (req, res) => {
      try {
        const { deviceId } = req.params;
        const limit = parseInt(req.query.limit) || 100;
        const history = this.db.getDeviceHistory(deviceId, limit);
        
        res.json({
          success: true,
          device_id: deviceId,
          count: history.length,
          data: history.map(this.formatLocationData)
        });
      } catch (error) {
        console.error('Error fetching device history:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch device history',
          message: error.message
        });
      }
    });

    // Get latest location for a specific device
    this.app.get('/devices/:deviceId/latest', async (req, res) => {
      try {
        const { deviceId } = req.params;
        const history = this.db.getDeviceHistory(deviceId, 1);
        
        if (history.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Device not found or no location data available',
            device_id: deviceId
          });
        }
        
        res.json({
          success: true,
          device_id: deviceId,
          data: this.formatLocationData(history[0])
        });
      } catch (error) {
        console.error('Error fetching latest device location:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch latest location',
          message: error.message
        });
      }
    });

    // Get all active devices
    this.app.get('/devices', async (req, res) => {
      try {
        const devices = this.db.getActiveDevices();
        
        res.json({
          success: true,
          count: devices.length,
          data: devices.map(device => ({
            device_id: device.device_id,
            name: device.name,
            is_active: Boolean(device.is_active),
            last_seen: device.last_seen,
            last_location_time: device.last_location_time,
            total_logs: device.total_logs,
            created_at: device.created_at
          }))
        });
      } catch (error) {
        console.error('Error fetching devices:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch devices',
          message: error.message
        });
      }
    });

    // Get locations within a geographic bounding box
    this.app.get('/locations/bounds', async (req, res) => {
      try {
        const { north, south, east, west, limit = 100 } = req.query;
        
        if (!north || !south || !east || !west) {
          return res.status(400).json({
            success: false,
            error: 'Missing required parameters: north, south, east, west'
          });
        }

        // This would require a custom query - simplified version
        const allLocations = this.db.getLatestLocations(parseInt(limit));
        const filteredLocations = allLocations.filter(location => {
          return location.lat >= parseFloat(south) &&
                 location.lat <= parseFloat(north) &&
                 location.lon >= parseFloat(west) &&
                 location.lon <= parseFloat(east);
        });
        
        res.json({
          success: true,
          bounds: { north, south, east, west },
          count: filteredLocations.length,
          data: filteredLocations.map(this.formatLocationData)
        });
      } catch (error) {
        console.error('Error fetching locations by bounds:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch locations by bounds',
          message: error.message
        });
      }
    });

    // Simple web interface for viewing locations
    this.app.get('/', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>ST-900 GPS Tracker Server</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #333; text-align: center; }
            .endpoint { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #007bff; }
            .method { font-weight: bold; color: #007bff; }
            .url { font-family: monospace; background: #e9ecef; padding: 2px 6px; border-radius: 3px; }
            .description { margin-top: 5px; color: #666; }
            .status { text-align: center; padding: 20px; background: #d4edda; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🛰️ ST-900 GPS Tracker Server</h1>
            
            <div class="status">
              <strong>✅ API Server is running!</strong><br>
              Server started at: ${new Date().toISOString()}
            </div>
            
            <h2>📡 Available API Endpoints</h2>
            
            <div class="endpoint">
              <div><span class="method">GET</span> <span class="url">/health</span></div>
              <div class="description">Check server health and status</div>
            </div>
            
            <div class="endpoint">
              <div><span class="method">GET</span> <span class="url">/locations</span></div>
              <div class="description">Get latest locations for all devices (supports ?limit=N)</div>
            </div>
            
            <div class="endpoint">
              <div><span class="method">GET</span> <span class="url">/devices</span></div>
              <div class="description">Get list of all active devices</div>
            </div>
            
            <div class="endpoint">
              <div><span class="method">GET</span> <span class="url">/devices/{deviceId}/latest</span></div>
              <div class="description">Get latest location for a specific device</div>
            </div>
            
            <div class="endpoint">
              <div><span class="method">GET</span> <span class="url">/devices/{deviceId}/history</span></div>
              <div class="description">Get location history for a specific device (supports ?limit=N)</div>
            </div>
            
            <div class="endpoint">
              <div><span class="method">GET</span> <span class="url">/locations/bounds</span></div>
              <div class="description">Get locations within geographic bounds (?north=&south=&east=&west=)</div>
            </div>
            
            <h2>🔧 Configuration</h2>
            <p><strong>TCP Server:</strong> Listening for GPS trackers on port ${process.env.TCP_PORT || 8090}</p>
            <p><strong>HTTP API:</strong> Running on port ${this.port}</p>
            
            <h2>📱 Device Setup</h2>
            <p>Configure your ST-900 device with SMS command:</p>
            <code style="background: #f8f9fa; padding: 10px; display: block; border-radius: 5px;">8040000 YOUR_SERVER_IP ${process.env.TCP_PORT || 8090}</code>
          </div>
        </body>
        </html>
      `);
    });
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
      });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error('Unhandled error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    });
  }

  formatLocationData(location) {
    return {
      id: location.id,
      device_id: location.device_id,
      device_name: location.device_name || null,
      latitude: location.lat,
      longitude: location.lon,
      speed: location.speed,
      altitude: location.altitude,
      heading: location.heading,
      timestamp: location.timestamp,
      created_at: location.created_at,
      // Add computed fields
      coordinates: [location.lon, location.lat], // GeoJSON format [lng, lat]
      location_age_minutes: Math.round((new Date() - new Date(location.timestamp)) / (1000 * 60))
    };
  }

  start() {
    this.server = this.app.listen(this.port, this.host, () => {
      console.log(`🌐 GPS Tracker HTTP API listening on http://${this.host}:${this.port}`);
      console.log(`📊 Database initialized and ready`);
      console.log(`⏰ API server started at ${new Date().toISOString()}`);
      console.log(`🔗 Open http://localhost:${this.port} in your browser`);
    });

    this.server.on('error', (error) => {
      console.error('❌ API Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${this.port} is already in use. Please choose a different port.`);
      }
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down GPS Tracker API...');
      this.shutdown();
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Received SIGTERM, shutting down GPS Tracker API...');
      this.shutdown();
    });
  }

  shutdown() {
    if (this.server) {
      this.server.close(() => {
        console.log('✅ HTTP API Server closed');
      });
    }

    if (this.db) {
      this.db.close();
      console.log('✅ Database connection closed');
    }

    console.log('👋 GPS Tracker API shutdown complete');
    process.exit(0);
  }
}

// Start API server if this file is run directly
if (require.main === module) {
  const api = new GPSTrackerAPI();
  api.start();
}

module.exports = GPSTrackerAPI;