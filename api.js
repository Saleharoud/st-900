const express = require('express');
const cors = require('cors');
const GPSDatabase = require('./database');
const SMSService = require('./sms-service');
require('dotenv').config();

class GPSTrackerAPI {
  constructor() {
    this.app = express();
    this.port = process.env.HTTP_PORT || 3000;
    this.host = process.env.HTTP_HOST || '0.0.0.0';
    this.db = new GPSDatabase();
    this.smsService = new SMSService();
    
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

    // SMS Command Management Endpoints
    
    // Send SMS command to device
    this.app.post('/devices/:deviceId/commands', async (req, res) => {
      try {
        const { deviceId } = req.params;
        const { commandType, parameters = {} } = req.body;

        if (!commandType) {
          return res.status(400).json({
            success: false,
            error: 'Command type is required'
          });
        }

        const result = await this.smsService.sendCommand(deviceId, commandType, parameters);
        
        res.json({
          success: true,
          message: 'Command sent successfully',
          data: result
        });
      } catch (error) {
        console.error('Error sending command:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to send command',
          message: error.message
        });
      }
    });

    // Get available commands
    this.app.get('/devices/commands/available', (req, res) => {
      try {
        const commands = this.smsService.getAvailableCommands();
        res.json({
          success: true,
          data: commands
        });
      } catch (error) {
        console.error('Error getting available commands:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get available commands',
          message: error.message
        });
      }
    });

    // Get command history for device
    this.app.get('/devices/:deviceId/commands', async (req, res) => {
      try {
        const { deviceId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        
        const commands = await this.smsService.getCommandHistory(deviceId, limit);
        
        res.json({
          success: true,
          device_id: deviceId,
          count: commands.length,
          data: commands
        });
      } catch (error) {
        console.error('Error getting command history:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get command history',
          message: error.message
        });
      }
    });

    // Update device phone number
    this.app.put('/devices/:deviceId/phone', async (req, res) => {
      try {
        const { deviceId } = req.params;
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
          return res.status(400).json({
            success: false,
            error: 'Phone number is required'
          });
        }

        await this.smsService.updateDevicePhone(deviceId, phoneNumber);
        
        res.json({
          success: true,
          message: 'Device phone number updated successfully',
          device_id: deviceId,
          phone_number: phoneNumber
        });
      } catch (error) {
        console.error('Error updating device phone:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update device phone number',
          message: error.message
        });
      }
    });

    // Get pending commands
    this.app.get('/commands/pending', async (req, res) => {
      try {
        const deviceId = req.query.deviceId;
        const commands = await this.smsService.getPendingCommands(deviceId);
        
        res.json({
          success: true,
          count: commands.length,
          data: commands
        });
      } catch (error) {
        console.error('Error getting pending commands:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get pending commands',
          message: error.message
        });
      }
    });

    // Webhook for incoming SMS responses
    this.app.post('/webhook/sms', async (req, res) => {
      try {
        const { From, Body } = req.body;
        
        if (!From || !Body) {
          return res.status(400).json({
            success: false,
            error: 'Missing SMS data'
          });
        }

        const result = await this.smsService.processIncomingSMS(From, Body);
        
        res.json({
          success: true,
          message: 'SMS processed successfully',
          data: result
        });
      } catch (error) {
        console.error('Error processing SMS webhook:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to process SMS',
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
            
            <h2>📱 SMS Command Management</h2>
            
            <div class="endpoint">
              <div><span class="method">POST</span> <span class="url">/devices/{deviceId}/commands</span></div>
              <div class="description">Send SMS command to device (requires Twilio setup)</div>
            </div>
            
            <div class="endpoint">
              <div><span class="method">GET</span> <span class="url">/devices/commands/available</span></div>
              <div class="description">Get list of available SMS commands</div>
            </div>
            
            <div class="endpoint">
              <div><span class="method">GET</span> <span class="url">/devices/{deviceId}/commands</span></div>
              <div class="description">Get command history for device</div>
            </div>
            
            <div class="endpoint">
              <div><span class="method">PUT</span> <span class="url">/devices/{deviceId}/phone</span></div>
              <div class="description">Update device phone number for SMS commands</div>
            </div>
            
            <div class="endpoint">
              <div><span class="method">GET</span> <span class="url">/commands/pending</span></div>
              <div class="description">Get pending commands waiting for device response</div>
            </div>
            
            <div class="endpoint">
              <div><span class="method">POST</span> <span class="url">/webhook/sms</span></div>
              <div class="description">Webhook for Twilio SMS responses</div>
            </div>
            
            <h2>🔧 Configuration</h2>
            <p><strong>TCP Server:</strong> Listening for GPS trackers on port ${process.env.TCP_PORT || 8090}</p>
            <p><strong>HTTP API:</strong> Running on port ${this.port}</p>
            <p><strong>SMS Service:</strong> ${this.smsService.client ? '✅ Enabled (Twilio)' : '❌ Disabled (Configure Twilio)'}</p>
            
            <h2>📱 Device Setup</h2>
            <p>Configure your ST-900 device with SMS command:</p>
            <code style="background: #f8f9fa; padding: 10px; display: block; border-radius: 5px;">8040000 YOUR_SERVER_IP ${process.env.TCP_PORT || 8090}</code>
            
            <h2>📲 SMS Commands Setup</h2>
            <p>To enable SMS commands, configure these environment variables:</p>
            <code style="background: #f8f9fa; padding: 10px; display: block; border-radius: 5px; margin: 10px 0;">
TWILIO_ACCOUNT_SID=your_account_sid<br>
TWILIO_AUTH_TOKEN=your_auth_token<br>
TWILIO_PHONE_NUMBER=+1234567890
            </code>
            
            <h3>Available SMS Commands:</h3>
            <ul style="background: #f8f9fa; padding: 15px; border-radius: 5px;">
              <li><strong>Set Server:</strong> 8040000 IP PORT</li>
              <li><strong>Set Interval:</strong> 8090000 SECONDS</li>
              <li><strong>Get Status:</strong> 8030000</li>
              <li><strong>Reset Device:</strong> 8050000</li>
              <li><strong>Enable GPS:</strong> 8060000 1</li>
              <li><strong>Disable GPS:</strong> 8060000 0</li>
            </ul>
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
    // Convert timestamps to Syria timezone (UTC+3) for display
    const formatSyriaTime = (utcTime) => {
      if (!utcTime) return null;
      const date = new Date(utcTime);
      const syriaTime = new Date(date.getTime() + (3 * 60 * 60 * 1000));
      return syriaTime.toISOString().replace('Z', '+03:00');
    };

    return {
      id: location.id,
      device_id: location.device_id,
      device_name: location.device_name || null,
      latitude: location.lat,
      longitude: location.lon,
      speed: location.speed,
      altitude: location.altitude,
      heading: location.heading,
      timestamp: formatSyriaTime(location.timestamp),
      timestamp_syria: formatSyriaTime(location.timestamp),
      created_at: formatSyriaTime(location.created_at),
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