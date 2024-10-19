import express from "express";
import { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import "dotenv/config";


const app = express();
const corsOptions = {
    origin: [
      "http://localhost:3001",
      "http://localhost:5173"
    ],
    credentials: true,
  };
app.use(cors(corsOptions));
app.use(cookieParser());

app.get("/api/v1", (req: Request, res: Response) => {
    res.send("Hello World");
})

app.listen(3000,() => {
    console.log("Server is running on port 3000");
})
