// chatUI.js - Modular Chat UI Class

class ChatUI {
    constructor(config = {}) {
        // Default configuration
        this.config = {
            position: { bottom: 20, left: 20 },
            size: { width: 400, height: 600 },
            minSize: { width: 350, height: 400 },
            maxSize: { width: 600, height: '80vh' },
            apiUrl: 'http://localhost:5000',
            apiEndpoint: '/chat',
            title: 'AI Design Assistant',
            placeholder: 'Type your message...',
            welcomeMessage: "Hello! I'm ready to help you with your design. What would you like to explore?",
            ...config
        };

        this.elements = {};
        this.state = {
            isDragging: false,
            isResizing: false,
            isMinimized: false,
            dragOffset: { x: 0, y: 0 },
            resizeDirection: '',
            userId: null
        };

        this.init();
    }

    init() {
        this.createHTML();
        this.cacheElements();
        this.attachEventListeners();
        this.checkUserLogin();
    }

    createHTML() {
        const chatHTML = `
            <div class="chat-overlay" id="chatOverlay" style="
                position: absolute;
                bottom: ${this.config.position.bottom}px;
                left: ${this.config.position.left}px;
                width: ${this.config.size.width}px;
                height: ${this.config.size.height}px;
            ">
                <!-- Resize Handles -->
                ${this.createResizeHandles()}
                
                <div class="chat-header" id="chatHeader">
                    <button class="minimize-btn" id="minimizeBtn">▼</button>
                    ${this.config.title}
                    <div class="user-info">
                        User: <span id="username-display">default_user</span>
                    </div>
                    <button class="logout-btn" id="logout-button" style="display: none;">Logout</button>
                </div>
                
                <!-- Login Form -->
                <div class="login-form" id="login-form" style="display: none;">
                    <form onsubmit="return false;">
                        <input type="text" id="username-input" placeholder="Enter your name">
                        <button type="button" id="login-button">Start Chat</button>
                    </form>
                </div>
                
                <!-- Chat Area -->
                <div class="chat-area" id="chat-area">
                    <div class="chat-messages" id="chatMessages">
                        <div class="message assistant">
                            <div class="message-content">${this.config.welcomeMessage}</div>
                            <div class="message-time">Just now</div>
                        </div>
                    </div>
                    
                    <div class="input-container">
                        <input 
                            type="text" 
                            class="message-input" 
                            id="messageInput" 
                            placeholder="${this.config.placeholder}"
                            autocomplete="off"
                        >
                        <button class="send-button" id="sendButton" type="button">Send</button>
                    </div>
                </div>
            </div>
        `;

        // Add to body
        const container = document.createElement('div');
        container.innerHTML = chatHTML;
        document.body.appendChild(container.firstElementChild);
    }

    createResizeHandles() {
        const directions = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
        return directions.map(dir => 
            `<div class="resize-handle resize-handle-${dir}" data-direction="${dir}"></div>`
        ).join('');
    }

    cacheElements() {
        this.elements = {
            overlay: document.getElementById('chatOverlay'),
            header: document.getElementById('chatHeader'),
            messages: document.getElementById('chatMessages'),
            input: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendButton'),
            minimizeBtn: document.getElementById('minimizeBtn'),
            loginForm: document.getElementById('login-form'),
            chatArea: document.getElementById('chat-area'),
            usernameDisplay: document.getElementById('username-display'),
            usernameInput: document.getElementById('username-input'),
            loginBtn: document.getElementById('login-button'),
            logoutBtn: document.getElementById('logout-button'),
            resizeHandles: document.querySelectorAll('.resize-handle')
        };
    }

    attachEventListeners() {
        // Dragging
        this.elements.header.addEventListener('mousedown', (e) => this.dragStart(e));
        document.addEventListener('mousemove', (e) => this.drag(e));
        document.addEventListener('mouseup', () => this.dragEnd());

        // Resizing
        this.elements.resizeHandles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => this.resizeStart(e));
        });

        // Chat functionality
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        this.elements.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // UI controls
        this.elements.minimizeBtn.addEventListener('click', () => this.toggleMinimize());
        this.elements.loginBtn.addEventListener('click', () => this.handleLogin());
        this.elements.logoutBtn.addEventListener('click', () => this.logout());
        this.elements.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });
    }

    // Drag functionality
    dragStart(e) {
        if (e.target === this.elements.header || e.target.parentNode === this.elements.header) {
            this.state.isDragging = true;
            const rect = this.elements.overlay.getBoundingClientRect();
            this.state.dragOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        }
    }

    drag(e) {
        if (!this.state.isDragging) return;
        e.preventDefault();
        
        const x = e.clientX - this.state.dragOffset.x;
        const y = e.clientY - this.state.dragOffset.y;
        
        this.elements.overlay.style.left = `${x}px`;
        this.elements.overlay.style.top = `${y}px`;
        this.elements.overlay.style.bottom = 'auto';
        this.elements.overlay.style.transform = 'none';
    }

    dragEnd() {
        this.state.isDragging = false;
    }

    // Resize functionality
    resizeStart(e) {
        this.state.isResizing = true;
        this.state.resizeDirection = e.target.dataset.direction;
        this.state.resizeStart = {
            x: e.clientX,
            y: e.clientY,
            width: this.elements.overlay.offsetWidth,
            height: this.elements.overlay.offsetHeight
        };
        
        document.addEventListener('mousemove', (e) => this.resize(e));
        document.addEventListener('mouseup', () => this.resizeEnd());
        e.preventDefault();
    }

    resize(e) {
        if (!this.state.isResizing) return;

        const dx = e.clientX - this.state.resizeStart.x;
        const dy = e.clientY - this.state.resizeStart.y;
        let newWidth = this.state.resizeStart.width;
        let newHeight = this.state.resizeStart.height;

        if (this.state.resizeDirection.includes('e')) newWidth += dx;
        if (this.state.resizeDirection.includes('w')) newWidth -= dx;
        if (this.state.resizeDirection.includes('s')) newHeight += dy;
        if (this.state.resizeDirection.includes('n')) newHeight -= dy;

        // Apply constraints
        newWidth = Math.max(this.config.minSize.width, Math.min(newWidth, this.config.maxSize.width));
        newHeight = Math.max(this.config.minSize.height, Math.min(newHeight, window.innerHeight * 0.8));

        this.elements.overlay.style.width = `${newWidth}px`;
        this.elements.overlay.style.height = `${newHeight}px`;
    }

    resizeEnd() {
        this.state.isResizing = false;
        document.removeEventListener('mousemove', this.resize);
        document.removeEventListener('mouseup', this.resizeEnd);
    }

    // Chat functionality
    async sendMessage() {
        const message = this.elements.input.value.trim();
        if (!message) return;

        this.elements.input.value = '';
        this.setButtonState(false);
        this.addMessage(message, 'user');

        try {
            const res = await fetch(`${this.config.apiUrl}${this.config.apiEndpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: message,
                    user_id: this.state.userId
                })
            });
            if (!res.ok) throw new Error(`HTTP status ${res.status}`);
            
            const data = await res.json();
            console.log('Received from server:', data);

            // Load graph into 3D viewer if it's a graph request
            if (data.is_graph_request && data.graph) {
                window.viewer3D.loadGraph(data.graph);
            }

            // Display response
            if (data.is_graph_request && data.graph) {
                // Pretty-print the graph JSON with 'json' type
                const pretty = JSON.stringify(data.graph, null, 2);
                this.addMessage(pretty, 'assistant', 'json');
            } else {
                this.addMessage(data.response, 'assistant');
            }

        } catch (err) {
            console.error(err);
            this.addMessage('Sorry, I encountered an error. Please try again.', 'assistant', 'error');
        } finally {
            this.setButtonState(true);
            this.elements.input.focus();
        }
    }

    addMessage(content, sender, type = '') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        // Handle different content types
        if (type === 'json' && typeof content === 'string') {
            // Create formatted JSON display
            const pre = document.createElement('pre');
            pre.className = 'json-display';
            pre.style.cssText = `
                background: #1e1e1e;
                color: #d4d4d4;
                padding: 12px;
                border-radius: 6px;
                overflow-x: auto;
                max-height: 400px;
                font-size: 12px;
                line-height: 1.4;
                margin: 8px 0;
            `;
            
            try {
                // Parse and re-stringify for consistent formatting
                const parsed = JSON.parse(content);
                pre.textContent = JSON.stringify(parsed, null, 2);
            } catch {
                pre.textContent = content;
            }
            
            contentDiv.appendChild(pre);
            
            // Add 3D View button for graph data
            if (content.includes('"nodes"') && content.includes('"edges"')) {
                const btn = document.createElement('button');
                btn.textContent = '🎨 Visualize in 3D';
                btn.className = 'btn-3d-view';
                btn.style.cssText = `
                    margin-top: 8px;
                    padding: 8px 16px;
                    background: #5e72e4;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                `;
                btn.addEventListener('click', () => {
                    try {
                        const graphData = JSON.parse(content);
                        if (window.viewer3D && typeof window.viewer3D.loadGraph === 'function') {
                            window.viewer3D.loadGraph(graphData);
                        }
                    } catch (e) {
                        console.error('Failed to parse graph data:', e);
                    }
                });
                contentDiv.appendChild(btn);
            }
        } else if (type === 'error') {
            contentDiv.classList.add('error');
            contentDiv.textContent = String(content);
        } else {
            contentDiv.textContent = String(content);
        }

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(timeDiv);
        this.elements.messages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    setButtonState(enabled) {
        this.elements.sendBtn.disabled = !enabled;
        this.elements.sendBtn.textContent = enabled ? 'Send' : 'Sending...';
    }

    scrollToBottom() {
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
    }

    // UI controls
    toggleMinimize() {
        this.state.isMinimized = !this.state.isMinimized;
        this.elements.overlay.classList.toggle('minimized');
        this.elements.minimizeBtn.textContent = this.state.isMinimized ? '▲' : '▼';
    }

    // User management
    checkUserLogin() {
        const savedUsername = localStorage.getItem('username');
        if (savedUsername) {
            this.state.userId = savedUsername;
            this.showChat();
        } else {
            this.showLogin();
        }
    }

    showLogin() {
        this.elements.loginForm.style.display = 'block';
        this.elements.chatArea.style.display = 'none';
    }

    showChat() {
        this.elements.loginForm.style.display = 'none';
        this.elements.chatArea.style.display = 'flex';
        this.elements.usernameDisplay.textContent = this.state.userId;
        this.elements.logoutBtn.style.display = 'block';
        this.elements.input.focus();
    }

    handleLogin() {
        const username = this.elements.usernameInput.value.trim();
        if (username) {
            this.state.userId = username;
            localStorage.setItem('username', username);
            this.showChat();
        }
    }

    logout() {
        localStorage.removeItem('username');
        location.reload();
    }

    // Public methods
    clearMessages() {
        this.elements.messages.innerHTML = `
            <div class="message assistant">
                <div class="message-content">${this.config.welcomeMessage}</div>
                <div class="message-time">Just now</div>
            </div>
        `;
    }

    destroy() {
        this.elements.overlay.remove();
    }

    setPosition(left, top) {
        this.elements.overlay.style.left = `${left}px`;
        this.elements.overlay.style.top = `${top}px`;
        this.elements.overlay.style.bottom = 'auto';
    }

    setSize(width, height) {
        this.elements.overlay.style.width = `${width}px`;
        this.elements.overlay.style.height = `${height}px`;
    }
}

// Initialize with custom config
// const chatUI = new ChatUI({
//     title: 'My Custom Chat',
//     apiUrl: 'http://localhost:3000',
//     position: { bottom: 50, left: 50 }
// });