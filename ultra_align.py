import os
import re

def global_replace_patterns(directory, patterns):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(('.ts', '.tsx')):
                filepath = os.path.join(root, file)
                with open(filepath, 'r') as f:
                    content = f.read()
                
                new_content = content
                for search, replace in patterns:
                    new_content = re.sub(search, replace, new_content)
                
                if new_content != content:
                    with open(filepath, 'w') as f:
                        f.write(new_content)
                    print(f"Updated: {filepath}")

backend_dir = "backend/src/"
patterns = [
    (r'\bbuyerId\b', 'customerId'),
    (r'\bbuyer:', 'customer:'),
    (r'\bbuyer\b', 'customer'), # More aggressive
    (r'\bBuyer\b', 'Customer'),
]

global_replace_patterns(backend_dir, patterns)
print("Ultra global terminology alignment complete.")
