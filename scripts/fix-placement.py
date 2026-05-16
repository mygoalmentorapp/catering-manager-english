"""
Fix the colorScheme placement issue: the script incorrectly placed
`const { colorScheme } = useThemeContext();` inside function parameter
destructuring instead of inside the function body.

Pattern to fix:
  function Foo({
    const { colorScheme } = useThemeContext();
    param1,
    ...
  }: { ... }) {

Should become:
  function Foo({
    param1,
    ...
  }: { ... }) {
    const { colorScheme } = useThemeContext();
"""
import re
import os

files = [
    "app/orders.tsx",
    "app/products.tsx",
    "app/shopping-list-edit.tsx",
    "app/shopping-list-view.tsx",
    "app/shopping-list.tsx",
    "app/shopping-lists.tsx",
    "app/changes-review.tsx",
]

base = "/home/ubuntu/catering-manager"
BAD_LINE = "  const { colorScheme } = useThemeContext();\n"

for f in files:
    path = os.path.join(base, f)
    with open(path, "r") as fh:
        lines = fh.readlines()
    
    new_lines = []
    i = 0
    fixed_count = 0
    while i < len(lines):
        # Check if this line is the bad placement (inside function params)
        if lines[i] == BAD_LINE:
            # Check if previous line is a function declaration with ({
            prev = new_lines[-1] if new_lines else ""
            if "function " in prev and prev.rstrip().endswith("({"):
                # Skip this line (remove from params)
                # Find the closing }) { pattern to insert after it
                # Continue reading until we find the function body opening
                i += 1
                # Collect remaining param lines until we find }) {
                body_start = None
                temp_lines = []
                while i < len(lines):
                    temp_lines.append(lines[i])
                    # Look for the closing of params: "}) {" or just ") {"
                    if re.match(r"^\}\)\s*\{", lines[i].strip()):
                        body_start = len(new_lines) + len(temp_lines)
                        break
                    i += 1
                new_lines.extend(temp_lines)
                # Insert colorScheme after the body opening
                new_lines.append("  const { colorScheme } = useThemeContext();\n")
                fixed_count += 1
                i += 1
            else:
                new_lines.append(lines[i])
                i += 1
        else:
            new_lines.append(lines[i])
            i += 1
    
    with open(path, "w") as fh:
        fh.writelines(new_lines)
    
    print(f"Fixed {fixed_count} placements in {f}")

print("Done!")
