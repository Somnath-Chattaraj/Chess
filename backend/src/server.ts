import express from "express";
import { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import "dotenv/config";


const app = express();

app.use(cors(
    {
        origin: "http://localhost:3000",
        credentials: true,
    }
));
app.use(cookieParser());

app.get("/api/v1", (req: Request, res: Response) => {
    res.send("Hello World");
})

app.listen(3000,() => {
    console.log("Server is running on port 3000");
})
