from openai import OpenAI
from server.keys import *
import random

CLIENTS = {
    "openai":     OpenAI(api_key=OPENAI_API_KEY),
    "cloudflare": OpenAI(base_url=f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
                         api_key=CLOUDFLARE_API_KEY),
    "local":      OpenAI(base_url="http://127.0.0.1:1234/v1", api_key="lm-studio"),
}

EMBED_MODELS = {
    "openai": "text-embedding-3-small",
    "cloudflare": "@cf/baai/bge-base-en-v1.5",
    "local": "nomic-ai/nomic-embed-text-v1.5-GGUF",
}

COMPLETION_MODELS = {
    "openai": {  # OpenAI-hosted models only    
            "gpt-4o": "gpt-4o", 
            "gpt-5": "gpt-5-mini", 
    },
    "cloudflare": {
        "hermes-2-pro-7b": "@hf/nousresearch/hermes-2-pro-mistral-7b",
        "gpt-oss-20b": "@cf/openai/gpt-oss-20b",  # hosted by Cloudflare
    },
    "local": {  # LM Studio (OpenAI-compatible) or similar
        "llama3":   "lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF",
        "gemma3":   "lmstudio-community/google/gemma-3-12b-it-GGUF",
        "gpt-oss-20b": "openai/gpt-oss-20b",      # LM Studio supports this repo id
        "qwen2.5": "lmstudio-community/Qwen2.5-VL-7B-Instruct-GGUF",
        "deepseek": "lmstudio-community/DeepSeek-R1-0528-Qwen3-8B-GGUF",
        "qwen3": "lmstudio-community/Qwen3-4B-Thinking-2507-GGUF",
    },
}

DEFAULT_COMPLETION = {"openai": "gpt-4o", "cloudflare": "hermes-2-pro-7b", "local": "gpt-oss-20b"}

def api_mode(mode="local", model=None):
    # Check if mode is valid
    if mode not in CLIENTS:
        raise ValueError("mode must be one of: local, openai, cloudflare")
    
    # Get the client
    client = CLIENTS[mode]
    
    # Get the available models for this mode
    models_for_mode = COMPLETION_MODELS[mode]
    
    # Use the specified model or the default
    key = model or DEFAULT_COMPLETION[mode]
    
    # Check if the model exists
    if key not in models_for_mode:
        raise ValueError(f"Unknown model '{key}' for {mode}. Try one of: {', '.join(models_for_mode.keys())}")
    
    # Get the model strings
    completion_model = models_for_mode[key]
    embedding_model = EMBED_MODELS[mode]
    
    return client, completion_model, embedding_model
   

# def api_mode(mode="local", model=None):
#     if mode not in CLIENTS:
#         raise ValueError("mode must be one of: local, openai, cloudflare")
#     if mode == "openai":
#         model = "gpt-4o"
        
#     if mode == "local" and model in COMPLETION_MODELS["local"]:
#         models_for_mode = COMPLETION_MODELS[mode]
    
#     models_for_mode = COMPLETION_MODELS[mode]
#     key = model or DEFAULT_COMPLETION[mode]
#     if key not in models_for_mode:
#         raise ValueError(f"Unknown model for {mode}. Try one of: {', '.join(models_for_mode)}")
#     return CLIENTS[mode], models_for_mode[key], EMBED_MODELS[mode]

# Example:
# client, completion_model, embedding_model = api_mode("cloudflare", model="gpt-oss-20b")
# client, completion_model, embedding_model = api_mode("local", model="gpt-oss-20b")
