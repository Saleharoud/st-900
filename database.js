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
        phone_number TEXT,
        last_seen DATETIME,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create device commands table
    const createCommandsTable = `
      CREATE TABLE IF NOT EXISTS device_commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        command_type TEXT NOT NULL,
        command_text TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        sent_at DATETIME,
        response_received_at DATETIME,
        response_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(device_id)
      )
    `;

    // Create indexes for better performance
    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_gps_logs_device_id ON gps_logs(device_id)',
      'CREATE INDEX IF NOT EXISTS idx_gps_logs_timestamp ON gps_logs(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen)',
      'CREATE INDEX IF NOT EXISTS idx_commands_device_id ON device_commands(device_id)',
      'CREATE INDEX IF NOT EXISTS idx_commands_status ON device_commands(status)',
      'CREATE INDEX IF NOT EXISTS idx_commands_created_at ON device_commands(created_at)'
    ];

    try {
      this.db.exec(createGpsLogsTable);
      this.db.exec(createDevicesTable);
      this.db.exec(createCommandsTable);
      
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

  // Insert device command
  insertCommand(data) {
    const stmt = this.db.prepare(`
      INSERT INTO device_commands (device_id, command_type, command_text, status)
      VALUES (?, ?, ?, ?)
    `);

    try {
      const result = stmt.run(
        data.device_id,
        data.command_type,
        data.command_text,
        data.status || 'pending'
      );
      return result;
    } catch (error) {
      console.error('Error inserting command:', error);
      throw error;
    }
  }

  // Update command status
  updateCommandStatus(commandId, status, responseData = null) {
    const stmt = this.db.prepare(`
      UPDATE device_commands 
      SET status = ?, response_data = ?, 
          sent_at = CASE WHEN status = 'sent' THEN ? ELSE sent_at END,
          response_received_at = CASE WHEN status = 'completed' THEN ? ELSE response_received_at END
      WHERE id = ?
    `);

    try {
      const now = new Date().toISOString();
      const result = stmt.run(status, responseData, now, now, commandId);
      return result;
    } catch (error) {
      console.error('Error updating command status:', error);
      throw error;
    }
  }

  // Get pending commands
  getPendingCommands(deviceId = null) {
    let query = `
      SELECT * FROM device_commands 
      WHERE status = 'pending'
    `;
    let params = [];

    if (deviceId) {
      query += ' AND device_id = ?';
      params.push(deviceId);
    }

    query += ' ORDER BY created_at ASC';

    const stmt = this.db.prepare(query);
    try {
      return stmt.all(...params);
    } catch (error) {
      console.error('Error getting pending commands:', error);
      throw error;
    }
  }

  // Get command history for device
  getCommandHistory(deviceId, limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM device_commands
      WHERE device_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

    try {
      return stmt.all(deviceId, limit);
    } catch (error) {
      console.error('Error getting command history:', error);
      throw error;
    }
  }

  // Update device phone number
  updateDevicePhone(deviceId, phoneNumber) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO devices (device_id, phone_number, last_seen)
      VALUES (?, ?, ?)
    `);

    try {
      const result = stmt.run(deviceId, phoneNumber, new Date().toISOString());
      return result;
    } catch (error) {
      console.error('Error updating device phone:', error);
      throw error;
    }
  }

  // Get device by phone number
  getDeviceByPhone(phoneNumber) {
    const stmt = this.db.prepare(`
      SELECT * FROM devices WHERE phone_number = ?
    `);

    try {
      return stmt.get(phoneNumber);
    } catch (error) {
      console.error('Error getting device by phone:', error);
      throw error;
    }
  }

  // Close database connection
  close() {
    this.db.close();
  }
}

module.exports = GPSDatabase;