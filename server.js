const http = require("http");
const express = require("express");
const cors = require("cors");
const app = express();
const axios = require("axios");
app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());
app.use(express.static("express"));
let broadcaster;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const server = http.createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
  },
  methods: ['GET', 'POST']
});
let authtoken = "";
app.post("/get-token", cors(), async function (req, res, next) {
  // console.log('test api',req.body.applicant_id)
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
      // console.log("RESPONSE RECEIVED: ", res.data);
      return res;
    })
    .catch((err) => {
      return err;
      // console.log("AXIOS ERROR: ", err);
    });
  if (response.data) {
    res.json({
      msg: "token received successfully",
      token: response.data.token,
    });
  } else {
    // console.log("issue",response.response.data.error);
    res.json({
      msg: "token received successfully",
      err: response.response.data.error,
    });
  }
});
app.use(express.static(__dirname + "/public"));
var whitelist = ["http://localhost:4200","http://localhost:49430"];
var corsOptionsDelegate = function (req, callback) {
  var corsOptions;
  if (whitelist.indexOf(req.header("Origin")) !== -1) {
    corsOptions = { origin: true }; // reflect (enable) the requested origin in the CORS response
  } else {
    corsOptions = { origin: false }; // disable CORS for this request
  }
  callback(null, corsOptions); // callback expects two parameters: error and options
};
const broadcasters = new Map();
io.sockets.on("error", (e) => console.log(e));
io.sockets.on("connection", (socket) => {
  // socket.on("broadcaster", () => {
  //   // socket.broadcast.emit("broadcaster");
  //   console.log('broadcaster trigger');
  // });
  socket.on("testchatroom", (roomId) => {
    socket.join(roomId);
  });
  socket.on("announce-broadcaster", (broadcaster, AuthToken) => {
    authtoken = AuthToken;
    broadcasters.set(socket.id, true);
    // console.log(authtoken, "broadcaster");
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
    console.log('umer',message);
    socket.emit("test", message);

  });
  socket.on("product StateChange", (message) => {
    // Broadcast the product list to all connected clients
    console.log(message.products);
    io.to(message.roomId).emit("product StateChange", {
      id: socket.id,
      message,
    });
  });
  socket.on("chat message", (message) => {
    // Broadcast the message to all connected clients
    console.log(message.roomId, socket.id, message.room);
    // sendMessageEndpoint(message);
    io.to(message.roomId).emit("chat message", { id: socket.id, message });
  });
  socket.on("offer", (id, message) => {
    console.log(id, broadcaster);
    console.log("offer triggers", id, socket.id);

    socket.to(id).emit("offer", socket.id, message);
  });
  socket.on("answer", (id, message) => {
    console.log("answer triggers", id, socket.id);

    socket.to(id).emit("answer", socket.id, message);
  });
  socket.on("candidate", (id, message) => {
    console.log("candidate triggers", id, socket.id);

    socket.to(id).emit("candidate", socket.id, message);
  });
  socket.on("custom-event", (map, message) => {
    console.log("candidate triggers");
    io.to(map.socketID).emit("custom-event", map.data);
  });
    socket.on("create-offer", (map, message) => {
    // console.log(map, map.socketID);
    console.log("offer triggers");
    console.log("descriptions", map.description);
    console.log("socketID", map.socketID);
    io.to(map.socketID).emit("create-offer", map.description);

    // socket.emit("offer", map);
  });
  socket.on("create-answer", (map, message) => {
    console.log("answer triggers");

    io.to(map.socketID).emit("create-answer", map.description);
  });
  socket.on("create-candidate", (map, message) => {
    console.log("candidate triggers");

    io.to(map.socketID).emit("create-candidate", map.iceCandidate);
  });
  socket.on("disconnect", (id) => {
    socket.to(id).emit("disconnectPeer", socket.id);
  });
  socket.on("customDisconnect", (customData) => {
    console.log("Disconnecting with custom data:", customData);
  });
  socket.on("disconnect", (id, data) => {
    console.log(`Socket ${socket.id} disconnected`, data);
    if (broadcasters.has(socket.id)) {
      console.log(broadcasters,"broadcaster listing");
      broadcasters.delete(socket.id);
      // callEndpoint(socket.id)
      console.log(`Broadcaster ${socket.id} is no longer available`);
      let val = `Broadcaster ${socket.id} is no longer available`;
      io.emit("isAvailable", val);
      updateBroadcastersList();
    } else {
      socket.to(id).emit("disconnectPeer", socket.id);
    }
  });
});

function updateBroadcastersList() {
  const broadcastersList = Array.from(broadcasters.keys());
  io.emit("broadcasters-list", broadcastersList);
}
async function callEndpoint(data) {
  // let authToken = req.body.authToken
  let axiosConfig;
  let postData = {
    roomId: data,
  };
  if (authtoken) {
    axiosConfig = {
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        Accept: "application/json",
        Authorization: `${authtoken}`,
      },
    };
  }

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
      console.log("AXIOS ERROR: ", err);
      return err;
    });
}
async function sendMessageEndpoint(data) {
  if (data.authToken) {
    // console.log(data.authToken);
    authtoken = data.authToken;
  }
  // let authToken = req.body.authToken
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
      console.log("AXIOS ERROR: ", err);
      return err;
    });
}

app.get("/", function (req, res) {
  console.log("link is live");
  //__dirname : It will resolve to your project folder.
});

const port = 80;
server.listen(port, cors(corsOptionsDelegate), () =>
  console.log(`Server is running on port ${port}`)
);
console.debug("Server listening on port " + port);
