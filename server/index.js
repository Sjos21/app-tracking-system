import express from "express";
import dotenv from "dotenv";
import connectDB from "./config/connectDB.js";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";

const app = express();
dotenv.config();
const port = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(cors());
app.use(cookieParser());

// Database connection status middleware
const checkDatabaseConnection = (req, res, next) => {
  if (mongoose.connection.readyState === 1) {
    // Connection is open and ready
    next();
  } else if (mongoose.connection.readyState === 2) {
    // Connection is connecting
    res.status(503).json({
      error: "Database is connecting. Please try again in a moment.",
      status: "connecting"
    });
  } else {
    // Connection is not established (0 = disconnected, 3 = disconnecting)
    res.status(503).json({
      error: "Database connection is not available. Please try again later.",
      status: "disconnected",
      message: "The server is running but cannot connect to the database. This may be temporary."
    });
  }
};

// Process-level error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process - log the error and continue
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // For uncaught exceptions, we might want to exit, but let's log first
  // In production, you might want to exit gracefully
});

// Database connection (non-blocking)
connectDB();

// Import routes
import jobRoutes from "./routes/jobRoutes.js";
import userRoutes from "./routes/userRoutes.js"
import applicationRoutes from "./routes/applicationRoutes.js"
import recruiterRoutes from "./routes/recruiterRoutes.js"
import fileUploadRoute from './routes/fileUploadRoute.js'
import Auth from './routes/Auth.js'

// Use routes
app.use("/jobs", jobRoutes);
app.use("/users", userRoutes);
app.use("/application", applicationRoutes);
app.use("/recruiter", recruiterRoutes);
app.use("/", fileUploadRoute);
app.use("/auth", Auth)


app.get("/health", (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const dbStatusText = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting"
  };
  
  res.json({
    status: "ok",
    server: "running",
    database: dbStatusText[dbStatus] || "unknown",
    timestamp: new Date().toISOString()
  });
});

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "App Tracking System API",
    status: "running",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

app.get("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    message: "The requested endpoint does not exist"
  });
}
);


app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  
  // Check if it's a database connection error
  if (err.name === 'MongooseError' || err.message.includes('MongoServerError')) {
    return res.status(503).json({
      error: "Database connection error",
      message: "The database is currently unavailable. Please try again later.",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
  
  res.status(500).json({
    error: "Internal server error",
    message: "An unexpected error occurred. Please try again later.",
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start the server
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
  console.log(`📍 Health check: http://localhost:${port}/health`);
  console.log(`🔗 Environment: ${process.env.NODE_ENV || 'development'}`);
});
