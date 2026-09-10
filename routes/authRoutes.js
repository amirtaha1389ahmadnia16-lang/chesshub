const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const logger = require("../utils/logger");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "chesshub-super-secret-dev-key";

// مسیر ثبت‌نام
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // بررسی اینکه آیا کاربر قبلاً وجود دارد یا نه
    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res
        .status(400)
        .json({ message: "این ایمیل یا نام کاربری قبلاً ثبت شده است." });
    }

    // ساخت کاربر جدید
    const user = await User.create({
      username,
      email,
      password,
    });

    // ساخت توکن JWT
    const token = jwt.sign(
      { id: user._id, username: user.username },
      JWT_SECRET,
      {
        expiresIn: "30d",
      },
    );

    res.status(201).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      rating: user.rating,
      token,
    });
  } catch (error) {
    logger.error(`Register Error: ${error.message}`);
    res.status(500).json({ message: "خطای سرور هنگام ثبت‌نام." });
  }
});

// مسیر ورود
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // پیدا کردن کاربر با ایمیل
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "ایمیل یا رمز عبور اشتباه است." });
    }

    // بررسی رمز عبور
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "ایمیل یا رمز عبور اشتباه است." });
    }

    // ساخت توکن JWT
    const token = jwt.sign(
      { id: user._id, username: user.username },
      JWT_SECRET,
      {
        expiresIn: "30d",
      },
    );

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      rating: user.rating,
      token,
    });
  } catch (error) {
    logger.error(`Login Error: ${error.message}`);
    res.status(500).json({ message: "خطای سرور هنگام ورود." });
  }
});

module.exports = router;
