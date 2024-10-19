import express from 'express'
import { login, signup } from '../controller/userController'


export const userRouter = express.Router()

userRouter.route('/login').post(login);
userRouter.route('/signup').post(signup);
