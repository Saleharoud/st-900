const GPSTrackerServer = require('./server');
const GPSTrackerAPI = require('./api');
require('dotenv').config();

class ST900GPSTrackerSystem {
  constructor() {
    this.tcpServer = null;
    this.apiServer = null;
    this.isShuttingDown = false;
  }

  async start() {
    console.log('🚀 Starting ST-900 GPS Tracker System...');
    console.log('=' .repeat(50));
    
    try {
      // Start TCP server for GPS trackers
      console.log('📡 Initializing TCP server for GPS trackers...');
      this.tcpServer = new GPSTrackerServer();
      this.tcpServer.start();
      
      // Wait a moment for TCP server to initialize
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Start HTTP API server
      console.log('🌐 Initializing HTTP API server...');
      this.apiServer = new GPSTrackerAPI();
      this.apiServer.start();
      
      console.log('=' .repeat(50));
      console.log('✅ ST-900 GPS Tracker System is fully operational!');
      console.log('');
      console.log('📱 Device Configuration:');
      console.log(`   Send SMS to your ST-900 device: 8040000 YOUR_SERVER_IP ${process.env.TCP_PORT || 8090}`);
      console.log(`   Set reporting interval: 8090000 20 (for 20 seconds)`);
      console.log('');
      console.log('🔗 Access Points:');
      console.log(`   Web Interface: http://localhost:${process.env.HTTP_PORT || 3000}`);
      console.log(`   API Endpoint: http://localhost:${process.env.HTTP_PORT || 3000}/locations`);
      console.log(`   TCP Server: ${process.env.TCP_HOST || '0.0.0.0'}:${process.env.TCP_PORT || 8090}`);
      console.log('=' .repeat(50));
      
    } catch (error) {
      console.error('❌ Failed to start GPS Tracker System:', error);
      process.exit(1);
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) {
        console.log('⚠️  Shutdown already in progress...');
        return;
      }
      
      this.isShuttingDown = true;
      console.log(`\n🛑 Received ${signal}, shutting down ST-900 GPS Tracker System...`);
      console.log('=' .repeat(50));
      
      try {
        // Shutdown TCP server
        if (this.tcpServer) {
          console.log('🔄 Shutting down TCP server...');
          this.tcpServer.shutdown();
        }
        
        // Shutdown API server
        if (this.apiServer) {
          console.log('🔄 Shutting down HTTP API server...');
          this.apiServer.shutdown();
        }
        
        console.log('✅ ST-900 GPS Tracker System shutdown complete');
        console.log('👋 Goodbye!');
        process.exit(0);
        
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Handle different shutdown signals
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGQUIT', () => shutdown('SIGQUIT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      shutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }
}

// Start the system if this file is run directly
if (require.main === module) {
  const system = new ST900GPSTrackerSystem();
  
  // Setup graceful shutdown handlers
  system.setupGracefulShutdown();
  
  // Start the system
  system.start().catch(error => {
    console.error('❌ Failed to start system:', error);
    process.exit(1);
  });
}

module.exports = ST900GPSTrackerSystem;