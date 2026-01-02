const express = require('express');
const cors = require('cors');
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const { MongoClient, ServerApiVersion } = require('mongodb');
const mqtt = require("mqtt");
require("dotenv").config();

app.use(cors());
app.use(express.json());

// =====================
// Socket.io setup
// =====================
const io = new Server(server, {
  cors: { origin: "*" }
});

// =====================
// MongoDB Setup
// =====================
const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let locationColl;

// =====================
// MQTT Setup for ESP Tracker
// =====================
const MQTT_BROKER = "mqtt://broker.hivemq.com";
const MQTT_TOPIC = "tracker/#";

const mqttClient = mqtt.connect(MQTT_BROKER);

mqttClient.on("connect", () => {
  console.log("✅ MQTT connected to broker");
  mqttClient.subscribe(MQTT_TOPIC);
});

mqttClient.on("message", async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log("📩 ESP MQTT data:", data);

    data.source = "ESP32";

    // ensure each ESP has a unique ID
    data.deviceId = data.deviceId || topic.split("/")[1] || "unknown_esp";

    // save to MongoDB
    if (locationColl) {
      await locationColl.insertOne({
        ...data,
        receivedAt: new Date()
      });
    }

    // broadcast to frontend per device
    io.emit(`location-update-${data.deviceId}`, data);

  } catch (err) {
    console.error("❌ MQTT parse error:", err.message);
  }
});

// =====================
// MongoDB Init
// =====================
async function run() {
  try {
    await client.connect();
    locationColl = client.db("shuttleDB").collection("locations");
    console.log("✅ MongoDB connected");

    // updated shuttleInfo API
    app.get('/shuttleInfo', async (req, res) => {
      try {
        if (!locationColl) return res.status(500).send({ error: "DB not ready" });

        const allLocations = await locationColl.find().toArray();

        // group by deviceId
        const devices = {};
        allLocations.forEach(loc => {
          if (!loc.deviceId) loc.deviceId = loc.source + "_unknown";
          if (!devices[loc.deviceId]) devices[loc.deviceId] = [];
          devices[loc.deviceId].push(loc);
        });

        // get latest location per device
        const latestPerDevice = {};
        Object.keys(devices).forEach(deviceId => {
          const sorted = devices[deviceId].sort((a, b) => b.receivedAt - a.receivedAt);
          latestPerDevice[deviceId] = sorted[0];
        });

        res.send({
          allDevices: devices,
          latestLocations: latestPerDevice
        });

      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Server error" });
      }
    });

  } finally {}
}

run();

// =====================
// Express Routes
// =====================
app.get('/', (req, res) => {
  res.send('Server is running...');
});

// =====================
// Socket.io logic for phone tracker
// =====================
io.on("connection", (socket) => {
  console.log("Device connected:", socket.id);

  // Phone tracker sends location via socket.io
  socket.on("send-location", async (data) => {
    console.log("📩 Phone data:", data);

    data.source = "phone";
    data.deviceId = data.busId || socket.id;

    // save to MongoDB
    if (locationColl) {
      await locationColl.insertOne({
        ...data,
        receivedAt: new Date()
      });
    }

    // broadcast to frontend per device
    io.emit(`location-update-${data.deviceId}`, data);
  });

  socket.on("disconnect", () => {
    console.log("Device disconnected:", socket.id);
  });
});

// =====================
// Start Server
// =====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
