import { Router } from "express";
import { getConversations } from "../controllers/conversationController.js";

export const conversationRoutes = Router();

conversationRoutes.get("/", getConversations);
