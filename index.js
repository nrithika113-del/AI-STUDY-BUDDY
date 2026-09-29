require("dotenv").config();
require("express-async-errors");

const express = require("express");
const cors = require("cors");
const connectDB = require("./src/utils/db");
const fs = require("fs");

const app = express();

// Create uploads folder
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

// Middleware
app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:5500",
      "http://127.0.0.1:5500",
      "http://localhost:3000"
    ],
  })
);
// Routes
app.use("/api/auth", require("./src/routes/auth"));
app.use("/api/materials", require("./src/routes/materials"));

// Health check
app.get("/", (req, res) => {
  res.json({
    message: "AI StudyBuddy API is running",
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);

  const status = err.status || 500;

  res.status(status).json({
    message: err.message || "Something went wrong",
  });
});

// Start server
const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database connection failed:", err.message);

    // Start server even if database connection fails
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log("Database is not connected yet.");
    });
  });