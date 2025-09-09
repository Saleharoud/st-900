# 🛰️ ST-900 GPS Tracker Server

A Node.js server application for receiving and processing GPS tracking data from **SinoTrack ST-900** devices. The server provides both TCP connectivity for GPS trackers and a REST API for accessing location data.

## ✨ Features

- **TCP Server**: Receives GPS data from ST-900 devices via TCP/IP
- **HTTP API**: RESTful API for querying location data
- **SQLite Database**: Stores GPS logs with automatic schema creation
- **Real-time Processing**: Handles multiple concurrent device connections
- **Web Interface**: Simple web dashboard for viewing API endpoints
- **Flexible Parser**: Supports multiple ST-900 data formats
- **Docker Support**: Easy deployment with Docker containers

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 18.0.0
- npm or yarn
- ST-900 GPS tracker device

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/st900-gps-tracker-server.git
   cd st900-gps-tracker-server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env file with your configuration
   ```

4. **Initialize database**
   ```bash
   npm run init-db
   ```

5. **Start the server**
   ```bash
   npm start
   ```

The server will start both TCP (port 8090) and HTTP (port 3000) services.

## 📱 Device Configuration

Configure your ST-900 device to send data to your server:

### SMS Commands

1. **Set server address and port**
   ```
   8040000 YOUR_SERVER_IP 8090
   ```

2. **Set reporting interval (optional)**
   ```
   8090000 20
   ```
   This sets the device to report every 20 seconds.

3. **Check device status**
   ```
   8030000
   ```

### Example Configuration

If your server is running on IP `203.0.113.10`:
```
8040000 203.0.113.10 8090
8090000 30
```

## 🌐 API Documentation

### Base URL
```
http://your-server:3000
```

### Endpoints

#### Health Check
```http
GET /health
```
Returns server health status and uptime information.

#### Get Latest Locations
```http
GET /locations?limit=100
```
Returns the latest location for each device.

**Query Parameters:**
- `limit` (optional): Maximum number of results (default: 100)

**Response:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": 1,
      "device_id": "8160528336",
      "device_name": null,
      "latitude": 35.1234,
      "longitude": 36.5678,
      "speed": 40,
      "altitude": 150,
      "heading": 90,
      "timestamp": "2025-01-09T12:00:00.000Z",
      "coordinates": [36.5678, 35.1234],
      "location_age_minutes": 5
    }
  ]
}
```

#### Get Device List
```http
GET /devices
```
Returns all active devices with their status.

#### Get Device History
```http
GET /devices/{deviceId}/history?limit=100
```
Returns location history for a specific device.

#### Get Latest Device Location
```http
GET /devices/{deviceId}/latest
```
Returns the most recent location for a specific device.

#### Get Locations by Bounds
```http
GET /locations/bounds?north=36&south=35&east=37&west=35&limit=100
```
Returns locations within specified geographic boundaries.

## 🗄️ Database Schema

### GPS Logs Table
```sql
CREATE TABLE gps_logs (
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
);
```

### Devices Table
```sql
CREATE TABLE devices (
  device_id TEXT PRIMARY KEY,
  name TEXT,
  last_seen DATETIME,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Server Configuration
TCP_HOST=0.0.0.0
TCP_PORT=8090
HTTP_HOST=0.0.0.0
HTTP_PORT=3000

# Database
DATABASE_PATH=gps_tracker.db

# Application
NODE_ENV=production
MAX_CONNECTIONS=100
CONNECTION_TIMEOUT=1800000
```

### Available Scripts

- `npm start` - Start both TCP and HTTP servers
- `npm run dev` - Start with file watching for development
- `npm run tcp-server` - Start only TCP server
- `npm run api-server` - Start only HTTP API server
- `npm run init-db` - Initialize database with sample data

## 🐳 Docker Deployment

### Using Docker Compose (Recommended)

1. **Build and start services**
   ```bash
   docker-compose up -d
   ```

2. **View logs**
   ```bash
   docker-compose logs -f
   ```

3. **Stop services**
   ```bash
   docker-compose down
   ```

### Using Docker directly

1. **Build image**
   ```bash
   docker build -t st900-gps-tracker .
   ```

2. **Run container**
   ```bash
   docker run -d \
     --name st900-tracker \
     -p 8090:8090 \
     -p 3000:3000 \
     -v $(pwd)/data:/app/data \
     st900-gps-tracker
   ```

## 🌍 Cloud Deployment

### Railway

1. Fork this repository
2. Connect to Railway
3. Set environment variables in Railway dashboard
4. Deploy automatically

### DigitalOcean App Platform

1. Create new app from GitHub repository
2. Configure environment variables
3. Set HTTP port to 3000
4. Deploy

### AWS EC2

1. Launch Ubuntu 22.04 instance
2. Install Node.js and PM2
3. Clone repository and install dependencies
4. Configure security groups (ports 8090, 3000)
5. Start with PM2: `pm2 start index.js --name st900-tracker`

## 🔧 Development

### Project Structure

```
st900-gps-tracker-server/
├── index.js          # Main application entry point
├── server.js         # TCP server for GPS trackers
├── api.js           # HTTP API server
├── database.js      # Database connection and queries
├── parser.js        # GPS data parser for ST-900
├── package.json     # Dependencies and scripts
├── .env.example     # Environment configuration template
├── docker-compose.yml # Docker composition
├── Dockerfile       # Docker image definition
├── scripts/
│   └── init-db.js   # Database initialization script
└── README.md        # This file
```

### Adding New Features

1. **Custom Data Formats**: Modify `parser.js` to support additional GPS data formats
2. **Authentication**: Add API key validation in `api.js`
3. **WebSocket Support**: Implement real-time location streaming
4. **Dashboard**: Create a web-based dashboard for device management

## 🐛 Troubleshooting

### Common Issues

**Device not connecting:**
- Check firewall settings (port 8090 must be open)
- Verify device configuration SMS commands
- Check server logs for connection attempts

**No location data:**
- Ensure device has GPS signal
- Check if device is sending data (server logs)
- Verify data format matches parser expectations

**API not responding:**
- Check if HTTP server is running (port 3000)
- Verify database file permissions
- Check server logs for errors

### Debug Mode

Run with debug logging:
```bash
NODE_ENV=development npm start
```

## 📊 Monitoring

### Server Statistics

The TCP server provides real-time statistics:
- Connected clients count
- Identified devices count
- Packets received per device
- Connection duration

### Health Monitoring

Use the `/health` endpoint for monitoring:
```bash
curl http://your-server:3000/health
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review server logs for error messages

## 🔮 Roadmap

- [ ] Web-based dashboard
- [ ] Real-time WebSocket API
- [ ] Device management interface
- [ ] Geofencing alerts
- [ ] Historical route visualization
- [ ] Multi-tenant support
- [ ] PostgreSQL support
- [ ] Clustering for high availability

---

**Made with ❤️ for the GPS tracking community**