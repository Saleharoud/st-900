#!/usr/bin/env node

const GPSDatabase = require('../database');
require('dotenv').config();

console.log('🗄️  Initializing ST-900 GPS Tracker Database...');
console.log('=' .repeat(50));

try {
  // Initialize database
  const db = new GPSDatabase();
  
  console.log('✅ Database tables created successfully');
  console.log('✅ Indexes created for optimal performance');
  
  // Insert some sample data for testing (optional)
  const sampleData = {
    device_id: '8160528336',
    lat: 35.1234,
    lon: 36.5678,
    speed: 40,
    altitude: 150,
    heading: 90,
    timestamp: new Date().toISOString(),
    raw_data: 'ST900,ID:8160528336,Lat:35.1234,Lon:36.5678,Speed:40,Time:20250909'
  };
  
  console.log('📍 Inserting sample GPS data...');
  const result = db.insertGpsLog(sampleData);
  
  if (result) {
    console.log(`✅ Sample data inserted with ID: ${result.lastInsertRowid}`);
  }
  
  // Get and display database stats
  const devices = db.getActiveDevices();
  const locations = db.getLatestLocations(10);
  
  console.log('');
  console.log('📊 Database Statistics:');
  console.log(`   Active devices: ${devices.length}`);
  console.log(`   Total location records: ${locations.length}`);
  
  if (locations.length > 0) {
    console.log('');
    console.log('📍 Latest Location Records:');
    locations.forEach((location, index) => {
      console.log(`   ${index + 1}. Device ${location.device_id}: ${location.lat}, ${location.lon} (${location.timestamp})`);
    });
  }
  
  // Close database connection
  db.close();
  
  console.log('');
  console.log('=' .repeat(50));
  console.log('✅ Database initialization completed successfully!');
  console.log('🚀 You can now start the GPS tracker server with: npm start');
  
} catch (error) {
  console.error('❌ Database initialization failed:', error);
  process.exit(1);
}