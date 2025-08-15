import json


def extract_json_from_text(text):
    start = text.find('{')
    if start == -1:
        return None
    
    stack = []
    for i in range(start, len(text)):
        if text[i] == '{':
            stack.append('{')
        elif text[i] == '}':
            stack.pop()
            if not stack:
                end = i
                break
    else:
        return None

    json_text = text[start:end + 1]
    return json_text