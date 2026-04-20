import { Router } from "express";
import { getMessages, sendWhatsAppMessage } from "../controllers/messageController.js";

export const messageRoutes = Router();

messageRoutes.get("/:conversation_id", getMessages);
