import { useEffect, useState } from "react";


export const useSocket = () => {
    const [socket, setSocket] = useState<WebSocket | null>(null);

    useEffect(() => {
        const ws = new WebSocket(import.meta.env.VITE_WEBSOCKET_URL);
        ws.onopen = () => {
            console.log("Connected to server");
        };
        ws.onclose = () => {
            console.log("Disconnected from server");
        };
        setSocket(ws);
        return () => {
            ws.close();
        };
    }, []);

    return socket
}