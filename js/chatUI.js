class Chat {
    constructor(config = {}) {
        this.config = { apiUrl: 'http://localhost:5000/chat', ...config };
        this.plugins = [];
        this.handlers = {};
    }
    
    use(plugin) {
        this.plugins.push(plugin);
        plugin.install?.(this);
        return this;
    }
    
    on(event, handler) {
        (this.handlers[event] ||= []).push(handler);
        return this;
    }
    
    emit(event, data) {
        this.handlers[event]?.forEach(h => h(data));
    }
    
    isGraph(obj) {
        try {
            const data = typeof obj === 'string' ? JSON.parse(obj) : obj;
            return data && Array.isArray(data.nodes) && Array.isArray(data.edges);
        } catch { return false; }
    }
    
    async send(message) {
        this.emit('beforeSend', message);
        try {
            const res = await fetch(this.config.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, user_id: 'default_user' })
            });
            let data = await res.json();
            
            // Auto-detect graphs
            if (!data.is_graph_request && this.isGraph(data.response)) {
                data.is_graph_request = true;
                data.graph = typeof data.response === 'string' ? JSON.parse(data.response) : data.response;
            }
            
            this.emit('response', data);
            return data;
        } catch (err) {
            this.emit('error', err);
        }
    }
}

const FixedUIPlugin = {
    install(chat) {
        const ui = document.createElement('div');
        ui.className = 'chat-overlay';
        ui.innerHTML = `
            <div class="chat-header"><span>Lattice</span></div>
            <div class="chat-area">
                <div class="chat-messages">
                    <div class="message assistant"><div class="message-content">Hello! How can I help you with your design?</div></div>
                </div>
                <div class="input-container">
                    <input type="text" class="message-input" placeholder="Type a message...">
                    <button class="send-button">Send</button>
                </div>
            </div>
        `;
        document.body.appendChild(ui);
        
        const input = ui.querySelector('.message-input');
        const messages = ui.querySelector('.chat-messages');
        const sendBtn = ui.querySelector('.send-button');
        
        const addMsg = (content, type = 'assistant') => {
            const msg = document.createElement('div');
            msg.className = `message ${type}`;
            msg.innerHTML = `<div class="message-content">${
                typeof content === 'string' ? content : 
                `<pre style="background:#1e1e1e;padding:12px;border-radius:6px;overflow:auto;max-height:300px;">${JSON.stringify(content, null, 2)}</pre>
                <button class="btn-3d-view" onclick="window.viewer3D?.loadGraph(${JSON.stringify(content).replace(/"/g, '&quot;')})">🎨 Visualize in 3D</button>`
            }</div>`;
            messages.appendChild(msg);
            messages.scrollTop = messages.scrollHeight;
        };
        
        const sendMessage = () => {
            const msg = input.value.trim();
            if (msg) {
                input.value = '';
                addMsg(msg, 'user');
                chat.send(msg);
                input.focus();
            }
        };
        
        sendBtn.addEventListener('click', sendMessage);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });
        
        chat.on('response', data => {
            if (data.is_graph_request && data.graph) {
                window.viewer3D?.loadGraph(data.graph);
                addMsg(data.graph);
            } else {
                addMsg(data.response || 'No response');
            }
        });
        
        chat.on('error', () => addMsg('Error: Could not connect', 'error'));
    }
};