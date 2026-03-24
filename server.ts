import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import { spawn, execSync } from "child_process";
import { Server } from "socket.io";
import http from "http";

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = 3000;
  const PYTHON_ENGINE_URL = "http://localhost:8000";

  // WebSocket Logic for Jam Mode
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", (roomId) => {
      socket.join(roomId);
      console.log(`User ${socket.id} joined room ${roomId}`);
    });

    socket.on("sync-state", (data) => {
      // Broadcast state to others in the room
      socket.to(data.roomId).emit("state-updated", data.state);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // 0. Start Python DSP Engine
  console.log("Starting Python DSP Engine...");
  try {
    // Attempt to install requirements if needed (optional, depends on environment)
    // execSync("pip install -r backend/requirements.txt", { stdio: 'inherit' });
    
    const pythonProcess = spawn("python3", ["-m", "backend.loop_engine.api"], {
      stdio: "inherit",
      env: { ...process.env, PYTHONPATH: process.cwd() }
    });

    pythonProcess.on("error", (err) => {
      console.error("Failed to start Python DSP Engine:", err);
    });

    process.on("exit", () => {
      pythonProcess.kill();
    });
  } catch (err) {
    console.error("Error initializing Python engine:", err);
  }

  // Configure Multer for temporary file storage
  const upload = multer({ dest: "uploads/" });

  // Ensure uploads directory exists
  if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads");
  }

  // 1. Loop Analysis Proxy Endpoint
  app.post("/api/analyze-loop", upload.single("file"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      // Prepare form data for Python API
      const formData = new FormData();
      formData.append("file", fs.createReadStream(req.file.path), {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      // Call Python DSP Engine
      const response = await axios.post(`${PYTHON_ENGINE_URL}/analyze`, formData, {
        headers: {
          ...formData.getHeaders(),
        },
      });

      // Clean up temporary file
      fs.unlinkSync(req.file.path);

      res.json(response.data);
    } catch (error) {
      console.error("Loop Analysis Error:", error);
      
      // Clean up temporary file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({ 
        error: "DSP Engine Error", 
        details: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // 2. MIDI Extraction Proxy
  app.post("/api/extract-midi", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      const formData = new FormData();
      formData.append("file", fs.createReadStream(req.file.path), {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      const response = await axios.post(`${PYTHON_ENGINE_URL}/extract-midi`, formData, {
        headers: { ...formData.getHeaders() },
      });

      fs.unlinkSync(req.file.path);
      res.json(response.data);
    } catch (error) {
      console.error("MIDI Extraction Error:", error);
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: "MIDI Extraction Failed" });
    }
  });

  // 3. Stem Separation Proxy
  app.post("/api/split-stems", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      const formData = new FormData();
      formData.append("file", fs.createReadStream(req.file.path), {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      const response = await axios.post(`${PYTHON_ENGINE_URL}/split-stems`, formData, {
        headers: { ...formData.getHeaders() },
      });

      fs.unlinkSync(req.file.path);
      res.json(response.data);
    } catch (error) {
      console.error("Stem Separation Error:", error);
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: "Stem Separation Failed" });
    }
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
