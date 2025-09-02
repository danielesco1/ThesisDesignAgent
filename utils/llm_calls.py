from server.config import *
import re
import random
import json

def query_llm(message, system_prompt=None):
    """
    Query the LLM with a given prompt.
    - message: the user’s question or content
    - system_prompt: optional override of the system‐level instruction
    """
    # 1) Choose which system prompt to send
    default_system = """
        Respond to the user query in a concise manner that answers the question directly.

        If the user is asking for a graph, layout, or floor plan of a house/building, return ONLY valid JSON following this structure:

        EXAMPLE:
        {
          "nodes": [
            {"id": "living_room", "label": "Living Room", "type": "LivingRoom", "location": "center", "size": "L","floor":1},
            {"id": "kitchen", "label": "Kitchen", "type": "Kitchen", "location": "north", "size": "M","floor":1},
            {"id": "bedroom_1", "label": "Master Bedroom", "type": "MasterRoom", "location": "east", "size": "L","floor":1}
          ],
          "edges": [
            {"source": "living_room", "target": "kitchen", "type": "open"},
            {"source": "living_room", "target": "bedroom_1", "type": "door"}
          ]
        }

        Valid room types: LivingRoom, MasterRoom, Kitchen, Bathroom, DiningRoom, CommonRoom, SecondRoom, ChildRoom, StudyRoom, GuestRoom, Balcony, Entrance, Storage
        Valid locations: north, northeast, east, southeast, south, southwest, west, northwest, center
        Valid sizes: XS, S, M, L, XL
        Valid edge types: door, open, sliding_door

        Return ONLY the JSON object, no explanations or additional text.
        """
    system_content = system_prompt.strip() if system_prompt else default_system.strip()

    # 2) Call the API
    response = client.chat.completions.create(
        model=completion_model,
        messages=[
            {
                "role": "system",
                "content": system_content,
            },
            {
                "role": "user",
                "content": message,
            },
        ],
    )

    # 3) Clean up the output
    result = response.choices[0].message.content.strip()
    # remove stray markdown characters
    for ch in ["```", "`", "*","json"]:
        result = result.replace(ch, "")
    return result.strip()

def classify_message(message):
    """
    Ask the LLM whether `message` is a graph‐request or not.
    Returns: dict with key 'is_graph_request' (boolean).
    """
    response = client.chat.completions.create(
        model=completion_model,
        messages=[
            { "role": "system",  "content": CLASSIFY_SYSTEM_PROMPT },
            { "role": "user",    "content": message }
        ],
    )
    raw = response.choices[0].message.content.strip()
    # strip markdown just in case
    raw = raw.replace('```', '').replace('`', '').strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # fallback: assume false
        return {"is_graph_request": False}
      
# 1a) system prompt for classification
CLASSIFY_SYSTEM_PROMPT = """
You are a message classifier.  Given the user's message, decide whether they are asking 
for a graph output (nodes & edges) or a regular chat answer.

example:
user: "return Fallingwater into a graph relationship of the rooms"
is_graph_request: true
user: "what is the floor plan of the house?"
is_graph_request: false
user: "can you generate the graph of rooms for the famous house fallingwater by frank lloyd wright?"
is_graph_request: true

Output *only* JSON in this exact form, with no extra text:

{
  "is_graph_request": <true or false>
}
"""

GRAPH_SYSTEM_PROMPT = """
You are GraphExtractorGPT. For every user message, do the following steps *in order*:

1. Decide if the user is requesting a graph of nodes & edges (e.g. "return Fallingwater into a graph relationship of the rooms").
   - If yes, set "is_graph_request": true.
   - Otherwise, set "is_graph_request": false.

2. If it's a graph request, follow these architectural rules:
   - Each room connects to multiple adjacent rooms (not linear sequences)
   - Main circulation spaces (living room, hallways) have many connections
   - Private spaces (bedrooms, bathrooms) have fewer connections
   - Kitchen/service areas bridge public and private zones
   - Entry connects to living areas and vertical circulation
   - Bedrooms connect via hallways, not directly to public spaces

3. Output *only* a single JSON object matching this exact schema:

{
  "is_graph_request": <boolean>,
  "graph": {
    "nodes": [
      {
        "id": "<string unique node id>",
        "label": "<string human-readable label>",
        "type": "<circulation|public|private|service>",
        "x": <optional number>,
        "y": <optional number>,
        "z": <optional number>
      }
    ],
    "edges": [
      {
        "from": "<id of source node>",
        "to": "<id of target node>"
      }
    ]
  },
  "reason": "<string — only include if is_graph_request is false>"
}

4. Do *not* wrap the JSON in markdown, backticks, or any extra commentary. Return only JSON.

If not a graph request, set "nodes" and "edges" to empty arrays and explain in "reason".
"""

from server.config import *  # if you only need keys, import just those

def query(client, model, message, system_prompt=None, temperature=0.2):
    """
    Query the LLM with a given prompt.

    Args:
        client: an OpenAI-compatible client (OpenAI(...))
        model:  model id string (e.g., "openai/gpt-oss-20b")
        message: user content
        system_prompt: optional system message
        temperature: float
    """
    default_system = """
        Respond to the user query in a concise manner that answers the question directly.

    """.strip()

    system_content = (system_prompt or default_system)

    msgs = [{"role": "system", "content": system_content},
            {"role": "user", "content": message}]

    resp = client.chat.completions.create(
        model=model,
        messages=msgs,
        temperature=temperature,
    )

    out = resp.choices[0].message.content.strip()
    for ch in ["```", "`", "*", "json"]:
        out = out.replace(ch, "")
    return out.strip()


def query_vlm(client, model,image_path, message, system_prompt=None, temperature=0.2):
    """
    Query the LLM with a given prompt.

    Args:
        client: an OpenAI-compatible client (OpenAI(...))
        model:  model id string (e.g., "openai/gpt-oss-20b")
        message: user content
        system_prompt: optional system message
        temperature: float
    """
    default_system = """
        Respond to the user query in a concise manner that answers the question directly.

    """.strip()

    system_content = (system_prompt or default_system)

    messages=[
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": image_path,
                        "detail": "high"
                    },
                },
                {"type": "text", "text": message},
            ],
        },
    ]

    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
    )

    out = resp.choices[0].message.content.strip()
    for ch in ["```", "`", "*", "json"]:
        out = out.replace(ch, "")
    return out.strip()