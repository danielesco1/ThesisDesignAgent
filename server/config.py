from openai import OpenAI
from server.keys import *

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
    },
    "cloudflare": {
        "hermes-2-pro-7b": "@hf/nousresearch/hermes-2-pro-mistral-7b",
        "gpt-oss-20b": "@cf/openai/gpt-oss-20b",  # hosted by Cloudflare
    },
    "local": {  # LM Studio (OpenAI-compatible) or similar
        "llama3":   "lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF",
        "gemma3":   "lmstudio-community/google/gemma-3-12b-it-GGUF",
        "gemma3n":  "lmstudio-community/google/gemma-3n-e4b",
        "qwen25":   "RichardErkhov/abdulmannan-01_-_qwen-2.5-3b-finetuned-for-sql-generation-gguf",
        "gpt-oss-20b": "openai/gpt-oss-20b",      # LM Studio supports this repo id
    },
}

DEFAULT_COMPLETION = {"openai": "gpt-4o", "cloudflare": "hermes-2-pro-7b", "local": "llama3"}

def api_mode(mode="local", model=None):
    if mode not in CLIENTS:
        raise ValueError("mode must be one of: local, openai, cloudflare")
    if mode == "openai" and model and model.startswith("gpt-oss"):
        raise ValueError("`gpt-oss` isn’t available via OpenAI’s hosted API. Use mode='local' or 'cloudflare'.")
    models_for_mode = COMPLETION_MODELS[mode]
    key = model or DEFAULT_COMPLETION[mode]
    if key not in models_for_mode:
        raise ValueError(f"Unknown model for {mode}. Try one of: {', '.join(models_for_mode)}")
    return CLIENTS[mode], models_for_mode[key], EMBED_MODELS[mode]

# Example:
# client, completion_model, embedding_model = api_mode("cloudflare", model="gpt-oss-20b")
# client, completion_model, embedding_model = api_mode("local", model="gpt-oss-20b")
