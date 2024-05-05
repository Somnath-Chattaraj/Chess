// import WebSocket,{ WebSocketServer } from "ws";
// import { GameManager } from "./GameManager";

// const wss = new WebSocketServer({ port: 8081 });

// const gameManager = new GameManager();
// let userConnected = 0;

// wss.on("connection", (ws) => {
    
//     gameManager.addUser(ws);
//     ws.on("message", (data, isBinary) => {
//         console.log('receiveed: %s',data);
//     })
//     console.log("New user connected", ++userConnected);
//     ws.on('disconnect', () => gameManager.removeUser(ws))
// });

import { WebSocketServer } from 'ws';
import { GameManager } from './GameManager';


const wss = new WebSocketServer({ port: 8081 });

const gameManager = new GameManager();

wss.on('connection', function connection(ws) {
  gameManager.addUser(ws);

  ws.on('disconnect', () => gameManager.removeUser(ws));
});

console.log('done');