const Database = require('better-sqlite3');
const path = require('path');

class GPSDatabase {
  constructor(dbPath = 'gps_tracker.db') {
    this.db = new Database(dbPath);
    this.initTables();
  }

  initTables() {
    // Create gps_logs table
    const createGpsLogsTable = `
      CREATE TABLE IF NOT EXISTS gps_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        speed REAL DEFAULT 0,
        altitude REAL DEFAULT 0,
        heading REAL DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        raw_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create devices table for device management
    const createDevicesTable = `
      CREATE TABLE IF NOT EXISTS devices (
        device_id TEXT PRIMARY KEY,
        name TEXT,
        last_seen DATETIME,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create indexes for better performance
    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_gps_logs_device_id ON gps_logs(device_id)',
      'CREATE INDEX IF NOT EXISTS idx_gps_logs_timestamp ON gps_logs(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen)'
    ];

    try {
      this.db.exec(createGpsLogsTable);
      this.db.exec(createDevicesTable);
      
      createIndexes.forEach(indexQuery => {
        this.db.exec(indexQuery);
      });

      console.log('Database tables initialized successfully');
    } catch (error) {
      console.error('Error initializing database tables:', error);
      throw error;
    }
  }

  // Insert GPS log entry
  insertGpsLog(data) {
    const stmt = this.db.prepare(`
      INSERT INTO gps_logs (device_id, lat, lon, speed, altitude, heading, timestamp, raw_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      const result = stmt.run(
        data.device_id,
        data.lat,
        data.lon,
        data.speed || 0,
        data.altitude || 0,
        data.heading || 0,
        data.timestamp || new Date().toISOString(),
        data.raw_data || ''
      );

      // Update device last seen
      this.updateDeviceLastSeen(data.device_id);

      return result;
    } catch (error) {
      console.error('Error inserting GPS log:', error);
      throw error;
    }
  }

  // Update device last seen timestamp
  updateDeviceLastSeen(deviceId) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO devices (device_id, last_seen)
      VALUES (?, ?)
    `);

    try {
      stmt.run(deviceId, new Date().toISOString());
    } catch (error) {
      console.error('Error updating device last seen:', error);
    }
  }

  // Get latest locations for all devices
  getLatestLocations(limit = 100) {
    const stmt = this.db.prepare(`
      SELECT 
        gl.*,
        d.name as device_name
      FROM gps_logs gl
      LEFT JOIN devices d ON gl.device_id = d.device_id
      WHERE gl.id IN (
        SELECT MAX(id)
        FROM gps_logs
        GROUP BY device_id
      )
      ORDER BY gl.timestamp DESC
      LIMIT ?
    `);

    try {
      return stmt.all(limit);
    } catch (error) {
      console.error('Error getting latest locations:', error);
      throw error;
    }
  }

  // Get location history for a specific device
  getDeviceHistory(deviceId, limit = 100) {
    const stmt = this.db.prepare(`
      SELECT * FROM gps_logs
      WHERE device_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    try {
      return stmt.all(deviceId, limit);
    } catch (error) {
      console.error('Error getting device history:', error);
      throw error;
    }
  }

  // Get all active devices
  getActiveDevices() {
    const stmt = this.db.prepare(`
      SELECT 
        d.*,
        COUNT(gl.id) as total_logs,
        MAX(gl.timestamp) as last_location_time
      FROM devices d
      LEFT JOIN gps_logs gl ON d.device_id = gl.device_id
      WHERE d.is_active = 1
      GROUP BY d.device_id
      ORDER BY d.last_seen DESC
    `);

    try {
      return stmt.all();
    } catch (error) {
      console.error('Error getting active devices:', error);
      throw error;
    }
  }

  // Close database connection
  close() {
    this.db.close();
  }
}

module.exports = GPSDatabase;