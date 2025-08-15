# Simple HTML chat interface
HTML_TEMPLATE = '''
<!DOCTYPE html>
<html>
<head>
    <title>Simple Chat</title>
    <style>
        body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: #f0f0f0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
        }
        
        .chat-box {
            width: 500px;
            height: 600px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
            display: flex;
            flex-direction: column;
        }
        
        .messages {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
        }
        
        .message {
            margin: 10px 0;
            padding: 10px;
            border-radius: 5px;
        }
        
        .user {
            background: #007bff;
            color: white;
            text-align: right;
        }
        
        .assistant {
            background: #e9ecef;
            color: black;
        }
        
        .input-area {
            display: flex;
            padding: 20px;
            border-top: 1px solid #ddd;
        }
        
        input {
            flex: 1;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
            margin-right: 10px;
        }
        
        button {
            padding: 10px 20px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        }
        
        button:hover {
            background: #0056b3;
        }
        
        button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <div class="chat-box">
        <div class="messages" id="messages"></div>
        <div class="input-area">
            <input type="text" id="input" placeholder="Type a message..." autofocus>
            <button id="send">Send</button>
        </div>
    </div>

    <script>
        const FLASK_URL = '/llm_call';  // Same server, just the endpoint
        const GRASSHOPPER_URL = 'http://localhost:8081';
        
        const messages = document.getElementById('messages');
        const input = document.getElementById('input');
        const sendBtn = document.getElementById('send');
        
        function addMessage(text, isUser) {
            const div = document.createElement('div');
            div.className = `message ${isUser ? 'user' : 'assistant'}`;
            div.textContent = text;
            messages.appendChild(div);
            messages.scrollTop = messages.scrollHeight;
        }
        
        async function sendMessage() {
            const text = input.value.trim();
            if (!text) return;
            
            addMessage(text, true);
            input.value = '';
            sendBtn.disabled = true;
            
            try {
                // Send to Flask
                const response = await fetch(FLASK_URL, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        input_text: text,
                        project_name: 'default',
                        model: 'gpt-3.5-turbo',
                        api_mode: 'local'
                    })
                });
                
                const data = await response.json();
                addMessage(data.response, false);
                
                // Send to Grasshopper (don't wait)
                fetch(GRASSHOPPER_URL, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        user_input: text,
                        ai_response: data.response,
                        timestamp: new Date().toISOString()
                    })
                }).catch(err => console.log('Grasshopper error:', err));
                
            } catch (error) {
                addMessage('Error: ' + error.message, false);
            }
            
            sendBtn.disabled = false;
            input.focus();
        }
        
        sendBtn.onclick = sendMessage;
        input.onkeypress = (e) => {
            if (e.key === 'Enter') sendMessage();
        };
    </script>
</body>
</html>
'''