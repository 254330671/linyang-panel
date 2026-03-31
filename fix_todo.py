import re

path = r"C:\Users\15040\.openclaw\workspace\linyang_panel\lib\screens\collab\todo_page.dart"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

bt = chr(96)  # backtick
old_pattern = r"replaceAll\('[^']*json',\s*''\)\.replaceAll\('[^']*'\s*,\s*''\)"
new_text = f"replaceAll('{bt}{bt}{bt}json', '').replaceAll('{bt}{bt}{bt}', '')"
content = re.sub(old_pattern, new_text, content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done")
