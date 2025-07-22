import json
import re

def process_response(response):
    # Try to extract JSON from response
    try:
        # Check if entire response is JSON
        data = json.loads(response)
        if isinstance(data, dict) and 'nodes' in data and 'edges' in data:
            return {
                'is_graph_request': True,
                'graph': data,
                'response': 'Here\'s your graph visualization:'
            }
    except:
        # Try to find JSON in the response text
        json_match = re.search(r'\{[\s\S]*"nodes"[\s\S]*"edges"[\s\S]*\}', response)
        if json_match:
            try:
                graph_data = json.loads(json_match.group())
                return {
                    'is_graph_request': True,
                    'graph': graph_data,
                    'response': 'Here\'s your graph visualization:'
                }
            except:
                pass
    
    # Regular text response
    return {
        'is_graph_request': False,
        'response': response
    }