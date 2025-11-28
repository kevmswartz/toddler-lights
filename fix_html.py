#!/usr/bin/env python3
"""Fix script loading order in index.html"""

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Alpine CDN with local version and reorder scripts
old_scripts = '''    <!-- Alpine.js for reactive state management -->
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    
    <!-- Shared modules and Tauri bridge (must load first) -->
    <script src="modules.js"></script>'''

new_scripts = '''    <!-- Shared modules and Tauri bridge (must load first, before app.js) -->
    <script src="modules.js"></script>
    
    <!-- Alpine.js for reactive state management (local copy to avoid tracking prevention) -->
    <script defer src="alpine.min.js"></script>'''

content = content.replace(old_scripts, new_scripts)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully updated index.html")
