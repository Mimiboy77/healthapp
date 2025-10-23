const mongoose = require('mongoose');
require('dotenv').config(); // Ensure .env variables are loaded

const connectDB = async () => {
  try {
    // Make sure your .env has MONGO_URI including database name
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI is not defined in .env");

    await mongoose.connect(uri); // No deprecated options needed
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    process.exit(1); // Exit the app if DB connection fails
  }
};

module.exports = connectDB;
