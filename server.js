const net = require('net');
const GPSDatabase = require('./database');
const ST900Parser = require('./parser');
require('dotenv').config();

class GPSTrackerServer {
  constructor() {
    this.port = process.env.TCP_PORT || 8090;
    this.host = process.env.TCP_HOST || '0.0.0.0';
    this.db = new GPSDatabase();
    this.parser = new ST900Parser();
    this.clients = new Map(); // Track connected clients
    this.server = null;
  }

  start() {
    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    this.server.listen(this.port, this.host, () => {
      console.log(`🚀 GPS Tracker TCP Server listening on ${this.host}:${this.port}`);
      console.log(`📊 Database initialized and ready`);
      console.log(`⏰ Server started at ${new Date().toISOString()}`);
    });

    this.server.on('error', (error) => {
      console.error('❌ Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${this.port} is already in use. Please choose a different port.`);
      }
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down GPS Tracker Server...');
      this.shutdown();
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Received SIGTERM, shutting down GPS Tracker Server...');
      this.shutdown();
    });
  }

  handleConnection(socket) {
    const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
    const connectionTime = new Date().toISOString();
    
    console.log(`📱 New tracker connected: ${clientId} at ${connectionTime}`);
    
    // Store client info
    this.clients.set(clientId, {
      socket: socket,
      connectedAt: connectionTime,
      lastActivity: connectionTime,
      deviceId: null,
      packetsReceived: 0
    });

    // Set socket timeout (30 minutes of inactivity)
    socket.setTimeout(30 * 60 * 1000);

    socket.on('data', (data) => {
      this.handleData(socket, clientId, data);
    });

    socket.on('timeout', () => {
      console.log(`⏰ Client ${clientId} timed out due to inactivity`);
      socket.end();
    });

    socket.on('end', () => {
      console.log(`📱 Tracker disconnected: ${clientId}`);
      this.clients.delete(clientId);
    });

    socket.on('error', (error) => {
      console.error(`❌ Socket error for ${clientId}:`, error.message);
      this.clients.delete(clientId);
    });

    // Send acknowledgment to device (some trackers expect this)
    socket.write('OK\n');
  }

  handleData(socket, clientId, data) {
    try {
      const rawData = data.toString().trim();
      const client = this.clients.get(clientId);
      
      if (!client) return;

      // Update client activity
      client.lastActivity = new Date().toISOString();
      client.packetsReceived++;

      console.log(`📦 Raw data from ${clientId}: ${rawData}`);

      // Handle different packet types
      if (this.parser.isHeartbeat(rawData)) {
        this.handleHeartbeat(socket, clientId, rawData);
        return;
      }

      if (this.parser.isLogin(rawData)) {
        this.handleLogin(socket, clientId, rawData);
        return;
      }

      // Parse GPS data
      const parsedData = this.parser.parse(rawData);
      
      if (parsedData) {
        this.handleGPSData(socket, clientId, parsedData);
      } else {
        console.warn(`⚠️  Unable to parse data from ${clientId}: ${rawData}`);
        // Still send acknowledgment to keep connection alive
        socket.write('ERROR\n');
      }

    } catch (error) {
      console.error(`❌ Error handling data from ${clientId}:`, error);
      socket.write('ERROR\n');
    }
  }

  handleHeartbeat(socket, clientId, rawData) {
    console.log(`💓 Heartbeat from ${clientId}`);
    socket.write('OK\n');
  }

  handleLogin(socket, clientId, rawData) {
    console.log(`🔐 Login packet from ${clientId}: ${rawData}`);
    
    // Extract device ID from login packet if possible
    const deviceIdMatch = rawData.match(/\d{10,}/); // Look for IMEI-like number
    if (deviceIdMatch) {
      const client = this.clients.get(clientId);
      if (client) {
        client.deviceId = deviceIdMatch[0];
        console.log(`📱 Device ID identified: ${client.deviceId} for ${clientId}`);
      }
    }
    
    socket.write('LOAD\n'); // Common response for login
  }

  handleGPSData(socket, clientId, parsedData) {
    try {
      console.log(`📍 GPS data from ${clientId}:`, {
        device_id: parsedData.device_id,
        lat: parsedData.lat,
        lon: parsedData.lon,
        speed: parsedData.speed,
        timestamp: parsedData.timestamp
      });

      // Update client device ID if not set
      const client = this.clients.get(clientId);
      if (client && !client.deviceId && parsedData.device_id) {
        client.deviceId = parsedData.device_id;
      }

      // Save to database
      const result = this.db.insertGpsLog(parsedData);
      
      if (result) {
        console.log(`✅ GPS data saved to database (ID: ${result.lastInsertRowid})`);
        socket.write('OK\n');
      } else {
        console.error('❌ Failed to save GPS data to database');
        socket.write('ERROR\n');
      }

    } catch (error) {
      console.error(`❌ Error saving GPS data from ${clientId}:`, error);
      socket.write('ERROR\n');
    }
  }

  getServerStats() {
    const connectedClients = this.clients.size;
    const clientsWithDeviceId = Array.from(this.clients.values())
      .filter(client => client.deviceId).length;
    
    return {
      connectedClients,
      clientsWithDeviceId,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      clients: Array.from(this.clients.entries()).map(([id, client]) => ({
        clientId: id,
        deviceId: client.deviceId,
        connectedAt: client.connectedAt,
        lastActivity: client.lastActivity,
        packetsReceived: client.packetsReceived
      }))
    };
  }

  shutdown() {
    console.log('🔄 Closing all client connections...');
    
    // Close all client connections
    this.clients.forEach((client, clientId) => {
      client.socket.end();
    });
    this.clients.clear();

    // Close server
    if (this.server) {
      this.server.close(() => {
        console.log('✅ TCP Server closed');
      });
    }

    // Close database
    if (this.db) {
      this.db.close();
      console.log('✅ Database connection closed');
    }

    console.log('👋 GPS Tracker Server shutdown complete');
    process.exit(0);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new GPSTrackerServer();
  server.start();

  // Log server stats every 5 minutes
  setInterval(() => {
    const stats = server.getServerStats();
    console.log(`📊 Server Stats: ${stats.connectedClients} clients connected, ${stats.clientsWithDeviceId} identified devices`);
  }, 5 * 60 * 1000);
}

module.exports = GPSTrackerServer;