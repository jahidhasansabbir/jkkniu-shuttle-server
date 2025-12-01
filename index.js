const express = require('express');
const cors = require('cors');
const app = express();
const http = require("http");      
const server = http.createServer(app); 
const { Server } = require("socket.io");
const { MongoClient, ServerApiVersion } = require('mongodb');
require("dotenv").config();

app.use(cors());
app.use(express.json());

// socket.io setup
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

// =====================
//  MongoDB Setup
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

async function run() {
  try {
    await client.connect();
    
    const shuttleColl = client.db("shuttleDB").collection("shuttleInfo");
    
    // NEW collection for live location
     locationColl = client.db("shuttleDB").collection("locations");

    // get shuttle info
    app.get('/shuttleInfo', async (req, res) => {
        const result = await locationColl.find().toArray();
        res.send(result);
    });

  } finally {}
}

run();

// =====================
//  Express Home route
// =====================
app.get('/', (req, res) => {
    res.send('Server isa running...');
});

// =====================
//  Socket.io Logic
// =====================
io.on("connection", (socket) => {
  console.log("Device connected:", socket.id);

  // receive GPS data from client
  socket.on("send-location", async (data) => {
    console.log("Location received:", data);

    // save to MongoDB
    // if (locationColl) {
    //   await locationColl.insertOne(data);
    // }

    // broadcast to viewers (optional)
    io.emit("location-update", data);
  });

  socket.on("disconnect", () => {
    console.log("Device disconnected:", socket.id);
  });
});

// =====================
//  Start Server
// =====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
