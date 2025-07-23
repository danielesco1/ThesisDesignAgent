import json
import re

def process_response(raw_text):
    """
    Normalize any LLM output into a single payload schema:
    {
      "response": <string>,              # always present (assistant text or placeholder)
      "is_graph_request": <bool>,        # always present
      "graph": <dict|None>               # nodes/edges or None
    }
    """
    def ok_graph(obj):
        return isinstance(obj, dict) and "nodes" in obj and "edges" in obj

    # 1) whole string is JSON
    try:
        data = json.loads(raw_text)
        if ok_graph(data):
            return {"response": "Here’s your graph visualization:", "is_graph_request": True, "graph": data}
    except Exception:
        pass

    # 2) find first {...} block with nodes/edges
    m = re.search(r'\{[\s\S]*?"nodes"[\s\S]*?"edges"[\s\S]*?\}', raw_text)
    if m:
        try:
            data = json.loads(m.group())
            if ok_graph(data):
                return {"response": "Here’s your graph visualization:", "is_graph_request": True, "graph": data}
        except Exception:
            pass

    # 3) fallback = plain text
    return {"response": raw_text, "is_graph_request": False, "graph": None}