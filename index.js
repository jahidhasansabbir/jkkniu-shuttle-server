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

    // mark source as ESP32
    data.source = "ESP32";

    // save to MongoDB
    if (locationColl) {
      await locationColl.insertOne({
        ...data,
        receivedAt: new Date()
      });
    }

    // broadcast to frontend (socket.io)
    io.emit("location-update", data);

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

    app.get('/shuttleInfo', async (req, res) => {
      const result = await locationColl.find().toArray();
      res.send(result);
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

    // save to MongoDB
    if (locationColl) {
      await locationColl.insertOne({
        ...data,
        receivedAt: new Date()
      });
    }

    // broadcast to viewers
    io.emit("location-update", data);
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
