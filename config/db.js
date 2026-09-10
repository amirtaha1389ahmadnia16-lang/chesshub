const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // در اینجا آدرس دیتابیس خود را وارد کن (لوکال یا Atlas)
    const mongoURI =
      process.env.MONGO_URI || "mongodb://localhost:27017/chesshub";

    const conn = await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
