"""
chat_app.py - Main application with Flask API and LLM integration
"""

import tkinter as tk
import threading
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from flask import Flask, jsonify

# Import configuration
from chatGUI.config import (
    API_HOST, API_PORT, DEFAULT_SYSTEM_PROMPT, CONTEXT_LIMIT
)

# Import GUI
from chatGUI.chat_gui import ChatGUI

# Import your existing modules
from server.config import api_mode
from utils.llm_calls import query
from utils.context_data import get_recent_context, save_conversation

# ============================================================================
# GLOBAL STATE
# ============================================================================

# Store last conversation exchange
LAST_EXCHANGE: Dict[str, str] = {
    "user_input": "",
    "ai_response": "",
    "timestamp": ""
}

# Thread safety for LLM calls
LLM_LOCK = threading.Lock()

# ============================================================================
# LLM INTERFACE
# ============================================================================

def llm_infer(
    text: str,
    project: str,
    model: str,
    mode: str,
    system_prompt: Optional[str] = None
) -> str:
    """
    Make an inference call to the LLM with conversation context.
    
    Args:
        text: User input text
        project: Project name for context storage
        model: Model identifier
        mode: API mode (local/cloudflare/openai)
        system_prompt: Optional system prompt
        
    Returns:
        AI response text
    """
    with LLM_LOCK:
        # Initialize API client
        client, completion_model, _ = api_mode(mode, model)
        
        # Get recent conversation context
        context = get_recent_context(project, limit=CONTEXT_LIMIT)
        
        # Build full prompt with context
        if context:
            context_str = "\n".join([
                f"User: {user}\nAssistant: {assistant}" 
                for user, assistant in context
            ])
            full_prompt = (
                f"Previous conversation:\n{context_str}\n\n"
                f"User: {text}"
            )
        else:
            full_prompt = text
        
        # Query LLM
        response = query(
            client,
            completion_model,
            full_prompt,
            system_prompt=system_prompt
        )
        
        # Save conversation
        save_conversation(project, text, response)
        
        # Update last exchange
        LAST_EXCHANGE.update({
            "user_input": text,
            "ai_response": response,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        })
        
        return response

# ============================================================================
# FLASK API SERVER
# ============================================================================

# Suppress Flask's verbose logging
logging.getLogger("werkzeug").setLevel(logging.ERROR)

# Create Flask app
app = Flask(__name__)

@app.get("/health")
def health() -> Dict[str, Any]:
    """Health check endpoint."""
    return jsonify({
        "ok": True,
        "service": "chat-ui",
        "port": API_PORT
    })

@app.get("/last")
def last() -> Dict[str, str]:
    """Get the last conversation exchange."""
    return jsonify(LAST_EXCHANGE)

def run_api() -> None:
    """Run the Flask API server in a separate thread."""
    app.run(
        host=API_HOST,
        port=API_PORT,
        debug=False,
        use_reloader=False,
        threaded=True
    )

# ============================================================================
# MAIN APPLICATION
# ============================================================================

class ChatApplication:
    """Main application controller."""
    
    def __init__(self):
        """Initialize the application."""
        # Start Flask API server in background
        self.start_api_server()
        
        # Create and run GUI
        self.create_gui()
    
    def start_api_server(self) -> None:
        """Start the Flask API server in a background thread."""
        api_thread = threading.Thread(target=run_api, daemon=True)
        api_thread.start()
        print(f"API server started on http://{API_HOST}:{API_PORT}")
    
    def create_gui(self) -> None:
        """Create and run the GUI."""
        self.root = tk.Tk()
        
        # Create GUI with message processor callback
        self.gui = ChatGUI(
            self.root,
            message_processor=self.process_message
        )
        
        # Start the GUI event loop
        self.root.mainloop()
    
    def process_message(
        self,
        text: str,
        project: str,
        model: str,
        mode: str,
        system_prompt: Optional[str]
    ) -> str:
        """
        Process a message through the LLM.
        
        Args:
            text: User input text
            project: Project name
            model: Model identifier
            mode: API mode
            system_prompt: Optional system prompt
            
        Returns:
            AI response text
        """
        return llm_infer(
            text,
            project,
            model,
            mode,
            system_prompt or DEFAULT_SYSTEM_PROMPT
        )

# ============================================================================
# ENTRY POINT
# ============================================================================

def main():
    """Main entry point for the application."""
    app = ChatApplication()

if __name__ == "__main__":
    main()