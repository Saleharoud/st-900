/**
 * GPS Data Parser for SinoTrack ST-900 Device
 * Handles various packet formats from the ST-900 GPS tracker
 */

class ST900Parser {
  constructor() {
    this.packetTypes = {
      LOCATION: 'location',
      HEARTBEAT: 'heartbeat',
      ALARM: 'alarm',
      LOGIN: 'login'
    };
  }

  /**
   * Parse incoming raw data from ST-900 device
   * @param {string} rawData - Raw data string from device
   * @returns {Object|null} Parsed GPS data or null if invalid
   */
  parse(rawData) {
    if (!rawData || typeof rawData !== 'string') {
      return null;
    }

    const data = rawData.trim();
    console.log('Parsing raw data:', data);

    try {
      // Try different parsing methods based on common GPS tracker formats
      let parsed = this.parseStandardFormat(data) ||
                   this.parseCommaDelimited(data) ||
                   this.parseAlternativeFormat(data) ||
                   this.parseHQFormat(data);

      if (parsed) {
        parsed.raw_data = data;
        parsed.parsed_at = new Date().toISOString();
        return parsed;
      }

      console.warn('Unable to parse data format:', data);
      return null;
    } catch (error) {
      console.error('Error parsing GPS data:', error);
      return null;
    }
  }

  /**
   * Parse standard ST-900 format
   * Example: ST900,ID:8160528336,Lat:35.1234,Lon:36.5678,Speed:40,Time:20250909
   */
  parseStandardFormat(data) {
    const standardRegex = /ST900,ID:(\d+),Lat:([\d.-]+),Lon:([\d.-]+),Speed:([\d.]+),Time:(\d+)/i;
    const match = data.match(standardRegex);

    if (match) {
      return {
        type: this.packetTypes.LOCATION,
        device_id: match[1],
        lat: parseFloat(match[2]),
        lon: parseFloat(match[3]),
        speed: parseFloat(match[4]),
        timestamp: this.parseTimestamp(match[5])
      };
    }

    return null;
  }

  /**
   * Parse comma-delimited format
   * Example: 8160528336,35.1234,36.5678,40,0,20250909120000
   */
  parseCommaDelimited(data) {
    const parts = data.split(',');
    
    if (parts.length >= 6) {
      const deviceId = parts[0];
      const lat = parseFloat(parts[1]);
      const lon = parseFloat(parts[2]);
      const speed = parseFloat(parts[3]);
      const heading = parseFloat(parts[4]) || 0;
      const timestamp = this.parseTimestamp(parts[5]);

      if (!isNaN(lat) && !isNaN(lon) && this.isValidCoordinate(lat, lon)) {
        return {
          type: this.packetTypes.LOCATION,
          device_id: deviceId,
          lat: lat,
          lon: lon,
          speed: speed || 0,
          heading: heading,
          timestamp: timestamp
        };
      }
    }

    return null;
  }

  /**
   * Parse alternative format with key-value pairs
   * Example: imei:8160528336,lat:35.1234,lng:36.5678,speed:40,time:1609459200
   */
  parseAlternativeFormat(data) {
    const kvRegex = /(\w+):([^,]+)/g;
    const pairs = {};
    let match;

    while ((match = kvRegex.exec(data)) !== null) {
      pairs[match[1].toLowerCase()] = match[2];
    }

    if (pairs.imei && pairs.lat && (pairs.lng || pairs.lon)) {
      const lat = parseFloat(pairs.lat);
      const lon = parseFloat(pairs.lng || pairs.lon);

      if (this.isValidCoordinate(lat, lon)) {
        return {
          type: this.packetTypes.LOCATION,
          device_id: pairs.imei,
          lat: lat,
          lon: lon,
          speed: parseFloat(pairs.speed) || 0,
          heading: parseFloat(pairs.heading || pairs.course) || 0,
          altitude: parseFloat(pairs.alt || pairs.altitude) || 0,
          timestamp: this.parseTimestamp(pairs.time)
        };
      }
    }

    return null;
  }

  /**
   * Parse HQ format GPS data
   * Example: *HQ,3072866250,V1,211806,A,3635.1452,N,03702.2586,E,000.00,000,090925,7FFFFBFF,417,02,202,23002#
   */
  parseHQFormat(data) {
    // Check if it's HQ format
    if (!data.startsWith('*HQ,') || !data.endsWith('#')) {
      return null;
    }

    // Remove *HQ, prefix and # suffix
    const cleanData = data.slice(4, -1);
    const parts = cleanData.split(',');

    if (parts.length >= 12) {
      try {
        const deviceId = parts[0]; // IMEI
        const status = parts[3]; // A = valid, V = invalid
        
        if (status !== 'A') {
          // Invalid GPS fix
          return null;
        }

        // Parse coordinates in DDMM.MMMM format
        const latDegMin = parseFloat(parts[4]); // 3635.1452
        const latDir = parts[5]; // N or S
        const lonDegMin = parseFloat(parts[6]); // 03702.2586
        const lonDir = parts[7]; // E or W
        
        // Convert DDMM.MMMM to decimal degrees
        const latDeg = Math.floor(latDegMin / 100);
        const latMin = latDegMin % 100;
        let lat = latDeg + (latMin / 60);
        if (latDir === 'S') lat = -lat;
        
        const lonDeg = Math.floor(lonDegMin / 100);
        const lonMin = lonDegMin % 100;
        let lon = lonDeg + (lonMin / 60);
        if (lonDir === 'W') lon = -lon;
        
        const speed = parseFloat(parts[8]) || 0; // Speed in knots
        const heading = parseFloat(parts[9]) || 0; // Course
        const dateStr = parts[10]; // DDMMYY format
        
        // Parse date DDMMYY
        const day = dateStr.substr(0, 2);
        const month = dateStr.substr(2, 2);
        const year = '20' + dateStr.substr(4, 2);
        
        // Parse time from parts[2] (HHMMSS format)
        const timeStr = parts[2];
        const hour = timeStr.substr(0, 2);
        const minute = timeStr.substr(2, 2);
        const second = timeStr.substr(4, 2);
        
        // Create timestamp and convert to Syria timezone (UTC+3)
         const utcDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
         const syriaDate = new Date(utcDate.getTime() + (3 * 60 * 60 * 1000)); // Add 3 hours for Syria timezone
         const timestamp = syriaDate.toISOString();
        
        if (this.isValidCoordinate(lat, lon)) {
          return {
            type: this.packetTypes.LOCATION,
            device_id: deviceId,
            lat: lat,
            lon: lon,
            speed: speed * 1.852, // Convert knots to km/h
            heading: heading,
            timestamp: timestamp
          };
        }
      } catch (error) {
        console.warn('Error parsing HQ format:', error);
        return null;
      }
    }

    return null;
  }

  /**
   * Parse timestamp from various formats
   * @param {string} timeStr - Time string in various formats
   * @returns {string} ISO timestamp
   */
  parseTimestamp(timeStr) {
    if (!timeStr) {
      return new Date().toISOString();
    }

    try {
      // Unix timestamp (seconds)
      if (/^\d{10}$/.test(timeStr)) {
        return new Date(parseInt(timeStr) * 1000).toISOString();
      }

      // Unix timestamp (milliseconds)
      if (/^\d{13}$/.test(timeStr)) {
        return new Date(parseInt(timeStr)).toISOString();
      }

      // YYYYMMDDHHMMSS format
      if (/^\d{14}$/.test(timeStr)) {
        const year = timeStr.substr(0, 4);
        const month = timeStr.substr(4, 2);
        const day = timeStr.substr(6, 2);
        const hour = timeStr.substr(8, 2);
        const minute = timeStr.substr(10, 2);
        const second = timeStr.substr(12, 2);
        
        return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString();
      }

      // YYYYMMDD format
      if (/^\d{8}$/.test(timeStr)) {
        const year = timeStr.substr(0, 4);
        const month = timeStr.substr(4, 2);
        const day = timeStr.substr(6, 2);
        
        return new Date(`${year}-${month}-${day}T00:00:00Z`).toISOString();
      }

      // Try to parse as regular date string
      const parsed = new Date(timeStr);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    } catch (error) {
      console.warn('Error parsing timestamp:', timeStr, error);
    }

    // Fallback to current time
    return new Date().toISOString();
  }

  /**
   * Validate GPS coordinates
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {boolean} True if coordinates are valid
   */
  isValidCoordinate(lat, lon) {
    return !isNaN(lat) && !isNaN(lon) &&
           lat >= -90 && lat <= 90 &&
           lon >= -180 && lon <= 180 &&
           (lat !== 0 || lon !== 0); // Exclude null island
  }

  /**
   * Check if data appears to be a heartbeat/keepalive packet
   * @param {string} data - Raw data string
   * @returns {boolean} True if appears to be heartbeat
   */
  isHeartbeat(data) {
    const heartbeatPatterns = [
      /^(heartbeat|ping|alive)$/i,
      /^\d+,heartbeat$/i,
      /^ST900,heartbeat/i
    ];

    return heartbeatPatterns.some(pattern => pattern.test(data.trim()));
  }

  /**
   * Check if data appears to be a login packet
   * @param {string} data - Raw data string
   * @returns {boolean} True if appears to be login
   */
  isLogin(data) {
    const loginPatterns = [
      /^(login|connect|hello)$/i,
      /^\d+,login$/i,
      /^ST900,login/i,
      /imei:\d+,login/i
    ];

    return loginPatterns.some(pattern => pattern.test(data.trim()));
  }
}

module.exports = ST900Parser;