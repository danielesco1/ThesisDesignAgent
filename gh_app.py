from flask import Flask, jsonify, request, send_from_directory,  render_template_string
from utils.llm_calls import *
from utils.context_data import *
from utils.extractInfo import extract_json_from_text
import json
app = Flask(__name__)

from server.config import api_mode
from chat.chat_template import HTML_TEMPLATE
import base64
import os

#updated function to encode image to data URI

def encode_image_to_data_uri(path: str) -> str:
    """Read file and return a data URI (base64) that GPT-4 Vision can display."""
    ext = os.path.splitext(path)[1].lower().lstrip(".")
    mime = f"image/{'jpeg' if ext in ['jpg','jpeg'] else ext}"
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    return f"data:{mime};base64,{b64}"
# Route to serve the chat UI
@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/llm_call', methods=['POST'])
def llm_call():
    payload = request.get_json(force=True) or {}
    input_text = (payload.get("input_text") or "").strip()
    run_mode   = payload.get("api_mode", "local")      # <- was api_mode (string)
    model_id   = payload.get("model_id") 
    project_name = payload.get("project_name")
    image_path = (payload.get("image_path")or "")
    use_mode = (payload.get('use_mode') or "llm")
    system_prompt = (payload.get("system_prompt") or "").strip()
    context = True

    if not input_text:
            return jsonify({"error": "input_text is required"}), 400
    
    print(run_mode, model_id)
    client, completion_model, embedding_model = api_mode(run_mode, model_id)
    print(client, completion_model, embedding_model)
    
 
   
    
    if use_mode=='vlm':
        print("image_path")
        image_data_uri = encode_image_to_data_uri(image_path)
        response = query_vlm(client, completion_model, image_data_uri,input_text,system_prompt=system_prompt)
  
    if use_mode =='llm':
        response = query(client, completion_model, input_text, system_prompt=system_prompt)
        
    # context = get_recent_context(project_name, limit=2)
    # if context:
    #     convo = "\n".join([f"User: {u}\nAssistant: {a}" for u, a in context])
    #     full_prompt = f"Previous conversation:\n{convo}\n\nUser: {input_text}"
    # else:
    #     full_prompt = input_text
    # print(full_prompt)
    
    # response = query(client, completion_model, input_text, system_prompt=None)
    save_conversation(project_name, input_text, response)
    # print(response)
    
    return jsonify({'response': response})



if __name__ == '__main__':
    print("\n✨ Chat UI available at: http://localhost:5000\n")
    app.run(port=5000, debug=True)