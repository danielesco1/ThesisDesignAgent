from flask import Flask, jsonify, request, send_from_directory
from utils.llm_calls import *
from utils.context_data import *
from utils.parsing_json import *
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

# Chat endpoint with context
@app.route('/chat', methods=['POST'])
def chat():
    data     = request.json or {}
    message  = data.get('message', '')
    user_id  = data.get('user_id', 'default_user')

    # # 1) Classify the incoming message
    # classification = classify_message(message)
    # is_graph = classification.get("is_graph_request", False)
    # print(f"Message classified as graph request: {is_graph}")

    try:
        # if is_graph:
        #     # 2a) Graph path → ask LLM to output pure JSON graph
        #     response = query_llm(message, system_prompt=GRAPH_SYSTEM_PROMPT)
        #     print(f"Graph response: {response}")
            
        #     # Parse the JSON response
        #     parsed_response = json.loads(response)
            
        #     # Extract the actual graph data (handle nested structure)
        #     if isinstance(parsed_response, dict) and 'graph' in parsed_response:
        #         graph_data = parsed_response['graph']
        #     else:
        #         graph_data = parsed_response
            
        #     # Return with the expected format
        #     return jsonify({
        #         'is_graph_request': True,
        #         'graph': graph_data,
        #         'response': 'Here\'s your graph visualization:'  # Optional text response
        #     })
        # else:
            # 2b) Regular chat path with context
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
            return jsonify(response)

    
    except Exception as e:
        print(f"Error in chat endpoint: {e}")
        return jsonify({'response': 'Sorry, an error occurred.'}), 500

if __name__ == '__main__':
    print("Server running at http://localhost:5000")
    app.run(debug=True, port=5000)