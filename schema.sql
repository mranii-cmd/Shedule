-- Minimal schema for EDT API (MySQL)
-- Run once to create DB objects (or let server create tables automatically)

CREATE DATABASE IF NOT EXISTS edt_db CHARACTER SET = 'utf8mb4' COLLATE = 'utf8mb4_unicode_ci';
USE edt_db;

CREATE TABLE IF NOT EXISTS global_data (
  id INT PRIMARY KEY DEFAULT 1,
  data JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  name VARCHAR(191) PRIMARY KEY,
  data JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Optional normalized tables to be added later:
-- teachers, subjects, rooms, exam_room_configs, users, etc.