
import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
interface UserSignup {
    username :string,
    email: string,
    password: string
}
interface UserLogin {
    username :string,
    password: string
}
export const signup = asyncHandler (async(req: Request, res: Response) => {
    const user: UserSignup = req.body;
    if (!user.username || !user.email || !user.password) {
        res.status(400).json({message: "Please provide username, email and password"})
    }
    const hashedPassword = await bcrypt.hash(user.password, 10);
    try {

        const response = await prisma.user.create({
            data: {
                username: user.username,
                email: user.email,
                password: hashedPassword
            }
        })
        res.status(201).json(response);
    } catch (error:any) {
        res.status(500).json({message: error.message})
    }

});

export const login = asyncHandler (async(req: Request, res: Response) => {
    const user: UserLogin = req.body;
    if (!user.username || !user.password) {
        res.status(400).json({message: "Please provide username and password"})
    }
    try {
        const response = await prisma.user.findUnique({
            where: {
                username: user.username
            }
        })
        if (response) {
            if (response.password === user.password) {
                const token = jwt.sign({username: response.username}, process.env.JWT_SECRET as string, {expiresIn: '1h'})
                res.status(200).json({message: "Login successful", token})
            } else {
                res.status(401).json({message: "Invalid username or password"})
            }
        } else {
            res.status(401).json({message: "Invalid username or password"})
        }
    } catch (error:any) {
        res.status(500).json({message: error.message})
    }
})