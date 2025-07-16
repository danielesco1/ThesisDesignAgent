from datetime import datetime
import sqlite3
import os

DB_PATH = 'conversations.db'

def init_db():
    """Initialize the database with conversations table"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS conversations
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id TEXT,
                  message TEXT,
                  response TEXT,
                  timestamp DATETIME)''')
    conn.commit()
    conn.close()

def save_conversation(user_id, message, response):
    """Save a conversation to the database"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''INSERT INTO conversations 
                 (user_id, message, response, timestamp) 
                 VALUES (?, ?, ?, ?)''', 
              (user_id, message, response, datetime.now()))
    conn.commit()
    conn.close()

def get_recent_context(user_id, limit=10):
    """Get recent conversation history for a user"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''SELECT message, response FROM conversations 
                 WHERE user_id = ? 
                 ORDER BY timestamp DESC LIMIT ?''', 
              (user_id, limit))
    result = c.fetchall()
    conn.close()
    return result[::-1]  # Reverse for chronological order

# Initialize database on import
init_db()