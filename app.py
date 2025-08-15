from flask import Flask, jsonify, request, send_from_directory
from utils.llm_calls import *
from utils.context_data import *
from utils.extractInfo import extract_json_from_text
import json
app = Flask(__name__)

# Serve HTML
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

# Serve JS files
@app.route('/<path:filename>')
def serve_static(filename):
    if filename.endswith(('.js', '.css')):
        return send_from_directory('.', filename)
    return "Not found", 404

layouts = {}
# Chat endpoint with context
@app.route('/chat', methods=['POST'])
def chat():
    data     = request.json or {}
    message  = data.get('message', '')
    user_id  = data.get('user_id', 'default_user')

    try:
       
        context = get_recent_context(user_id, limit=2)
        if context:
            convo = "\n".join([f"User: {u}\nAssistant: {a}" for u, a in context])
            full_prompt = f"Previous conversation:\n{convo}\n\nUser: {message}"
        else:
            full_prompt = message
        print(full_prompt  )
        response = query_llm(full_prompt)
        save_conversation(user_id, message, response)
        print(response)
        layout_data = None
        if '{' in response and '}' in response:
            json_str = extract_json_from_text(response)
            
            if json_str:
                try:
                    json_data = json.loads(json_str)
                    # Check if it's a layout (has nodes/edges)
                    if 'nodes' in json_data and 'edges' in json_data:
                        # Generate ID and store layout
                        layout_id = f"layout_{len(layouts)}_{user_id}"
                        json_data['id'] = layout_id
                        layouts[layout_id] = json_data
                        layout_data = json_data
                        print(f"Layout stored: {layout_id}")
                except Exception as e:
                    print(f"JSON parse error: {e}")
                 
        return jsonify({
            "response": response,
            "layout": layout_data  # Include layout if found
        })

    
    except Exception as e:
        print(f"Error in chat endpoint: {e}")
        return jsonify({'response': 'Sorry, an error occurred.'}), 500
    
# Add these simple endpoints for layout management
@app.route('/layouts/<layout_id>', methods=['GET'])
def get_layout(layout_id):
    if layout_id in layouts:
        return jsonify(layouts[layout_id])
    return jsonify({'error': 'Layout not found'}), 404

@app.route('/layouts/<layout_id>', methods=['PUT'])
def update_layout(layout_id):
    if layout_id in layouts:
        data = request.json
        layouts[layout_id].update(data)
        return jsonify({'success': True, 'layout': layouts[layout_id]})
    return jsonify({'error': 'Layout not found'}), 404

if __name__ == '__main__':
    print("Server running at http://localhost:5000")
    app.run(debug=True, port=5000)