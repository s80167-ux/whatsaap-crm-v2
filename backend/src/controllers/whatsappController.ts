import express from "express";
import { getQrCode } from "../whatsapp/qrCodeStore.js";

export const whatsappController = {
  async getQrCode(req: express.Request, res: express.Response) {
    const { id } = req.params;
    const qr = getQrCode(id);
    if (!qr) {
      return res.status(404).json({ error: "QR code not available" });
    }
    res.json({ qr });
  }
};
