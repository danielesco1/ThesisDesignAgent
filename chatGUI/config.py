"""
config.py - Configuration settings for the Chat Assistant
"""

from typing import Optional

# ============================================================================
# APPLICATION SETTINGS
# ============================================================================

APP_TITLE = "Chat Assistant"
WINDOW_SIZE = "820x660"

# ============================================================================
# API SETTINGS
# ============================================================================

API_HOST = "127.0.0.1"
API_PORT = 5000

# ============================================================================
# DEFAULT VALUES
# ============================================================================

DEFAULT_PROJECT_NAME = "default"
DEFAULT_RUN_MODE = "local"
DEFAULT_SYSTEM_PROMPT: Optional[str] = None

# ============================================================================
# GRASSHOPPER INTEGRATION
# ============================================================================

DEFAULT_GH_URL = "http://127.0.0.1:8081"
DEFAULT_AUTO_PUSH = True
GH_TIMEOUT_SECONDS = 1.5

# ============================================================================
# UI THEME
# ============================================================================

DARK_THEME = {
    "bg": "#0f1115",
    "card": "#111827",
    "field": "#0b1220",
    "fg": "#e5e7eb",
    "muted": "#94a3b8",
    "select": "#3b82f6",
    "user_bg": "#2563eb",
    "assistant_bg": "#1f2937",
    "error": "#f87171",
    "white": "#ffffff"
}

# ============================================================================
# TEXT DISPLAY SETTINGS
# ============================================================================

CHAT_FONT = ("Arial", 10)
INPUT_FONT = ("Arial", 12)
TEXT_MARGINS = 6  # pixels for text margin

# ============================================================================
# CONVERSATION SETTINGS
# ============================================================================

CONTEXT_LIMIT = 2  # Number of previous exchanges to include
TIME_FORMAT = "%H:%M"  # Format for message timestamps