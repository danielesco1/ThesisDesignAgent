// chat.js
class Chat {
    constructor(apiUrl = 'http://localhost:5000/chat') {
      this.apiUrl = apiUrl;
      this.handlers = {};
    }
    on(evt, fn){ (this.handlers[evt] ||= []).push(fn); return this; }
    emit(evt, data){ this.handlers[evt]?.forEach(fn => fn(data)); }
  
    async send(message){
      this.emit('beforeSend', message);
      try{
        const res  = await fetch(this.apiUrl, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ message, user_id:'default_user' })
        });
        const data = await res.json();          // assumes server returns {response: "..."}
        this.emit('response', data);
        return data;
      }catch(err){
        this.emit('error', err);
      }
    }
  }
  
  // ui.js
  function initUI(chat){
    const ui = document.createElement('div');
    ui.className = 'chat-overlay';
    ui.innerHTML = `
      <div class="chat-header"><span>Lattice</span></div>
      <div class="chat-area">
        <div class="chat-messages">
          <div class="message assistant"><div class="message-content">Hello! what do you want to design?</div></div>
        </div>
        <div class="input-container">
          <input type="text" class="message-input" placeholder="Type a message...">
          <button class="send-button">Send</button>
        </div>
      </div>`;
    document.body.appendChild(ui);
  
    const input    = ui.querySelector('.message-input');
    const messages = ui.querySelector('.chat-messages');
    const sendBtn  = ui.querySelector('.send-button');
  
    const addMsg = (text, type='assistant') => {
      const el = document.createElement('div');
      el.className = `message ${type}`;
      el.innerHTML = `<div class="message-content">${text}</div>`;
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
    };
  
    const sendMessage = () => {
      const msg = input.value.trim();
      if(!msg) return;
      addMsg(msg, 'user');
      input.value = '';
      chat.send(msg);
      input.focus();
    };
  
    sendBtn.onclick = sendMessage;
    input.addEventListener('keypress', e => {
      if(e.key === 'Enter'){ e.preventDefault(); sendMessage(); }
    });
  
    // UPDATE THIS: Enhanced response handler
    chat.on('response', data => {
      // Show the text response
      addMsg(data.response || 'No response');
      
      // ADD THIS: Check if there's a layout in the response
      if (data.layout) {
          // Add a visual indicator
          addMsg('📐 Layout generated! Visualizing...', 'system');
          
          // Store current layout
          currentLayout = data.layout;
          
          // Visualize the layout
          // if (window.viewer || window.viewer3D) {
          //     visualizeLayout(data.layout);
          // }
          
          // Add edit button
          const editBtn = document.createElement('button');
          editBtn.textContent = 'Edit Layout JSON';
          editBtn.style.cssText = 'margin: 5px; padding: 5px 10px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;';
          editBtn.onclick = () => openLayoutEditor();
          
          const btnContainer = document.createElement('div');
          btnContainer.className = 'message system';
          btnContainer.appendChild(editBtn);
          messages.appendChild(btnContainer);
      }
  });
  
  chat.on('error', () => addMsg('Error: Could not connect', 'error'));
}
  
  // bootstrap
  const chat = new Chat();
  initUI(chat);
  