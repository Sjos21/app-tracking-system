import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

// Connection configuration with retry logic
const MAX_RETRY_ATTEMPTS = 5;
const INITIAL_RETRY_DELAY = 5000; // 5 seconds
let retryAttempts = 0;
let isConnecting = false;
let reconnectTimeout = null;

// Set up connection event handlers once (outside of connectDB function)
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err.message);
  if (err.message.includes('ENOTFOUND')) {
    console.error('   🔍 DNS Resolution Error: Cannot resolve MongoDB hostname.');
  }
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected.');
  // Only attempt reconnect if we're not already trying to connect
  if (!isConnecting && mongoose.connection.readyState === 0) {
    console.warn('   🔄 Scheduling reconnection attempt...');
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    reconnectTimeout = setTimeout(() => {
      retryAttempts = 0; // Reset retry attempts for reconnection
      connectDB();
    }, INITIAL_RETRY_DELAY);
  }
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected successfully');
  retryAttempts = 0;
  isConnecting = false;
});

mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB connected successfully');
  retryAttempts = 0;
  isConnecting = false;
});

const connectDB = async () => {
  // Prevent multiple simultaneous connection attempts
  if (isConnecting) {
    console.log('⏳ Connection attempt already in progress...');
    return;
  }

  // Check if already connected
  if (mongoose.connection.readyState === 1) {
    console.log('✅ Database already connected');
    return;
  }

  // Check if MONGODB_URL is provided
  if (!process.env.MONGODB_URL) {
    console.error("❌ ERROR: MONGODB_URL environment variable is not set!");
    console.error("Please set MONGODB_URL in your Render environment variables.");
    console.error("   Go to: Render Dashboard → Your Service → Environment → Add MONGODB_URL");
    return;
  }

  isConnecting = true;

  // MongoDB connection options for better reliability
  const options = {
    serverSelectionTimeoutMS: 10000, // How long to try selecting a server (10 seconds)
    socketTimeoutMS: 45000, // How long to wait for a socket connection (45 seconds)
    connectTimeoutMS: 10000, // How long to wait for initial connection (10 seconds)
    retryWrites: true, // Retry write operations on network errors
    maxPoolSize: 10, // Maximum number of connections in the connection pool
    minPoolSize: 2, // Minimum number of connections in the connection pool
    maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
    heartbeatFrequencyMS: 10000, // How often to check connection status
  };

  try {
    await mongoose.connect(process.env.MONGODB_URL, options);
    // Success will be handled by the 'connected' event
    isConnecting = false;
  } catch (error) {
    isConnecting = false;
    retryAttempts++;
    
    console.error(`❌ Error connecting to database (Attempt ${retryAttempts}/${MAX_RETRY_ATTEMPTS}):`);
    console.error(`   Error: ${error.message}`);
    
    // Provide helpful error messages based on error type
    if (error.message.includes('ENOTFOUND')) {
      console.error('   🔍 DNS Resolution Error: Cannot resolve MongoDB hostname.');
      console.error('   💡 Check if MONGODB_URL is correct and MongoDB Atlas cluster is running.');
      console.error('   💡 For MongoDB Atlas free tier, ensure the cluster is not paused.');
    } else if (error.message.includes('authentication failed') || error.message.includes('bad auth')) {
      console.error('   🔐 Authentication Error: Invalid MongoDB credentials.');
      console.error('   💡 Check your MongoDB username and password in MONGODB_URL.');
    } else if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
      console.error('   ⏱️ Connection Timeout: MongoDB server did not respond in time.');
      console.error('   💡 Check your network connection and MongoDB Atlas firewall settings.');
      console.error('   💡 Ensure Render\'s IP is whitelisted in MongoDB Atlas (or use 0.0.0.0/0 for all IPs).');
    } else if (error.message.includes('IP not whitelisted')) {
      console.error('   🛡️ IP Whitelist Error: Render server IP is not whitelisted in MongoDB Atlas.');
      console.error('   💡 Go to MongoDB Atlas → Network Access → Add IP Address (or use 0.0.0.0/0).');
    }

    // Retry connection if attempts haven't exceeded max
    if (retryAttempts < MAX_RETRY_ATTEMPTS) {
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryAttempts - 1); // Exponential backoff: 5s, 10s, 20s, 40s, 80s
      console.log(`   🔄 Retrying connection in ${delay / 1000} seconds...`);
      
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      reconnectTimeout = setTimeout(() => {
        connectDB();
      }, delay);
    } else {
      console.error(`   ❌ Max retry attempts (${MAX_RETRY_ATTEMPTS}) reached.`);
      console.error('   ⚠️ Server will continue running, but database operations will fail.');
      console.error('   💡 Please check your MongoDB connection and environment variables.');
      console.error('   💡 You can restart the server to retry the connection.');
      // Don't exit the process - allow server to continue running
      // The server can still serve static content or return appropriate error messages
    }
  }
};

export default connectDB;