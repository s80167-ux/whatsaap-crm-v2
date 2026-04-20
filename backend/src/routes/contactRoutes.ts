import { Router } from "express";
import { getContacts } from "../controllers/contactController.js";

export const contactRoutes = Router();

contactRoutes.get("/", getContacts);
