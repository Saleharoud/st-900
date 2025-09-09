const twilio = require('twilio');
const GPSDatabase = require('./database');
require('dotenv').config();

class SMSService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
    
    if (this.accountSid && this.authToken) {
      this.client = twilio(this.accountSid, this.authToken);
      console.log('✅ Twilio SMS service initialized');
    } else {
      console.warn('⚠️  Twilio credentials not configured. SMS features disabled.');
      this.client = null;
    }
    
    this.db = new GPSDatabase();
    this.commandTemplates = {
      setServer: (ip, port) => `8040000 ${ip} ${port}`,
      setInterval: (seconds) => `8090000 ${seconds}`,
      getStatus: () => '8030000',
      reset: () => '8050000',
      setAPN: (apn) => `8020000 ${apn}`,
      setPassword: (password) => `8010000 ${password}`,
      enableGPS: () => '8060000 1',
      disableGPS: () => '8060000 0'
    };
  }

  // Send SMS command to device
  async sendCommand(deviceId, commandType, parameters = {}) {
    try {
      if (!this.client) {
        throw new Error('SMS service not configured. Please set Twilio credentials.');
      }

      // Get device phone number
      const device = await this.getDeviceInfo(deviceId);
      if (!device || !device.phone_number) {
        throw new Error(`Device ${deviceId} not found or phone number not configured`);
      }

      // Generate command text
      const commandText = this.generateCommand(commandType, parameters);
      if (!commandText) {
        throw new Error(`Unknown command type: ${commandType}`);
      }

      // Insert command into database
      const commandRecord = this.db.insertCommand({
        device_id: deviceId,
        command_type: commandType,
        command_text: commandText,
        status: 'pending'
      });

      // Send SMS
      const message = await this.client.messages.create({
        body: commandText,
        from: this.fromNumber,
        to: device.phone_number
      });

      // Update command status
      this.db.updateCommandStatus(commandRecord.lastInsertRowid, 'sent');

      console.log(`📱 SMS sent to ${device.phone_number}: ${commandText}`);
      
      return {
        success: true,
        commandId: commandRecord.lastInsertRowid,
        messageSid: message.sid,
        commandText: commandText,
        sentTo: device.phone_number
      };

    } catch (error) {
      console.error('❌ Error sending SMS command:', error);
      throw error;
    }
  }

  // Generate command text based on type and parameters
  generateCommand(commandType, parameters) {
    const template = this.commandTemplates[commandType];
    if (!template) {
      return null;
    }

    try {
      if (typeof template === 'function') {
        return template(...Object.values(parameters));
      }
      return template;
    } catch (error) {
      console.error('Error generating command:', error);
      return null;
    }
  }

  // Get device information
  async getDeviceInfo(deviceId) {
    try {
      const devices = this.db.getActiveDevices();
      return devices.find(device => device.device_id === deviceId);
    } catch (error) {
      console.error('Error getting device info:', error);
      throw error;
    }
  }

  // Update device phone number
  async updateDevicePhone(deviceId, phoneNumber) {
    try {
      // Validate phone number format
      const cleanPhone = this.cleanPhoneNumber(phoneNumber);
      if (!this.isValidPhoneNumber(cleanPhone)) {
        throw new Error('Invalid phone number format');
      }

      const result = this.db.updateDevicePhone(deviceId, cleanPhone);
      console.log(`📱 Updated phone number for device ${deviceId}: ${cleanPhone}`);
      return result;
    } catch (error) {
      console.error('Error updating device phone:', error);
      throw error;
    }
  }

  // Clean and format phone number
  cleanPhoneNumber(phoneNumber) {
    // Remove all non-digit characters except +
    let cleaned = phoneNumber.replace(/[^+\d]/g, '');
    
    // Add + if not present and number doesn't start with it
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    
    return cleaned;
  }

  // Validate phone number format
  isValidPhoneNumber(phoneNumber) {
    // Basic validation: starts with + and has 10-15 digits
    const phoneRegex = /^\+\d{10,15}$/;
    return phoneRegex.test(phoneNumber);
  }

  // Get command history for device
  async getCommandHistory(deviceId, limit = 50) {
    try {
      return this.db.getCommandHistory(deviceId, limit);
    } catch (error) {
      console.error('Error getting command history:', error);
      throw error;
    }
  }

  // Get pending commands
  async getPendingCommands(deviceId = null) {
    try {
      return this.db.getPendingCommands(deviceId);
    } catch (error) {
      console.error('Error getting pending commands:', error);
      throw error;
    }
  }

  // Mark command as completed (when device responds)
  async markCommandCompleted(commandId, responseData = null) {
    try {
      return this.db.updateCommandStatus(commandId, 'completed', responseData);
    } catch (error) {
      console.error('Error marking command completed:', error);
      throw error;
    }
  }

  // Get available commands
  getAvailableCommands() {
    return {
      setServer: {
        description: 'Set GPS server IP and port',
        parameters: ['ip', 'port'],
        example: { ip: '192.168.1.100', port: '8091' }
      },
      setInterval: {
        description: 'Set GPS reporting interval in seconds',
        parameters: ['seconds'],
        example: { seconds: '30' }
      },
      getStatus: {
        description: 'Request device status',
        parameters: [],
        example: {}
      },
      reset: {
        description: 'Factory reset device',
        parameters: [],
        example: {}
      },
      setAPN: {
        description: 'Set mobile data APN',
        parameters: ['apn'],
        example: { apn: 'internet' }
      },
      setPassword: {
        description: 'Change device password',
        parameters: ['password'],
        example: { password: '123456' }
      },
      enableGPS: {
        description: 'Enable GPS tracking',
        parameters: [],
        example: {}
      },
      disableGPS: {
        description: 'Disable GPS tracking',
        parameters: [],
        example: {}
      }
    };
  }

  // Process incoming SMS responses (webhook handler)
  async processIncomingSMS(from, body) {
    try {
      console.log(`📱 Received SMS from ${from}: ${body}`);
      
      // Find device by phone number
      const device = this.db.getDeviceByPhone(from);
      if (!device) {
        console.warn(`⚠️  Unknown device phone number: ${from}`);
        return { success: false, message: 'Unknown device' };
      }

      // Find pending command for this device
      const pendingCommands = this.db.getPendingCommands(device.device_id);
      if (pendingCommands.length > 0) {
        // Mark the oldest pending command as completed
        const command = pendingCommands[0];
        this.db.updateCommandStatus(command.id, 'completed', body);
        console.log(`✅ Command ${command.id} marked as completed`);
      }

      return {
        success: true,
        deviceId: device.device_id,
        response: body
      };
    } catch (error) {
      console.error('Error processing incoming SMS:', error);
      throw error;
    }
  }
}

module.exports = SMSService;