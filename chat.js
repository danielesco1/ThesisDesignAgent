// chat.js - Chat functionality for AI Design Assistant

// Configuration
const CONFIG = {
    API_URL: 'http://127.0.0.1:5000',
    ENDPOINTS: {
        GET_GRASSHOPPER: '/get_from_grasshopper',
        SEND_GRASSHOPPER: '/send_to_grasshopper',
        PROCESS_LLM: '/process_llm'  // You'll need to implement this endpoint
    }
};

// Chat Manager Class
class ChatManager {
    constructor() {
        this.chatMessages = document.getElementById('chatMessages');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
    }

    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;

        // Clear input and disable button
        this.messageInput.value = '';
        this.setButtonState(false, 'Sending...');

        // Add user message
        this.addMessage(message, 'user');

        try {
            // Step 1: Get Grasshopper data
            this.addMessage('Fetching data from Grasshopper...', 'assistant', 'loading');
            const grasshopperData = await this.getGrasshopperData();
            
            this.removeLoadingMessage();
            this.addMessage(`Retrieved area: ${grasshopperData} m²`, 'assistant');

            // Step 2: Process with LLM
            const combinedMessage = `${message} The Area is ${grasshopperData} m2`;
            this.addMessage('Processing your request...', 'assistant', 'loading');
            
            const conceptText = await this.processWithLLM(combinedMessage);
            this.removeLoadingMessage();

            // Step 3: Send to Grasshopper
            const result = await this.sendToGrasshopper(conceptText);
            
            // Show response
            this.addMessage(result.message || 'Concept sent to Grasshopper successfully!', 'assistant');
            
            // Optional: Trigger 3D viewer update
            this.triggerViewerUpdate(result);

        } catch (error) {
            this.removeLoadingMessage();
            this.addMessage(`Error: ${error.message}`, 'assistant', 'error');
            console.error('Chat error:', error);
        } finally {
            this.setButtonState(true, 'Send');
            this.messageInput.focus();
        }
    }

    async getGrasshopperData() {
        const response = await fetch(`${CONFIG.API_URL}${CONFIG.ENDPOINTS.GET_GRASSHOPPER}`);
        if (!response.ok) throw new Error('Failed to get Grasshopper data');
        return await response.json();
    }

    async processWithLLM(message) {
        // For development: simulate LLM response
        // Remove this and uncomment the actual implementation below
        await this.simulateDelay(1000);
        return `Processed concept for: ${message}`;

        /* Actual implementation:
        const response = await fetch(`${CONFIG.API_URL}${CONFIG.ENDPOINTS.PROCESS_LLM}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message })
        });
        if (!response.ok) throw new Error('Failed to process with LLM');
        const data = await response.json();
        return data.concept_text;
        */
    }

    async sendToGrasshopper(conceptText) {
        const response = await fetch(`${CONFIG.API_URL}${CONFIG.ENDPOINTS.SEND_GRASSHOPPER}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ concept_text: conceptText })
        });
        if (!response.ok) throw new Error('Failed to send to Grasshopper');
        return await response.json();
    }

    addMessage(text, sender, type = '') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        if (type === 'loading') messageDiv.id = 'loadingMessage';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        if (type === 'loading') contentDiv.className += ' loading';
        if (type === 'error') contentDiv.className += ' error';
        contentDiv.textContent = text;

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = this.formatTime(new Date());

        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(timeDiv);

        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    removeLoadingMessage() {
        const loading = document.getElementById('loadingMessage');
        if (loading) loading.remove();
    }

    setButtonState(enabled, text) {
        this.sendButton.disabled = !enabled;
        this.sendButton.textContent = text;
    }

    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    simulateDelay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // This method can be called to update the 3D viewer
    triggerViewerUpdate(data) {
        // Dispatch custom event that the 3D viewer can listen to
        window.dispatchEvent(new CustomEvent('grasshopperUpdate', { detail: data }));
    }
}

// Initialize chat when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.chatManager = new ChatManager();
});

// Export for use in other modules if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatManager;
}