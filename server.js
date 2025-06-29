const http = require("http");
const express = require("express");
const cors = require("cors");
const app = express();
const axios = require("axios");

// Environment-based configuration
const PORT = process.env.PORT || 3000; // Render uses dynamic ports
const NODE_ENV = process.env.NODE_ENV || 'development';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? 
  process.env.ALLOWED_ORIGINS.split(',') : 
  ['http://localhost:4200', 'http://localhost:49430'];

// Add your deployed frontend URL here when you have it
if (NODE_ENV === 'production') {
  // Add your production frontend URLs
  ALLOWED_ORIGINS.push(
    'https://livestreaming-eight.vercel.app'
  );
}

console.log('Allowed origins:', ALLOWED_ORIGINS);
console.log('Environment:', NODE_ENV);
console.log('Port:', PORT);

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    console.log('Request origin:', origin);
    console.log('Allowed origins:', ALLOWED_ORIGINS);
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      console.log('Origin allowed:', origin);
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static("express"));

let broadcaster;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const server = http.createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'], // Ensure both transports work
  allowEIO3: true // Backward compatibility
});

let authtoken = "";

app.post("/get-token", async function (req, res, next) {
  try {
    let authToken = req.body.authToken;
    let postData = {
      applicant_id: req.body.applicant_id,
    };

    let axiosConfig = {
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Access-Control-Allow-Origin": "*",
        Accept: "application/json",
        Authorization: `${authToken}`,
      },
    };

    const response = await axios
      .post("https://api.onfido.com/v3/sdk_token", postData, axiosConfig)
      .then((res) => {
        return res;
      })
      .catch((err) => {
        return err;
      });

    if (response.data) {
      res.json({
        msg: "token received successfully",
        token: response.data.token,
      });
    } else {
      res.json({
        msg: "token error",
        err: response.response?.data?.error || 'Unknown error',
      });
    }
  } catch (error) {
    console.error('Error in /get-token:', error);
    res.status(500).json({
      msg: "Internal server error",
      err: error.message
    });
  }
});

// Health check endpoint for Render
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    port: PORT,
    environment: NODE_ENV
  });
});

app.use(express.static(__dirname + "/public"));

const broadcasters = new Map();

io.sockets.on("error", (e) => console.log('Socket error:', e));

io.sockets.on("connection", (socket) => {
  console.log('New connection:', socket.id);

  socket.on("testchatroom", (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  socket.on("announce-broadcaster", (broadcaster, AuthToken) => {
    authtoken = AuthToken;
    broadcasters.set(socket.id, true);
    broadcaster = socket.id;
    console.log(`Broadcaster ${socket.id} announced availability`);
    socket.emit("broadcaster-id", broadcaster);
  });

  socket.on("request-broadcasters", () => {
    const broadcastersList = Array.from(broadcasters.keys());
    socket.emit("broadcasters-list", broadcastersList);
  });

  socket.on("join-broadcast", (broadcasterId) => {
    socket.join(broadcasterId);
    console.log(
      `Viewer ${socket.id} joined broadcast of Broadcaster ${broadcasterId}`
    );
  });

  socket.on("watcher", (broadcasterId) => {
    if (broadcasters.has(broadcasterId)) {
      socket.to(broadcasterId).emit("watcher", socket.id);
      console.log(
        `Viewer ${socket.id} joined broadcast of Broadcaster ${broadcasterId}`
      );
    }
  });

  socket.on("test", (message) => {
    console.log('Test message:', message);
    socket.emit("test", message);
  });

  socket.on("product StateChange", (message) => {
    console.log('Product state change:', message.products);
    io.to(message.roomId).emit("product StateChange", {
      id: socket.id,
      message,
    });
  });

  socket.on("chat message", (message) => {
    console.log(`Chat message in room ${message.roomId} from ${socket.id}`);
    // Uncomment the next line if you want to send messages to external API
    // sendMessageEndpoint(message);
    io.to(message.roomId).emit("chat message", { id: socket.id, message });
  });

  socket.on("offer", (id, message) => {
    console.log("Offer triggers", id, socket.id);
    socket.to(id).emit("offer", socket.id, message);
  });

  socket.on("answer", (id, message) => {
    console.log("Answer triggers", id, socket.id);
    socket.to(id).emit("answer", socket.id, message);
  });

  socket.on("candidate", (id, message) => {
    console.log("Candidate triggers", id, socket.id);
    socket.to(id).emit("candidate", socket.id, message);
  });

  socket.on("custom-event", (map, message) => {
    console.log("Custom event triggers");
    io.to(map.socketID).emit("custom-event", map.data);
  });

  socket.on("create-offer", (map, message) => {
    console.log("Create offer triggers");
    console.log("descriptions", map.description);
    console.log("socketID", map.socketID);
    io.to(map.socketID).emit("create-offer", map.description);
  });

  socket.on("create-answer", (map, message) => {
    console.log("Create answer triggers");
    io.to(map.socketID).emit("create-answer", map.description);
  });

  socket.on("create-candidate", (map, message) => {
    console.log("Create candidate triggers");
    io.to(map.socketID).emit("create-candidate", map.iceCandidate);
  });

  socket.on("customDisconnect", (customData) => {
    console.log("Disconnecting with custom data:", customData);
  });

  socket.on("disconnect", (reason) => {
    console.log(`Socket ${socket.id} disconnected:`, reason);
    if (broadcasters.has(socket.id)) {
      console.log('Broadcaster disconnected:', broadcasters);
      broadcasters.delete(socket.id);
      // callEndpoint(socket.id); // Uncomment if you want to call external API
      console.log(`Broadcaster ${socket.id} is no longer available`);
      let val = `Broadcaster ${socket.id} is no longer available`;
      io.emit("isAvailable", val);
      updateBroadcastersList();
    } else {
      socket.broadcast.emit("disconnectPeer", socket.id);
    }
  });
});

function updateBroadcastersList() {
  const broadcastersList = Array.from(broadcasters.keys());
  io.emit("broadcasters-list", broadcastersList);
}

async function callEndpoint(data) {
  try {
    let postData = {
      roomId: data,
    };
    
    let axiosConfig = {
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        Accept: "application/json",
        Authorization: `${authtoken}`,
      },
    };

    const response = await axios
      .post(
        "https://uat-apps.paysky.io/sc-authenticator/Tenant/Streaming/StopStream",
        postData,
        axiosConfig
      )
      .then((res) => {
        console.log("RESPONSE RECEIVED: ", res.data);
        return res;
      })
      .catch((err) => {
        console.log("AXIOS ERROR: ", err.message);
        return err;
      });
  } catch (error) {
    console.error('Error in callEndpoint:', error);
  }
}

async function sendMessageEndpoint(data) {
  try {
    if (data.authToken) {
      authtoken = data.authToken;
    }

    let postData = {
      streamId: data.room,
      roomId: data.roomId,
      streamMessages: [
        {
          userName: data.userName,
          message: data.message,
        },
      ],
    };

    let axiosConfig = {
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        Accept: "application/json",
        Authorization: `${authtoken}`,
      },
    };

    const response = await axios
      .post(
        "https://uat-apps.paysky.io/sc-authenticator/Tenant/StreamMessages/AddStreamMessages",
        postData,
        axiosConfig
      )
      .then((res) => {
        console.log("RESPONSE RECEIVED: ", res.data);
        return res;
      })
      .catch((err) => {
        console.log("AXIOS ERROR: ", err.message);
        return err;
      });
  } catch (error) {
    console.error('Error in sendMessageEndpoint:', error);
  }
}

app.get("/", function (req, res) {
  res.json({ 
    message: "Socket server is live",
    environment: NODE_ENV,
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
});

console.debug("Server listening on port " + PORT);
