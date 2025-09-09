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
      // Try different parsing methods based on common ST-900 formats
      let parsed = this.parseStandardFormat(data) ||
                   this.parseCommaDelimited(data) ||
                   this.parseAlternativeFormat(data);

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