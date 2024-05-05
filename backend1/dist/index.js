"use strict";
// import WebSocket,{ WebSocketServer } from "ws";
// import { GameManager } from "./GameManager";
Object.defineProperty(exports, "__esModule", { value: true });
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
const ws_1 = require("ws");
const GameManager_1 = require("./GameManager");
const wss = new ws_1.WebSocketServer({ port: 8081 });
const gameManager = new GameManager_1.GameManager();
wss.on('connection', function connection(ws) {
    gameManager.addUser(ws);
    ws.on('disconnect', () => gameManager.removeUser(ws));
});
console.log('done');
