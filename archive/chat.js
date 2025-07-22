// chat.js - Chatbot with username support

const CONFIG = {
    API_URL: 'http://localhost:5000',
    ENDPOINT: '/chat'
};

class ChatManager {
    constructor() {
        this.chatMessages = document.getElementById('chatMessages');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.userId = null;
        
        this.initializeLogin();
        this.initializeEventListeners();
    }
    
    initializeLogin() {
        const savedUsername = localStorage.getItem('username');
        if (savedUsername) {
            this.userId = savedUsername;
            this.showChat();
        } else {
            this.showLogin();
        }
    }
    
    showLogin() {
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('chat-area').style.display = 'none';
        
        const loginButton = document.getElementById('login-button');
        const usernameInput = document.getElementById('username-input');
        
        loginButton.addEventListener('click', () => this.handleLogin());
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });
    }
    
    handleLogin() {
        const username = document.getElementById('username-input').value.trim();
        if (username) {
            this.userId = username;
            localStorage.setItem('username', username);
            this.showChat();
        }
    }
    
    showChat() {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('chat-area').style.display = 'flex';
        document.getElementById('username-display').textContent = `Logged in as: ${this.userId}`;
        document.getElementById('logout-button').style.display = 'block';
        
        // Add logout handler
        document.getElementById('logout-button').addEventListener('click', () => {
            localStorage.removeItem('username');
            location.reload();
        });
        
        this.messageInput.focus();
    }

    initializeEventListeners() {
        this.sendButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.sendMessage();
        });
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    async sendMessage() {
        console.log('1. Starting sendMessage');
        const message = this.messageInput.value.trim();
        if (!message) return;

        this.messageInput.value = '';
        this.setButtonState(false);
        
        console.log('2. Adding user message');
        this.addMessage(message, 'user');

        try {
            console.log('3. Sending request to:', `${CONFIG.API_URL}${CONFIG.ENDPOINT}`);
            const response = await fetch(`${CONFIG.API_URL}${CONFIG.ENDPOINT}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: message,
                    user_id: this.userId
                })
            });

            console.log('4. Response received:', response.status);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new TypeError("Response wasn't JSON");
            }
            
            console.log('5. Parsing JSON');
            const data = await response.json();
            console.log('6. Data received:', data);
            
            this.addMessage(data.response, 'assistant');
            console.log('7. Message added successfully');

        } catch (error) {
            console.error('Error at step:', error);
            this.addMessage('Sorry, I encountered an error. Please try again.', 'assistant', 'error');
        } finally {
            this.setButtonState(true);
            this.messageInput.focus();
        }
    }

    addMessage(text, sender, type = '') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        if (type === 'error') contentDiv.className += ' error';
        contentDiv.textContent = text;

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(timeDiv);
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    setButtonState(enabled) {
        this.sendButton.disabled = !enabled;
        this.sendButton.textContent = enabled ? 'Send' : 'Sending...';
    }

    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.chatManager = new ChatManager();
});