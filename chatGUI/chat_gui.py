"""
chat_gui.py - GUI components for the Chat Assistant
"""

import tkinter as tk
from tkinter import ttk, scrolledtext
import threading
import requests
from datetime import datetime
from typing import List, Callable

from chatGUI.config import (
    APP_TITLE, WINDOW_SIZE, DARK_THEME, CHAT_FONT, INPUT_FONT,
    TEXT_MARGINS, TIME_FORMAT, DEFAULT_PROJECT_NAME, DEFAULT_RUN_MODE,
    DEFAULT_GH_URL, DEFAULT_AUTO_PUSH, GH_TIMEOUT_SECONDS
)

# Import these from your existing modules
from server.config import COMPLETION_MODELS, DEFAULT_COMPLETION


class ChatGUI:
    """Main chat application GUI using Tkinter."""
    
    def __init__(self, root: tk.Tk, message_processor: Callable):
        """
        Initialize the chat GUI.
        
        Args:
            root: The Tkinter root window
            message_processor: Callback function to process messages
                              Should accept (message, project, mode, model, system_prompt)
        """
        self.root = root
        self.message_processor = message_processor
        
        self.setup_window()
        self.setup_variables()
        self.create_widgets()
        self.apply_dark_theme()
        self.setup_text_bindings()
        self.setup_context_menu()
        
        # Welcome message
        self.write_message(
            "Welcome! Pick Mode → Model, type a message, and press Enter.",
            "system"
        )
    
    # ========================================================================
    # INITIALIZATION METHODS
    # ========================================================================
    
    def setup_window(self) -> None:
        """Configure the main window."""
        self.root.title(APP_TITLE)
        self.root.geometry(WINDOW_SIZE)
    
    def setup_variables(self) -> None:
        """Initialize tkinter variables."""
        self.project = tk.StringVar(value=DEFAULT_PROJECT_NAME)
        self.mode = tk.StringVar(value=DEFAULT_RUN_MODE)
        self.model = tk.StringVar(value=self.get_default_model(DEFAULT_RUN_MODE))
        self.gh_url = tk.StringVar(value=DEFAULT_GH_URL)
        self.auto_push = tk.BooleanVar(value=DEFAULT_AUTO_PUSH)
    
    # ========================================================================
    # WIDGET CREATION
    # ========================================================================
    
    def create_widgets(self) -> None:
        """Create all GUI widgets."""
        self.create_control_bar()
        self.create_chat_display()
        self.create_input_area()
        self.create_status_bar()
    
    def create_control_bar(self) -> None:
        """Create the top control bar with settings."""
        bar = ttk.Frame(self.root, padding=10)
        bar.pack(fill=tk.X)
        
        # Project field
        ttk.Label(bar, text="Project").grid(row=0, column=0, sticky="w")
        ttk.Entry(
            bar, textvariable=self.project, width=18
        ).grid(row=1, column=0, sticky="we", padx=(0, 8))
        
        # Mode selector
        ttk.Label(bar, text="Mode").grid(row=0, column=1, sticky="w")
        self.mode_combo = ttk.Combobox(
            bar,
            textvariable=self.mode,
            values=self.get_available_modes(),
            state="readonly",
            width=12
        )
        self.mode_combo.grid(row=1, column=1, sticky="we", padx=(0, 8))
        self.mode_combo.bind("<<ComboboxSelected>>", self.on_mode_change)
        
        # Model selector
        ttk.Label(bar, text="Model").grid(row=0, column=2, sticky="w")
        self.model_combo = ttk.Combobox(
            bar,
            textvariable=self.model,
            values=self.get_models_for_mode(self.mode.get()),
            width=28
        )
        self.model_combo.grid(row=1, column=2, sticky="we", padx=(0, 8))
        
        # Grasshopper URL
        ttk.Label(bar, text="GH URL").grid(row=0, column=3, sticky="w")
        ttk.Entry(
            bar, textvariable=self.gh_url, width=26
        ).grid(row=1, column=3, sticky="we", padx=(0, 8))
        
        # Auto-push checkbox
        ttk.Checkbutton(
            bar, text="Auto-send to GH", variable=self.auto_push
        ).grid(row=1, column=4, sticky="w")
        
        # Configure column weights
        for col in range(5):
            bar.grid_columnconfigure(col, weight=1)
    
    def create_chat_display(self) -> None:
        """Create the main chat text display."""
        self.chat_text = scrolledtext.ScrolledText(
            self.root,
            wrap="word",
            font=CHAT_FONT,
            height=28
        )
        self.chat_text.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Configure text display
        self.chat_text.configure(
            cursor="xterm",
            takefocus=True,
            exportselection=True
        )
        
        # Configure text tags
        self.setup_text_tags()
    
    def setup_text_tags(self) -> None:
        """Configure text tags for different message types."""
        # User messages
        self.chat_text.tag_config(
            "user",
            foreground=DARK_THEME["white"],
            background=DARK_THEME["user_bg"],
            lmargin1=TEXT_MARGINS,
            lmargin2=TEXT_MARGINS,
            rmargin=TEXT_MARGINS
        )
        
        # Assistant messages
        self.chat_text.tag_config(
            "assistant",
            foreground=DARK_THEME["fg"],
            background=DARK_THEME["assistant_bg"],
            lmargin1=TEXT_MARGINS,
            lmargin2=TEXT_MARGINS,
            rmargin=TEXT_MARGINS
        )
        
        # System messages
        self.chat_text.tag_config("system", foreground=DARK_THEME["muted"])
        
        # Error messages
        self.chat_text.tag_config("error", foreground=DARK_THEME["error"])
        
        # Ensure selection is visible
        self.chat_text.tag_raise("sel")
    
    def create_input_area(self) -> None:
        """Create the message input area."""
        input_frame = ttk.Frame(self.root, padding=(10, 0, 10, 10))
        input_frame.pack(fill=tk.X)
        
        # Input entry
        self.entry = ttk.Entry(input_frame, font=INPUT_FONT)
        self.entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.entry.bind("<Return>", lambda e: self.send_message())
        self.entry.focus()
        
        # Send button
        self.send_button = ttk.Button(
            input_frame,
            text="Send",
            command=self.send_message
        )
        self.send_button.pack(side=tk.RIGHT, padx=(8, 0))
    
    def create_status_bar(self) -> None:
        """Create the status bar."""
        self.status_bar = tk.Label(
            self.root,
            text="Ready",
            bd=1,
            relief=tk.SUNKEN,
            anchor="w"
        )
        self.status_bar.pack(fill=tk.X, side=tk.BOTTOM)
    
    # ========================================================================
    # KEY BINDINGS AND INTERACTIONS
    # ========================================================================
    
    def setup_text_bindings(self) -> None:
        """Set up key bindings for read-only text with selection."""
        # Allow focus on click
        self.chat_text.bind(
            "<Button-1>",
            lambda e: (self.chat_text.focus_set(), None)
        )
        
        # Block editing while allowing navigation
        def block_edit_keys(event):
            nav_keys = {
                "Left", "Right", "Up", "Down",
                "Home", "End", "Prior", "Next"
            }
            
            ctrl = event.state & 0x4
            meta = event.state & 0x8  # Command on Mac
            
            if event.keysym in nav_keys:
                return
            
            if (ctrl or meta) and event.keysym.lower() in ("c", "a"):
                return
            
            return "break"
        
        self.chat_text.bind("<Key>", block_edit_keys)
        
        # Block specific editing operations
        edit_sequences = [
            "<Return>", "<BackSpace>", "<Delete>",
            "<Control-v>", "<Control-V>",
            "<Command-v>", "<Command-V>",
            "<<Paste>>",
            "<Control-x>", "<Control-X>",
            "<Command-x>", "<Command-X>"
        ]
        for seq in edit_sequences:
            self.chat_text.bind(seq, lambda e: "break")
        
        # Block middle-click paste
        self.chat_text.bind("<Button-2>", lambda e: "break")
    
    def setup_context_menu(self) -> None:
        """Set up the right-click context menu."""
        self.context_menu = tk.Menu(self.root, tearoff=0)
        self.context_menu.add_command(
            label="Copy",
            command=self.copy_selection
        )
        self.context_menu.add_command(
            label="Select All",
            command=self.select_all
        )
        
        # Bind right-click and Ctrl+click
        for binding in ("<Button-3>", "<Control-Button-1>"):
            self.chat_text.bind(binding, self.show_context_menu)
        
        # Global keyboard shortcuts
        for binding in ("<Control-c>", "<Command-c>"):
            self.root.bind_all(binding, lambda e: self.copy_selection())
        for binding in ("<Control-a>", "<Command-a>"):
            self.root.bind_all(binding, lambda e: self.select_all())
    
    # ========================================================================
    # THEME AND STYLING
    # ========================================================================
    
    def apply_dark_theme(self) -> None:
        """Apply dark theme to the application."""
        style = ttk.Style()
        
        # Try to use clam theme as base
        try:
            style.theme_use("clam")
        except:
            pass
        
        # Configure root
        self.root.configure(bg=DARK_THEME["bg"])
        
        # Configure ttk widgets
        style.configure("TFrame", background=DARK_THEME["bg"])
        style.configure(
            "TLabel",
            background=DARK_THEME["bg"],
            foreground=DARK_THEME["fg"]
        )
        style.configure(
            "TEntry",
            fieldbackground=DARK_THEME["field"],
            foreground=DARK_THEME["fg"],
            background=DARK_THEME["card"]
        )
        style.configure(
            "TCombobox",
            fieldbackground=DARK_THEME["field"],
            foreground=DARK_THEME["fg"],
            background=DARK_THEME["card"]
        )
        style.configure(
            "TCheckbutton",
            background=DARK_THEME["bg"],
            foreground=DARK_THEME["fg"]
        )
        
        # Configure status bar
        self.status_bar.configure(
            bg=DARK_THEME["card"],
            fg=DARK_THEME["muted"]
        )
        
        # Configure text widget
        self.chat_text.configure(
            bg=DARK_THEME["field"],
            fg=DARK_THEME["fg"],
            insertbackground=DARK_THEME["fg"],
            selectbackground=DARK_THEME["select"],
            selectforeground=DARK_THEME["white"]
        )
    
    # ========================================================================
    # HELPER METHODS
    # ========================================================================
    
    def get_available_modes(self) -> List[str]:
        """Get list of available API modes."""
        preferred_order = ["local", "cloudflare", "openai"]
        all_modes = list(COMPLETION_MODELS.keys())
        
        ordered = [m for m in preferred_order if m in all_modes]
        ordered += [m for m in all_modes if m not in preferred_order]
        
        return ordered
    
    def get_models_for_mode(self, mode: str) -> List[str]:
        """Get available models for a specific mode."""
        return list(COMPLETION_MODELS.get(mode, {}).keys())
    
    def get_default_model(self, mode: str) -> str:
        """Get the default model for a mode."""
        default = DEFAULT_COMPLETION.get(mode)
        if default:
            return default
        
        models = self.get_models_for_mode(mode)
        return models[0] if models else ""
    
    def on_mode_change(self, event=None) -> None:
        """Handle mode selection change."""
        mode = self.mode.get()
        
        models = self.get_models_for_mode(mode)
        self.model_combo["values"] = models
        self.model.set(self.get_default_model(mode))
        
        self.update_status(f"Mode changed to '{mode}'")
    
    def write_message(self, text: str, tag: str = "system") -> None:
        """Write a message to the chat display."""
        self.chat_text.insert("end", text + "\n\n", tag)
        self.chat_text.see("end")
    
    def update_status(self, message: str) -> None:
        """Update the status bar text."""
        self.status_bar.config(text=message)
    
    def show_context_menu(self, event) -> None:
        """Show the context menu at cursor position."""
        self.context_menu.tk_popup(event.x_root, event.y_root)
        self.context_menu.grab_release()
    
    def copy_selection(self) -> str:
        """Copy selected text to clipboard."""
        try:
            selected_text = self.chat_text.get("sel.first", "sel.last")
        except tk.TclError:
            return "break"
        
        self.root.clipboard_clear()
        self.root.clipboard_append(selected_text)
        return "break"
    
    def select_all(self) -> str:
        """Select all text in the chat display."""
        self.chat_text.tag_add("sel", "1.0", "end-1c")
        return "break"
    
    # ========================================================================
    # MESSAGE HANDLING
    # ========================================================================
    
    def send_message(self) -> None:
        """Send the user's message for processing."""
        message = self.entry.get().strip()
        if not message:
            return
        
        # Clear input and disable send button
        self.entry.delete(0, "end")
        self.send_button.config(state="disabled")
        self.update_status("Thinking…")
        
        # Display user message
        timestamp = datetime.now().strftime(TIME_FORMAT)
        self.write_message(f"You [{timestamp}]:\n{message}", "user")
        
        # Process in background thread
        thread = threading.Thread(
            target=self.process_message_wrapper,
            args=(message,),
            daemon=True
        )
        thread.start()
    
    def process_message_wrapper(self, message: str) -> None:
        """Wrapper to process message and handle response."""
        try:
            # Get configuration
            project = self.project.get().strip() or DEFAULT_PROJECT_NAME
            mode = self.mode.get().strip() or DEFAULT_RUN_MODE
            model = self.model.get().strip() or self.get_default_model(mode)
            
            # Call the message processor
            try:
                response = self.message_processor(
                    message, project, model, mode, None
                )
            except Exception as e:
                self.root.after(0, self.write_message, str(e), "error")
                self.root.after(0, self.update_status, "Error processing message")
                return
            
            # Display response
            timestamp = datetime.now().strftime(TIME_FORMAT)
            self.root.after(
                0,
                self.write_message,
                f"Assistant [{timestamp}]:\n{response}",
                "assistant"
            )
            self.root.after(0, self.update_status, "Ready")
            
            # Push to Grasshopper if enabled
            if self.auto_push.get():
                self.push_to_grasshopper(
                    message, response, project, model, mode
                )
        
        finally:
            # Re-enable controls
            self.root.after(0, self.send_button.config, {"state": "normal"})
            self.root.after(0, self.entry.focus)
    
    def push_to_grasshopper(
        self,
        user_input: str,
        ai_response: str,
        project: str,
        model: str,
        mode: str
    ) -> None:
        """Send conversation to Grasshopper endpoint."""
        try:
            payload = {
                "user_input": user_input,
                "ai_response": ai_response,
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "project_name": project,
                "model": model,
                "api_mode": mode
            }
            
            requests.post(
                self.gh_url.get().strip(),
                json=payload,
                timeout=GH_TIMEOUT_SECONDS
            )
        except:
            # Silently fail
            pass