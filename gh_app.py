from flask import Flask, jsonify, request, send_from_directory,  render_template_string
from utils.llm_calls import *
from utils.context_data import *
from utils.extractInfo import extract_json_from_text
import json
app = Flask(__name__)

from server.config import api_mode
from chat.chat_template import HTML_TEMPLATE
# Route to serve the chat UI
@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/llm_call', methods=['POST'])
def llm_call():
    payload = request.get_json(force=True) or {}
    input_text = (payload.get("input_text") or "").strip()
    run_mode   = payload.get("api_mode", "local")      # <- was api_mode (string)
    model_id   = payload.get("model") 
    project_name = payload.get("project_name")
    context = True

    if not input_text:
            return jsonify({"error": "input_text is required"}), 400
    
    client, completion_model, embedding_model = api_mode(run_mode, model_id)
    
    context = get_recent_context(project_name, limit=2)
    if context:
        convo = "\n".join([f"User: {u}\nAssistant: {a}" for u, a in context])
        full_prompt = f"Previous conversation:\n{convo}\n\nUser: {input_text}"
    else:
        full_prompt = input_text
    print(full_prompt)
    
    response = query(client, completion_model, input_text, system_prompt=None)
    save_conversation(project_name, input_text, response)
    print(response)
    return jsonify({'response': response})

if __name__ == '__main__':
    print("\n✨ Chat UI available at: http://localhost:5000\n")
    app.run(port=5000, debug=True)