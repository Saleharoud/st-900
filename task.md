
# 📌 Task: Build a GPS Tracker Server for ST-900

## 1. Goal
We need to create a **server** that can receive and process GPS tracking data from the **SinoTrack ST-900** device. The server should:  
- Accept incoming TCP connections from trackers.  
- Parse GPS data (ID, lat, lon, speed, etc.).  
- Store data in a database (start with SQLite or PostgreSQL).  
- Provide a simple API (HTTP/JSON) to fetch latest locations.  

---

## 2. References
- Device manual: **ST-900 User Manual** (provided).  
- Default communication: **TCP/IP via GPRS**  
  - Command to set server:  
    ```
    8040000 <SERVER_IP> <PORT>
    ```
  - Default reporting interval: 20s (can be changed with SMS: `8090000 <seconds>`).  
- Example data: the device sends packets with ID + GPS position (ASCII strings).  

---

## 3. Environment
- VPS: Linux (Ubuntu 22.04 recommended).  
- Node.js ≥ 18.x (preferred for TCP + HTTP server).  
- Database: SQLite (easy start) or PostgreSQL (scalable).  

---

## 4. Tasks

### A. TCP Server (for tracker data)
Create `server.js`:

```js
const net = require("net");
const PORT = process.env.TCP_PORT || 8090;

const server = net.createServer((socket) => {
  console.log("Tracker connected:", socket.remoteAddress);

  socket.on("data", (data) => {
    const raw = data.toString().trim();
    console.log("Raw data:", raw);

    // TODO: Parse GPS packet (format depends on ST-900 protocol)
    // Example expected structure:
    // ST900,ID:8160528336,Lat:35.1234,Lon:36.5678,Speed:40,Time:20250909
    const parsed = parseTrackerData(raw);

    // TODO: Save to DB
    saveToDatabase(parsed);
  });

  socket.on("end", () => {
    console.log("Tracker disconnected");
  });
});

server.listen(PORT, () => {
  console.log(`TCP server listening on port ${PORT}`);
});

// --- Parser placeholder ---
function parseTrackerData(raw) {
  // Extract fields (needs protocol docs / testing with real device)
  return {
    id: "unknown",
    lat: 0,
    lon: 0,
    speed: 0,
    timestamp: new Date()
  };
}

function saveToDatabase(data) {
  console.log("Saving:", data);
  // TODO: implement DB storage
}
```

---

### B. HTTP API (to view data)
Create `api.js`:

```js
const express = require("express");
const app = express();
const PORT = process.env.HTTP_PORT || 3000;

// Endpoint: Get latest positions
app.get("/locations", async (req, res) => {
  // TODO: Query DB for latest tracker data
  res.json([{ id: "8160528336", lat: 35.1234, lon: 36.5678, speed: 40 }]);
});

app.listen(PORT, () => {
  console.log(`HTTP API running on port ${PORT}`);
});
```

---

### C. Database
- Start with SQLite (`better-sqlite3` for Node.js).  
- Table schema:

```sql
CREATE TABLE gps_logs (
  id TEXT,
  lat REAL,
  lon REAL,
  speed REAL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. Deployment
- Use Railway or Oracle Cloud VPS.  
- Expose both:  
  - **TCP port 8090** (for tracker connections).  
  - **HTTP port 3000** (for API).  

---

## 6. Testing
1. Configure tracker with SMS:  
   ```
   8040000 <your-server-ip> 8090
   8090000 20
   ```
   → This sets reporting every 20 seconds to your VPS.  
2. Verify incoming data in server logs.  
3. Query `http://<server-ip>:3000/locations` to see last positions.  

---

## 7. Next Steps
- Improve packet parser (once real device packets are captured).  
- Add authentication (per device ID).  
- Build a small dashboard (React/Leaflet.js map) for visualization.  
